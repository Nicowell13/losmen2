const { sendReply } = require('./waha');
const config = require('./config');

// ============================================================
// Conversation Memory — Simpan 10 pesan terakhir per user
// ============================================================
const conversations = new Map();
const closeTimers = new Map();

const MAX_MESSAGES = 10;        // Maksimal 10 pesan dalam memory
const CLOSE_TIMEOUT = 5 * 60 * 1000; // 5 menit
const CLEANUP_INTERVAL = 30 * 60 * 1000; // Bersihkan memory setiap 30 menit

/**
 * Ambil riwayat percakapan user
 * @returns {Array} [{role: 'user'|'assistant', content: string}]
 */
function getHistory(userPhone) {
  const conv = conversations.get(userPhone);
  if (!conv) return [];
  return conv.messages;
}

/**
 * Tambah pesan ke riwayat percakapan
 */
function addMessage(userPhone, role, content) {
  if (!conversations.has(userPhone)) {
    conversations.set(userPhone, {
      messages: [],
      lastActivity: Date.now(),
    });
  }

  const conv = conversations.get(userPhone);
  conv.messages.push({ role, content });
  conv.lastActivity = Date.now();

  // Batasi hanya 10 pesan terakhir
  if (conv.messages.length > MAX_MESSAGES) {
    conv.messages = conv.messages.slice(-MAX_MESSAGES);
  }
}

/**
 * Format riwayat percakapan untuk dikirim ke LLM
 * @returns {string} Riwayat percakapan dalam format teks
 */
function formatHistoryForLLM(userPhone) {
  const history = getHistory(userPhone);
  if (history.length === 0) return '';

  // Hanya ambil pesan sebelumnya (bukan pesan terakhir yang sedang diproses)
  const previousMessages = history.slice(0, -1);
  if (previousMessages.length === 0) return '';

  const formatted = previousMessages.map(msg => {
    const label = msg.role === 'user' ? 'Tamu' : config.losmen.csName;
    return `${label}: "${msg.content}"`;
  }).join('\n');

  return `[RIWAYAT CHAT SEBELUMNYA (${previousMessages.length} pesan)]\n${formatted}\n\n`;
}

/**
 * Set timer auto-close percakapan setelah 5 menit
 * Jika user tidak membalas dalam 5 menit, kirim pesan penutup
 */
function setCloseTimer(userPhone) {
  // Clear timer sebelumnya (jika ada)
  clearCloseTimer(userPhone);

  const timer = setTimeout(async () => {
    try {
      const csName = config.losmen.csName || 'Sari';
      const closingMsg = `Terima kasih sudah menghubungi *${config.losmen.name}* ya Kak! 😊\n\nJika ada pertanyaan lain, jangan ragu untuk chat kami lagi kapan saja. Kami siap membantu! 🙏\n\nSalam hangat,\n- ${csName} 💛`;

      await sendReply(userPhone, closingMsg);
      console.log(`[Memory] Auto-close percakapan: ${userPhone} (5 menit tidak aktif)`);

      // Hapus percakapan dari memory
      conversations.delete(userPhone);
      closeTimers.delete(userPhone);
    } catch (err) {
      console.error('[Memory] Gagal kirim pesan penutup:', err.message);
    }
  }, CLOSE_TIMEOUT);

  closeTimers.set(userPhone, timer);
}

/**
 * Clear timer auto-close (dipanggil saat user mengirim pesan baru)
 */
function clearCloseTimer(userPhone) {
  const timer = closeTimers.get(userPhone);
  if (timer) {
    clearTimeout(timer);
    closeTimers.delete(userPhone);
  }
}

/**
 * Hapus percakapan dari memory
 */
function clearConversation(userPhone) {
  conversations.delete(userPhone);
  clearCloseTimer(userPhone);
}

/**
 * Statistik memory (untuk debugging/dashboard)
 */
function getStats() {
  return {
    activeConversations: conversations.size,
    activeTimers: closeTimers.size,
  };
}

// Bersihkan percakapan lama (>1 jam tidak aktif) setiap 30 menit
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  let cleaned = 0;

  conversations.forEach((conv, phone) => {
    if (now - conv.lastActivity > oneHour) {
      conversations.delete(phone);
      clearCloseTimer(phone);
      cleaned++;
    }
  });

  if (cleaned > 0) {
    console.log(`[Memory] Cleanup: ${cleaned} percakapan lama dihapus. Aktif: ${conversations.size}`);
  }
}, CLEANUP_INTERVAL);

module.exports = {
  getHistory,
  addMessage,
  formatHistoryForLLM,
  setCloseTimer,
  clearCloseTimer,
  clearConversation,
  getStats,
};
