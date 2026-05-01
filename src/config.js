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

  // Ollama (Qwen 2.5 1.5B)
  ollama: {
    url: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.LLM_MODEL || 'qwen2.5:1.5b',
    timeout: 120000 // 120 detik — untuk mengakomodasi prompt history yang lebih panjang
  },

  // PostgreSQL Database
  database: {
    url: process.env.DATABASE_URL || 'postgresql://losmen:losmen123@localhost:5432/losmen_db'
  },

  // JWT Authentication
  jwt: {
    secret: process.env.JWT_SECRET || 'losmen-jwt-secret-2026',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || '*'
  }
};
