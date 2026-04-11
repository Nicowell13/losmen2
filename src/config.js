require('dotenv').config();

module.exports = {
  // Info Losmen
  losmen: {
    name: process.env.LOSMEN_NAME || 'Losmen',
    address: process.env.LOSMEN_ADDRESS || 'Belum diset',
    mapsLink: process.env.LOSMEN_MAPS_LINK || '',
    phone: process.env.LOSMEN_PHONE || ''
  },

  // Jam Operasional
  operasional: {
    jamBuka: parseInt(process.env.JAM_BUKA) || 6,
    jamTutup: parseInt(process.env.JAM_TUTUP) || 23
  },

  // Ollama
  ollama: {
    url: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.LLM_MODEL || 'qwen2.5:1.5b',
    timeout: 15000 // 15 detik maks, jika lewat → fallback
  },

  // Google Sheets
  sheets: {
    clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
    sheetId: process.env.GOOGLE_SHEET_ID
  }
};
