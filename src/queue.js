const Queue = require('bull');
const config = require('./config');
const { processMessageLogic } = require('./handler');
const { sendReply, sendPresence } = require('./waha');

// Inisialisasi Queue
// Menghubungkan ke Redis berdasarkan REDIS_URL
const messageQueue = new Queue('whatsapp-messages', config.redis.url);

// ============================================================
// Keyword cepat untuk deteksi pesan yang butuh waktu lama (LLM)
// Digunakan untuk kirim "mohon ditunggu" sebelum proses
// ============================================================
const HEAVY_KEYWORDS = [
  // ketersediaan
  'kosong', 'available', 'tersedia', 'ada kamar', 'penuh', 'tanggal', 'besok',
  'lusa', 'minggu depan', 'hari ini', 'check in', 'checkin', 'cek in', 'kapan',
  // harga
  'harga', 'berapa', 'tarif', 'biaya', 'rate', 'price',
  // booking
  'booking', 'pesan', 'reservasi', 'book', 'mau kamar', 'mau nginap', 'mau menginap',
  // fasilitas
  'fasilitas', 'ac', 'wifi', 'parkir', 'sarapan'
];

function needsWaitMessage(text) {
  const lower = text.toLowerCase();
  return HEAVY_KEYWORDS.some(kw => lower.includes(kw));
}

// ============================================================
// Pesan "mohon ditunggu" yang bervariasi agar tidak monoton
// ============================================================
const WAIT_MESSAGES = [
  `Baik Kak, tunggu sebentar ya aku cek dulu 🔍`,
  `Oke Kak, sebentar ya aku cekkan dulu datanya 📋`,
  `Siap Kak! Mohon ditunggu sebentar ya, aku cek dulu 😊`,
  `Bentar ya Kak, aku liat dulu datanya 🔎`,
  `Oke Kak, tunggu sebentar ya aku carikan infonya 🙏`
];

function getRandomWaitMessage() {
  return WAIT_MESSAGES[Math.floor(Math.random() * WAIT_MESSAGES.length)];
}

// ============================================================
// Konfigurasi Worker Pemroses Pesan
// concurrency: 1 (Memastikan Ollama hanya dipanggil 1 per 1 agar VPS tidak kehabisan RAM)
// ============================================================
messageQueue.process(1, async (job, done) => {
  const { text, senderId } = job.data;
  
  console.log(`\n[⚙️ Worker] Memproses pesan dari ${senderId}...`);
  
  try {
    // 1. Kasih efek 'typing...'
    await sendPresence(senderId);

    // 2. Kirim pesan "mohon ditunggu" jika pesan butuh proses berat
    if (needsWaitMessage(text)) {
      const waitMsg = getRandomWaitMessage();
      await sendReply(senderId, waitMsg);
      console.log(`[⏳ Wait] Kirim pesan tunggu ke ${senderId}`);
      // Kasih jeda sebelum mulai proses + set typing lagi
      await new Promise(r => setTimeout(r, 300));
      await sendPresence(senderId);
    }

    // 3. Jalankan otak (NLU -> Data -> NLG)
    const reply = await processMessageLogic(text, senderId);
    
    // 4. Kirim via WAHA
    if (reply) {
      // Delay dikit anti-spam API
      await new Promise(r => setTimeout(r, 500));
      await sendReply(senderId, reply);
    }
    
    // 5. Tandai kerjaan selesai di Redis
    done();
  } catch (error) {
    console.error('[⚙️ Worker Error]', error.message);
    // Kita tetap tandai done agar queue tidak macet & pindah ke antrian berikutnya
    done(new Error("Gagal merespons"));
  }
});

// Listener Jika Sukses/Gagal
messageQueue.on('completed', (job) => {
  // console.log(`[Queue] Selesai ${job.id}`);
  job.remove(); // Hapus job dari Redis jika sudah sukses agar memori tetap bersih
});

messageQueue.on('failed', (job, err) => {
  console.error(`[Queue Failed] Job ${job.id} gagal: ${err.message}`);
});

module.exports = messageQueue;
