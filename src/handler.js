const llm = require('./llm');
const sheets = require('./sheets');
const config = require('./config');

// ============================================================
// Anti-Spam: Cooldown 3 detik per user
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

// Bersihkan map setiap 10 menit agar tidak memory leak
setInterval(() => userCooldowns.clear(), 10 * 60 * 1000);

// ============================================================
// Antrian Pesan: Proses satu per satu agar Ollama tidak overload
// ============================================================
let isProcessing = false;
const messageQueue = [];

async function enqueueMessage(userText, userPhone) {
  return new Promise((resolve) => {
    messageQueue.push({ userText, userPhone, resolve });
    processQueue();
  });
}

async function processQueue() {
  if (isProcessing || messageQueue.length === 0) return;
  isProcessing = true;

  const { userText, userPhone, resolve } = messageQueue.shift();
  try {
    const reply = await _handleMessage(userText, userPhone);
    resolve(reply);
  } catch (err) {
    console.error("[Queue Error]", err.message);
    resolve("Mohon maaf Kak, terjadi gangguan. Silakan coba lagi ya 🙏");
  }

  isProcessing = false;
  processQueue(); // Lanjut ke pesan berikutnya
}

// ============================================================
// Greeting: Simpan user yang sudah pernah chat
// ============================================================
const greetedUsers = new Set();

// Bersihkan set setiap 24 jam
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
// Handler Utama (DIPANGGIL DARI bot.js)
// ============================================================

/**
 * Entry point publik — dengan anti-spam + antrian.
 */
async function handleMessage(userText, userPhone) {
  // Cek anti-spam
  if (isSpamming(userPhone)) {
    return null; // Abaikan tanpa balas
  }

  // Cek jam operasional
  if (isDiluarJamOperasional()) {
    return `Halo Kak 🙏 Terima kasih sudah menghubungi ${config.losmen.name}.\nSaat ini admin sedang istirahat (jam operasional ${config.operasional.jamBuka}:00 - ${config.operasional.jamTutup}:00 WIB).\nPesan Kakak akan kami balas besok pagi ya! 😊`;
  }

  // Masukkan ke antrian
  return enqueueMessage(userText, userPhone);
}

/**
 * Logic utama hybrid — dipanggil dari antrian.
 */
async function _handleMessage(userText, userPhone) {
  const startTime = Date.now();

  // --- Greeting untuk tamu baru ---
  if (!greetedUsers.has(userPhone)) {
    greetedUsers.add(userPhone);
    const losmenName = config.losmen.name;
    // Cek apakah pesan pertama juga ada pertanyaan, jika hanya sapaan → kirim greeting saja
    const intent = await llm.detectIntent(userText);
    if (intent === 'greeting') {
      console.log(`[Handler] Tamu baru (${userPhone}) → Greeting (${Date.now() - startTime}ms)`);
      return `Halo Kak! 😊 Selamat datang di *${losmenName}*.\nAda yang bisa kami bantu? Kakak bisa tanya tentang:\n\n📋 *Ketersediaan* kamar\n💰 *Harga* kamar\n📍 *Lokasi* kami\n🏨 *Fasilitas* yang ada\n\nSilakan langsung ketik pertanyaannya ya! 🙏`;
    }
    // Jika bukan greeting murni, lanjut proses seperti biasa
  }

  // 1. Deteksi Intent
  const intent = await llm.detectIntent(userText);
  console.log(`[Handler] Intent: ${intent} (${Date.now() - startTime}ms)`);

  // 2. Ambil Data dari Cache
  let contextData = [];

  switch (intent) {
    case 'tanya_harga':
    case 'tanya_ketersediaan':
      contextData = sheets.getAvailabilityData();
      break;

    case 'faq_lokasi':
      contextData = `${config.losmen.name} berlokasi di ${config.losmen.address}.\nLink Google Maps: ${config.losmen.mapsLink}`;
      break;

    case 'faq_fasilitas':
      // Gabungkan fasilitas dari semua tipe kamar
      const allRooms = sheets.getAvailabilityData();
      contextData = allRooms.map(k => `- ${k.tipe}: ${k.fasilitas}`).join('\n');
      break;

    case 'faq_checkin':
      const info = sheets.getInfoData();
      contextData = info['checkin'] || 'Check-in: 14:00, Check-out: 12:00';
      break;

    case 'greeting':
      // Sudah di-handle di atas, ini fallback
      return `Halo Kak! 😊 Ada yang bisa dibantu? Silakan tanya soal harga, ketersediaan, atau lokasi kami ya!`;

    default:
      contextData = [];
  }

  // 3. Generate Respons Natural
  const replyText = await llm.generateResponse(intent, userText, contextData);

  const totalTime = Date.now() - startTime;
  console.log(`[Handler] Dibalas dalam ${totalTime}ms`);

  return replyText;
}

module.exports = {
  handleMessage
};
