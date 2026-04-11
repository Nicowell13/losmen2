const axios = require('axios');
const config = require('./config');

/**
 * Kirim balasan teks via API WAHA
 * @param {string} to Nomor tujuan (misal: '628xxx@c.us')
 * @param {string} text Teks balasan
 */
async function sendReply(to, text) {
  try {
    const wahaUrl = `${config.waha.url}/api/sendText`;
    const payload = {
      session: config.waha.session,
      chatId: to,
      text: text
    };
    
    await axios.post(wahaUrl, payload);
    console.log(`[📤 WhatsApp] Pesan terkirim ke ${to}`);
  } catch (error) {
    console.error(`[❌ WAHA Send Error] Gagal kirim ke ${to}:`, error.message);
  }
}

/**
 * Set status "Sedang mengetik" via API WAHA
 * @param {string} to Nomor tujuan
 */
async function sendPresence(to) {
  try {
    const wahaUrl = `${config.waha.url}/api/sendPresence`;
    const payload = {
      session: config.waha.session,
      chatId: to,
      presence: "composing"
    };
    
    await axios.post(wahaUrl, payload);
  } catch (error) {
    // Abaikan jika error presence karena tidak vital
  }
}

module.exports = {
  sendReply,
  sendPresence
};
