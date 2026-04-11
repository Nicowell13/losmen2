const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const config = require('./config');

// ============================================================
// In-Memory Cache — bot membaca dari sini (<1ms)
// ============================================================
let cachedData = {
  kamar: [],
  info: {},
  terakhirDiperbarui: null
};

/**
 * Mock Data: Digunakan jika Google Sheets belum dikonfigurasi.
 * Anda tetap bisa test bot dengan data palsu ini.
 */
const mockData = [
  { tipe: "Standard", harga: 150000, tersedia: 2, fasilitas: "Kipas Angin, Kamar Mandi Luar" },
  { tipe: "Deluxe", harga: 250000, tersedia: 0, fasilitas: "AC, TV, Kamar Mandi Dalam" },
  { tipe: "VIP", harga: 350000, tersedia: 1, fasilitas: "AC, Kulkas, Water Heater, Sarapan" }
];

/**
 * Sinkron data dari Google Sheets ke RAM.
 */
async function updateCache() {
  const { clientEmail, privateKey, sheetId } = config.sheets;

  // Jika kredensial belum diset, pakai mock
  if (!clientEmail || !privateKey || privateKey.includes('...') || !sheetId) {
    console.log("[Sheets] Kredensial belum diset → pakai Mock Data.");
    cachedData.kamar = mockData;
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

    // --- Sheet 1: Ketersediaan Kamar ---
    const sheetKamar = doc.sheetsByIndex[0];
    const rows = await sheetKamar.getRows();

    const parsedKamar = rows.map(row => ({
      tipe: row.get('Tipe Kamar') || '',
      harga: parseInt(row.get('Harga')) || 0,
      tersedia: parseInt(row.get('Tersedia')) || 0,
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

    cachedData.terakhirDiperbarui = new Date();
    console.log(`[Sheets] Cache updated! ${parsedKamar.length} tipe kamar dimuat.`);
  } catch (err) {
    console.error("[Sheets Error]", err.message);
    // Jika gagal & cache masih kosong, fallback ke mock
    if (cachedData.kamar.length === 0) {
      console.log("[Sheets] Fallback ke Mock Data.");
      cachedData.kamar = mockData;
    }
  }
}

// Auto-refresh setiap 5 menit
setInterval(updateCache, 5 * 60 * 1000);

// Isi cache pertama kali saat startup
updateCache();

function getAvailabilityData() {
  return cachedData.kamar;
}

function getInfoData() {
  return cachedData.info;
}

module.exports = {
  getAvailabilityData,
  getInfoData,
  updateCache
};
