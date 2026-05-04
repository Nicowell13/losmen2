const llm = require('./llm');
const sheets = require('./db'); // PostgreSQL (same interface as old sheets.js)
const config = require('./config');

// ============================================================
// Anti-Spam: Cooldown 3 detik per user
// (Catatan: ini tetap di-memory Node.js sebagai front-defense ringan)
// ============================================================
const userCooldowns = new Map();
const COOLDOWN_MS = 3000;

function isSpamming(userPhone) {
  const now = Date.now();
  const lastMsg = userCooldowns.get(userPhone) || 0;
  if (now - lastMsg < COOLDOWN_MS) return true;
  userCooldowns.set(userPhone, now);
  return false;
}

setInterval(() => userCooldowns.clear(), 10 * 60 * 1000);

// ============================================================
// Greeting: Simpan user yang sudah pernah chat
// ============================================================
const greetedUsers = new Set();
setInterval(() => greetedUsers.clear(), 24 * 60 * 60 * 1000);

// ============================================================
// Cek Jam Operasional
// ============================================================
function isDiluarJamOperasional() {
  const now = new Date();
  // Konversi ke WIB (UTC+7)
  const wibHour = (now.getUTCHours() + 7) % 24;
  return wibHour < config.operasional.jamBuka || wibHour >= config.operasional.jamTutup;
}

// ============================================================
// Ekstrak tanggal dari pesan user (Bahasa Indonesia)
// Mendukung: "besok", "lusa", "tanggal 15", "15 April", "15/04/2026", dll.
// ============================================================
function extractDateFromText(text) {
  const lower = text.toLowerCase();

  // Waktu sekarang dalam WIB
  const now = new Date();
  const wibOffset = 7 * 60; // menit
  const wibNow = new Date(now.getTime() + (wibOffset - now.getTimezoneOffset()) * 60000);
  const today = new Date(wibNow.getFullYear(), wibNow.getMonth(), wibNow.getDate());

  // --- Kata kunci relatif ---
  if (/\b(hari ini|sekarang|saat ini|malam ini|siang ini)\b/.test(lower)) {
    return { date: today, label: 'hari ini' };
  }
  if (/\b(besok|besuk|bsk)\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    return { date: d, label: 'besok' };
  }
  if (/\b(lusa|besok lusa)\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 2);
    return { date: d, label: 'lusa' };
  }
  if (/\b(minggu depan|pekan depan|week depan)\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 7);
    return { date: d, label: 'minggu depan' };
  }

  // --- Nama hari (Senin, Selasa, dll.) ---
  const namaHari = { 'senin': 1, 'selasa': 2, 'rabu': 3, 'kamis': 4, 'jumat': 5, 'sabtu': 6, 'minggu': 0 };
  for (const [nama, dayIdx] of Object.entries(namaHari)) {
    const regex = new RegExp(`\\b(hari\\s+)?${nama}\\b`);
    if (regex.test(lower)) {
      const todayDay = today.getDay();
      let diff = dayIdx - todayDay;
      if (diff <= 0) diff += 7; // Selalu ke depan
      const d = new Date(today); d.setDate(d.getDate() + diff);
      return { date: d, label: `hari ${nama.charAt(0).toUpperCase() + nama.slice(1)}` };
    }
  }

  // --- Nama bulan Indonesia ---
  const bulanMap = {
    'januari': 0, 'jan': 0, 'februari': 1, 'feb': 1, 'maret': 2, 'mar': 2,
    'april': 3, 'apr': 3, 'mei': 4, 'juni': 5, 'jun': 5,
    'juli': 6, 'jul': 6, 'agustus': 7, 'ags': 7, 'agu': 7,
    'september': 8, 'sep': 8, 'sept': 8, 'oktober': 9, 'okt': 9,
    'november': 10, 'nov': 10, 'desember': 11, 'des': 11
  };

  // Format: "tanggal 15 April" atau "15 April 2026" atau "tgl 15 apr"
  for (const [namaBulan, bulanIdx] of Object.entries(bulanMap)) {
    const regex = new RegExp(`(?:tanggal|tgl|tg)?\\s*(\\d{1,2})\\s+${namaBulan}(?:\\s+(\\d{4}))?`, 'i');
    const match = lower.match(regex);
    if (match) {
      const day = parseInt(match[1]);
      const year = match[2] ? parseInt(match[2]) : wibNow.getFullYear();
      const d = new Date(year, bulanIdx, day);
      return { date: d, label: `tanggal ${day} ${namaBulan.charAt(0).toUpperCase() + namaBulan.slice(1)}` };
    }
  }

  // Format: "tanggal 15" (tanpa bulan → bulan ini atau bulan depan jika sudah lewat)
  const tglMatch = lower.match(/(?:tanggal|tgl|tg)\s+(\d{1,2})/);
  if (tglMatch) {
    const day = parseInt(tglMatch[1]);
    let d = new Date(wibNow.getFullYear(), wibNow.getMonth(), day);
    // Jika tanggal sudah lewat, pakai bulan depan
    if (d < today) {
      d.setMonth(d.getMonth() + 1);
    }
    return { date: d, label: `tanggal ${day}` };
  }

  // Format: dd/mm/yyyy atau dd-mm-yyyy
  const slashMatch = lower.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashMatch) {
    const d = new Date(parseInt(slashMatch[3]), parseInt(slashMatch[2]) - 1, parseInt(slashMatch[1]));
    return { date: d, label: sheets.formatDate(d) };
  }

  return null; // Tidak ada tanggal terdeteksi
}

// ============================================================
// Logic Utama Pemroses Pesan (Dipanggil oleh Queue / Redis Worker)
// ============================================================
async function processMessageLogic(userText, userPhone) {
  // Cek anti-spam
  if (isSpamming(userPhone)) {
    return null; // Abaikan spam
  }

  // Cek jam operasional
  if (isDiluarJamOperasional()) {
    return `Halo Kak 🙏 Terima kasih sudah menghubungi ${config.losmen.name}.\nSaat ini admin sedang istirahat (jam operasional ${config.operasional.jamBuka}:00 - ${config.operasional.jamTutup}:00 WIB).\nPesan Kakak akan kami balas besok pagi ya! 😊`;
  }

  const startTime = Date.now();

  // --- Greeting untuk tamu baru ---
  if (!greetedUsers.has(userPhone)) {
    greetedUsers.add(userPhone);
    const intent = await llm.detectIntent(userText);
    if (intent === 'greeting') {
      const csName = config.losmen.csName;
      console.log(`[Handler] Tamu baru (${userPhone}) → Greeting (${Date.now() - startTime}ms)`);
      return `Haii Kak! 😊 Perkenalkan, aku ${csName} dari *${config.losmen.name}*.\nAda yang bisa aku bantu? Kakak bisa tanya tentang:\n\n📋 *Ketersediaan* kamar (bisa tanya per tanggal!)\n💰 *Harga* kamar\n📍 *Lokasi* kami\n🏨 *Fasilitas* yang ada\n📝 *Booking* kamar\n\nSilakan langsung ketik aja ya Kak! 🙏\n- ${csName} 💛`;
    }
  }

  // 1. Deteksi Intent
  const intent = await llm.detectIntent(userText);
  console.log(`[Handler] Intent: ${intent} (${Date.now() - startTime}ms)`);

  // 2. Ambil Data dari Cache Sheets
  let contextData = [];

  switch (intent) {
    case 'tanya_harga':
      contextData = sheets.getAvailabilityData();
      break;

    case 'tanya_ketersediaan': {
      // Coba ekstrak tanggal dari pesan user
      const dateInfo = extractDateFromText(userText);

      if (dateInfo) {
        // User menanyakan tanggal spesifik → cek ketersediaan per tanggal
        const availability = sheets.getAvailabilityByDate(dateInfo.date);
        const tanggalStr = sheets.formatDate(dateInfo.date);
        contextData = `[KETERSEDIAAN TANGGAL ${tanggalStr} (${dateInfo.label})]\n` +
          availability.map(k => {
            if (k.tersedia > 0) {
              return `> Kamar ${k.tipe}: TERSEDIA ${k.tersedia} dari ${k.totalKamar} kamar. Harga: Rp${k.harga.toLocaleString('id-ID')}/bulan. Fasilitas: ${k.fasilitas}`;
            } else {
              return `> Kamar ${k.tipe}: PENUH (semua ${k.totalKamar} kamar terisi). Jangan ditawarkan.`;
            }
          }).join('\n');
        console.log(`[Handler] Cek ketersediaan tanggal: ${tanggalStr}`);
      } else {
        // Tidak ada tanggal spesifik → tampilkan kalender 1 minggu ke depan
        const weeklyData = sheets.getWeeklyAvailability();
        contextData = `[KALENDER KETERSEDIAAN 7 HARI KE DEPAN]\n${weeklyData}`;
        console.log(`[Handler] Tampilkan kalender 1 minggu`);
      }
      break;
    }

    case 'faq_lokasi':
      contextData = `${config.losmen.name} berlokasi di ${config.losmen.address}.\nLink Google Maps: ${config.losmen.mapsLink}`;
      break;

    case 'faq_fasilitas': {
      const allRooms = sheets.getAvailabilityData();
      contextData = allRooms.map(k => `- ${k.tipe}: ${k.fasilitas}`).join('\n');
      break;
    }

    case 'faq_checkin': {
      const info = sheets.getInfoData();
      contextData = info['checkin'] || 'Check-in: 14:00, Check-out: 12:00';
      break;
    }

    case 'greeting':
      return `Haii Kak! 😊 Ada yang bisa aku bantu? Tanya aja soal harga, ketersediaan, atau langsung booking ya!\n- ${config.losmen.csName} 💛`;

    case 'booking': {
      // Cek ketersediaan pada tanggal yang diminta untuk booking
      const dateInfo = extractDateFromText(userText);
      const formLink = config.losmen.bookingFormLink;

      if (dateInfo) {
        const availability = sheets.getAvailabilityByDate(dateInfo.date);
        const tanggalStr = sheets.formatDate(dateInfo.date);
        const adaKosong = availability.some(k => k.tersedia > 0);

        if (adaKosong) {
          contextData = `[DATA KETERSEDIAAN UNTUK BOOKING TANGGAL ${tanggalStr}]\n` +
            availability.map(k => {
              if (k.tersedia > 0) {
                return `> Kamar ${k.tipe}: TERSEDIA ${k.tersedia} kamar. Harga: Rp${k.harga.toLocaleString('id-ID')}/bulan.`;
              } else {
                return `> Kamar ${k.tipe}: PENUH.`;
              }
            }).join('\n') +
            (formLink ? `\n\n[LINK BOOKING]: ${formLink}` : '');
        } else {
          contextData = `[SEMUA KAMAR PENUH TANGGAL ${tanggalStr}]\nSemua tipe kamar penuh pada tanggal ini. Sarankan tanggal lain.`;
        }
      } else {
        if (formLink) {
          return `Wah senangnya Kakak tertarik untuk ngekos di *${config.losmen.name}*! 🥰\n\nUntuk reservasi/pendaftaran, silakan isi formulir di link berikut ya Kak:\n👉 ${formLink}\n\nSetelah Kakak isi, aku akan konfirmasi langsung lewat chat ini ya. Kalau ada pertanyaan, jangan ragu bilang aja! 😊\n- ${config.losmen.csName} 💛`;
        }
        contextData = 'Tamu ingin melakukan booking/reservasi kamar.';
      }
      break;
    }

    default:
      contextData = [];
  }

  // 3. Generate Respons Natural dengan LLM
  const replyText = await llm.generateResponse(intent, userText, contextData, userPhone);

  const totalTime = Date.now() - startTime;
  console.log(`[Handler] Selesai proses (${totalTime}ms) untuk: ${userPhone}`);

  return replyText;
}

module.exports = {
  processMessageLogic,
  extractDateFromText  // export untuk testing
};
