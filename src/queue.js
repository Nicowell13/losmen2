const Queue = require('bull');
const config = require('./config');
const { processMessageLogic } = require('./handler');
const { sendReply, sendPresence } = require('./waha');

// Inisialisasi Queue
// Menghubungkan ke Redis berdasarkan REDIS_URL
const messageQueue = new Queue('whatsapp-messages', config.redis.url);

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

    // 2. Jalankan otak (NLU -> Data -> NLG)
    const reply = await processMessageLogic(text, senderId);
    
    // 3. Kirim via WAHA
    if (reply) {
      // Delay dikit anti-spam API
      await new Promise(r => setTimeout(r, 500));
      await sendReply(senderId, reply);
    }
    
    // 4. Tandai kerjaan selesai di Redis
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
