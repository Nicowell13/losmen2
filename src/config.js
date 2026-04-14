require('dotenv').config();

module.exports = {
  // Info Losmen
  losmen: {
    name: process.env.LOSMEN_NAME || 'Losmen',
    address: process.env.LOSMEN_ADDRESS || 'Belum diset',
    mapsLink: process.env.LOSMEN_MAPS_LINK || '',
    phone: process.env.LOSMEN_PHONE || '',
    csName: process.env.CS_NAME || 'Sari',
    bookingFormLink: process.env.BOOKING_FORM_LINK || ''
  },

  // Jam Operasional
  operasional: {
    jamBuka: parseInt(process.env.JAM_BUKA) || 6,
    jamTutup: parseInt(process.env.JAM_TUTUP) || 23
  },

  // WAHA Endpoint
  waha: {
    url: process.env.WAHA_URL || 'http://localhost:3000',
    session: process.env.WAHA_SESSION || 'default',
    apiKey: process.env.WAHA_API_KEY || ''
  },

  // Redis Queue
  redis: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
  },

  // Ollama
  ollama: {
    url: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.LLM_MODEL || 'phi3:mini',
    timeout: 60000 // 60 detik maks untuk phi3 yang lebih besar
  },

  // Google Sheets
  sheets: {
    clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
    sheetId: process.env.GOOGLE_SHEET_ID
  }
};
