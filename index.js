const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const messageQueue = require('./src/queue');
const config = require('./src/config');
const db = require('./src/db');

// API Routes
const authRoutes = require('./src/api/auth');
const kamarRoutes = require('./src/api/kamar');
const bookingRoutes = require('./src/api/booking');
const infoRoutes = require('./src/api/info');
const dashboardRoutes = require('./src/api/dashboard');
const whatsappRoutes = require('./src/api/whatsapp');
const authMiddleware = require('./src/middleware/auth');

const app = express();
app.use(bodyParser.json());
app.use(cors({ origin: config.cors.origin }));

console.log("============================================");
console.log("  🏨 Chatbot Hybrid Losmen — Webhook + Redis + Admin API");
console.log("============================================\n");

// ============================================================
// API Routes (Admin Panel)
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/kamar', authMiddleware, kamarRoutes);
app.use('/api/booking', authMiddleware, bookingRoutes);
app.use('/api/info', authMiddleware, infoRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/whatsapp', authMiddleware, whatsappRoutes);

// Health check (tanpa auth)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// Webhook endpoint dari WAHA
// ============================================================
app.post('/webhook', async (req, res) => {
  // 1. LANGSUNG BALAS HTTP 200 OK ke WAHA agar antrean request tidak macet (<10ms)
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

// ============================================================
// Inisialisasi Database & Jalankan Server
// ============================================================
async function start() {
  try {
    await db.initDatabase();
    await db.updateCache();
    console.log('✅ Database terhubung & cache dimuat!\n');
  } catch (err) {
    console.error('[DB] Gagal koneksi database:', err.message);
    console.log('[DB] Bot tetap jalan tanpa database (fallback mode).\n');
  }

  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`✅ Server berjalan di port ${port}!`);
    console.log(`   Webhook:   http://localhost:${port}/webhook`);
    console.log(`   Admin API: http://localhost:${port}/api/`);
    console.log(`   Redis:     ${config.redis.url}`);
  });
}

start();