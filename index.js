const express = require('express');
const bodyParser = require('body-parser');
const messageQueue = require('./src/queue');
const config = require('./src/config');
const sheets = require('./src/sheets'); // untuk memuat data awal (caching)

const app = express();
app.use(bodyParser.json());

console.log("============================================");
console.log("  🏨 Chatbot Hybrid Losmen — Webhook + Redis");
console.log("============================================\n");

// Webhook endpoint dari WAHA
app.post('/webhook', async (req, res) => {
  // 1. LANGSUNG BALAS HTTP 200 OK ke WAHA agar antrean request tidak macet (< 10ms)
  res.sendStatus(200);

  const payload = req.body;
  
  // 2. Deteksi pesan masuk (event: message)
  if (payload.event === 'message') {
    const msg = payload.payload;
    
    // Abaikan jika bukan pesan beneran / dari bot sendiri
    if (!msg || msg.fromMe) return;

    // Filter GRUP (WAHA group ID ends with @g.us)
    const senderId = msg.from;
    if (senderId.endsWith('@g.us') || senderId.includes('@broadcast') || senderId.includes('@newsletter')) return;

    // Ekstrak teks (dukung gambar/dokumen yang punya caption "body")
    let text = msg.body || "";
    if (typeof text !== 'string') text = text.toString();
    
    if (!text.trim()) return;

    console.log(`\n[📥 Webhook] Menerima pesan dari ${senderId} -> Masuk Antrian Redis`);

    // 3. Masukkan ke Antrian Bull Redis!
    // Worker di src/queue.js akan memprosesnya di latar belakang
    messageQueue.add({
      text: text.trim(),
      senderId: senderId
    });
  }
});

// Error handling global
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});

// Jalankan Webhook Server
const port = process.env.PORT || 3001; // Tetap 3001
app.listen(port, () => {
  console.log(`✅ Webhook Server berjalan di port ${port}!`);
  console.log(`   Memantau antrian Redis di: ${config.redis.url}`);
  console.log(`   Pastikan endpoint WAHA: http://localhost:${port}/webhook`);
});