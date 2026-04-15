const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const config = require('./config');

// ============================================================
// In-Memory Cache — bot membaca dari sini (<1ms)
// ============================================================
let cachedData = {
  kamar: [],
  booking: [],
  info: {},
  terakhirDiperbarui: null
};

/**
 * Mock Data: Digunakan jika Google Sheets belum dikonfigurasi.
 */
const mockKamar = [
  { tipe: "Standard", harga: 150000, totalKamar: 3, fasilitas: "Kipas Angin, Kamar Mandi Luar" },
  { tipe: "Deluxe", harga: 250000, totalKamar: 2, fasilitas: "AC, TV, Kamar Mandi Dalam" },
  { tipe: "VIP", harga: 350000, totalKamar: 1, fasilitas: "AC, Kulkas, Water Heater, Sarapan" }
];

const mockBooking = [
  { namaTamu: "Budi", noHp: "628111222333", tipeKamar: "Deluxe", checkIn: "2026-04-15", checkOut: "2026-04-17", status: "Confirmed" },
  { namaTamu: "Ani", noHp: "628444555666", tipeKamar: "Deluxe", checkIn: "2026-04-16", checkOut: "2026-04-18", status: "Confirmed" },
  { namaTamu: "Rudi", noHp: "628777888999", tipeKamar: "VIP", checkIn: "2026-04-14", checkOut: "2026-04-16", status: "Checked In" }
];

// ============================================================
// Helper: Parse tanggal fleksibel (dd/mm/yyyy, yyyy-mm-dd, dd-mm-yyyy)
// ============================================================
function parseFlexDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = dateStr.trim();

  // Format yyyy-mm-dd
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00+07:00');
    return isNaN(d) ? null : d;
  }

  // Format dd/mm/yyyy atau dd-mm-yyyy
  const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    const d = new Date(`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}T00:00:00+07:00`);
    return isNaN(d) ? null : d;
  }

  return null;
}

// ============================================================
// Helper: Format tanggal ke string dd/mm/yyyy
// ============================================================
function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// ============================================================
// Helper: Nama hari dalam Bahasa Indonesia
// ============================================================
function getNamaHari(date) {
  const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return hari[new Date(date).getDay()];
}

/**
 * Sinkron data dari Google Sheets ke RAM.
 */
async function updateCache() {
  const { clientEmail, privateKey, sheetId } = config.sheets;

  // Jika kredensial belum diset, pakai mock
  if (!clientEmail || !privateKey || privateKey.includes('...') || !sheetId) {
    console.log("[Sheets] Kredensial belum diset → pakai Mock Data.");
    cachedData.kamar = mockKamar;
    cachedData.booking = mockBooking;
    cachedData.terakhirDiperbarui = new Date();
    return;
  }

  try {
    // google-spreadsheet v4+ menggunakan JWT auth
    const serviceAccountAuth = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);
    await doc.loadInfo();

    // --- Sheet 1: Data Kamar ---
    const sheetKamar = doc.sheetsByIndex[0];
    const rows = await sheetKamar.getRows();

    const parsedKamar = rows.map(row => ({
      tipe: row.get('Tipe Kamar') || '',
      harga: parseInt(row.get('Harga')) || 0,
      totalKamar: parseInt(row.get('Total Kamar')) || 0,
      fasilitas: row.get('Fasilitas') || ''
    })).filter(k => k.tipe); // skip baris kosong

    cachedData.kamar = parsedKamar;

    // --- Sheet 2 (Opsional): Info Losmen ---
    if (doc.sheetsByIndex[1]) {
      const sheetInfo = doc.sheetsByIndex[1];
      const infoRows = await sheetInfo.getRows();
      const infoMap = {};
      infoRows.forEach(row => {
        const key = row.get('Key');
        const value = row.get('Value');
        if (key && value) infoMap[key.toLowerCase()] = value;
      });
      cachedData.info = infoMap;
    }

    // --- Sheet 3: Data Booking ---
    if (doc.sheetsByIndex[2]) {
      const sheetBooking = doc.sheetsByIndex[2];
      const bookingRows = await sheetBooking.getRows();

      const parsedBooking = bookingRows.map(row => ({
        namaTamu: row.get('Nama Tamu') || '',
        noHp: row.get('No HP') || '',
        tipeKamar: row.get('Tipe Kamar') || '',
        checkIn: row.get('Check In') || '',
        checkOut: row.get('Check Out') || '',
        status: (row.get('Status') || '').toLowerCase()
      })).filter(b => b.namaTamu && b.checkIn && b.checkOut);

      cachedData.booking = parsedBooking;
      console.log(`[Sheets] ${parsedBooking.length} data booking dimuat.`);
    }

    cachedData.terakhirDiperbarui = new Date();
    console.log(`[Sheets] Cache updated! ${parsedKamar.length} tipe kamar dimuat.`);
  } catch (err) {
    console.error("[Sheets Error]", err.message);
    // Jika gagal & cache masih kosong, fallback ke mock
    if (cachedData.kamar.length === 0) {
      console.log("[Sheets] Fallback ke Mock Data.");
      cachedData.kamar = mockKamar;
      cachedData.booking = mockBooking;
    }
  }
}

// Auto-refresh setiap 5 menit
setInterval(updateCache, 5 * 60 * 1000);

// Isi cache pertama kali saat startup
updateCache();

// ============================================================
// Fungsi: Hitung booking aktif pada tanggal tertentu per tipe kamar
// Booking "aktif" = status confirmed / checked in (bukan cancelled/checked out)
// Logika: checkIn <= tanggal < checkOut
// ============================================================
function countActiveBookings(targetDate) {
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  const counts = {}; // { "Deluxe": 2, "VIP": 1, ... }

  cachedData.booking.forEach(b => {
    // Hanya hitung booking aktif (confirmed / checked in)
    const status = b.status.toLowerCase();
    if (status === 'cancelled' || status === 'batal' || status === 'checked out' || status === 'selesai') {
      return;
    }

    const ci = parseFlexDate(b.checkIn);
    const co = parseFlexDate(b.checkOut);
    if (!ci || !co) return;

    ci.setHours(0, 0, 0, 0);
    co.setHours(0, 0, 0, 0);

    // Tamu menginap dari check-in sampai sebelum check-out
    if (target >= ci && target < co) {
      const tipe = b.tipeKamar.trim();
      counts[tipe] = (counts[tipe] || 0) + 1;
    }
  });

  return counts;
}

// ============================================================
// Fungsi: Cek ketersediaan kamar pada tanggal tertentu
// Return: Array objek per tipe kamar dengan sisa kamar tersedia
// ============================================================
function getAvailabilityByDate(targetDate) {
  const bookingCounts = countActiveBookings(targetDate);

  return cachedData.kamar.map(k => {
    const terpakai = bookingCounts[k.tipe] || 0;
    const tersedia = Math.max(0, k.totalKamar - terpakai);

    return {
      tipe: k.tipe,
      harga: k.harga,
      totalKamar: k.totalKamar,
      terpakai: terpakai,
      tersedia: tersedia,
      fasilitas: k.fasilitas
    };
  });
}

// ============================================================
// Fungsi: Kalender ketersediaan 7 hari ke depan
// Return: String ringkasan untuk dikirim ke LLM/user
// ============================================================
function getWeeklyAvailability(startDate) {
  const start = startDate ? new Date(startDate) : new Date();
  start.setHours(0, 0, 0, 0);

  let result = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);

    const namaHari = getNamaHari(date);
    const tanggal = formatDate(date);
    const availability = getAvailabilityByDate(date);

    const summary = availability.map(k => {
      if (k.tersedia > 0) {
        return `  • ${k.tipe}: ${k.tersedia}/${k.totalKamar} kamar kosong (Rp${k.harga.toLocaleString('id-ID')}/malam)`;
      } else {
        return `  • ${k.tipe}: PENUH`;
      }
    }).join('\n');

    result.push(`📅 ${namaHari}, ${tanggal}:\n${summary}`);
  }

  return result.join('\n\n');
}

// ============================================================
// Fungsi lama (backward compatible) — sekarang pakai totalKamar
// ============================================================
function getAvailabilityData() {
  // Untuk kompatibilitas mundur, hitung ketersediaan hari ini
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return getAvailabilityByDate(today);
}

function getInfoData() {
  return cachedData.info;
}

function getBookingData() {
  return cachedData.booking;
}

module.exports = {
  getAvailabilityData,
  getAvailabilityByDate,
  getWeeklyAvailability,
  getBookingData,
  getInfoData,
  updateCache,
  parseFlexDate,
  formatDate
};
