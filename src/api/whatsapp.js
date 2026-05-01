const express = require('express');
const axios = require('axios');
const config = require('../config');

const router = express.Router();

const wahaApi = axios.create({
  baseURL: config.waha.url,
  headers: config.waha.apiKey ? { 'X-Api-Key': config.waha.apiKey } : {},
  timeout: 15000,
});

/**
 * GET /api/whatsapp/status — Cek status sesi WAHA
 */
router.get('/status', async (req, res) => {
  try {
    const { data } = await wahaApi.get('/api/sessions/');
    const session = data.find(s => s.name === config.waha.session);

    if (!session) {
      return res.json({
        status: 'NOT_FOUND',
        message: `Sesi "${config.waha.session}" belum dibuat.`,
        session: config.waha.session,
      });
    }

    res.json({
      status: session.status, // WORKING, SCAN_QR_CODE, STARTING, STOPPED, FAILED
      message: getStatusMessage(session.status),
      session: session.name,
      me: session.me || null,
    });
  } catch (err) {
    console.error('[WAHA Status]', err.message);
    res.json({
      status: 'ERROR',
      message: 'Tidak bisa terhubung ke WAHA. Pastikan Docker container WAHA berjalan.',
      error: err.message,
    });
  }
});

/**
 * GET /api/whatsapp/qr — Ambil QR Code untuk scan
 * Coba beberapa endpoint WAHA untuk mendapatkan QR code langsung (bukan screenshot)
 */
router.get('/qr', async (req, res) => {
  const session = config.waha.session;

  // Daftar endpoint QR yang mungkin (berbeda versi WAHA)
  const qrEndpoints = [
    `/api/${session}/auth/qr`,                  // WAHA v1
    `/api/sessions/${session}/auth/qr`,          // WAHA v2+
  ];

  // Coba setiap endpoint QR
  for (const endpoint of qrEndpoints) {
    try {
      // Coba sebagai JSON (base64 response)
      const { data } = await wahaApi.get(endpoint, { responseType: 'json' });

      if (data && data.data) {
        return res.json({
          qr: `data:${data.mimetype || 'image/png'};base64,${data.data}`,
          type: 'qr',
        });
      }
    } catch (e) {
      // Coba sebagai raw image
      try {
        const imgRes = await wahaApi.get(endpoint, { responseType: 'arraybuffer' });
        if (imgRes.data && imgRes.data.byteLength > 100) {
          const base64 = Buffer.from(imgRes.data, 'binary').toString('base64');
          const contentType = imgRes.headers['content-type'] || 'image/png';
          return res.json({
            qr: `data:${contentType};base64,${base64}`,
            type: 'qr',
          });
        }
      } catch (e2) { /* lanjut ke endpoint berikutnya */ }
    }
  }

  // Fallback terakhir: screenshot (full page — akan di-crop oleh frontend)
  try {
    const screenshotRes = await wahaApi.get('/api/screenshot', {
      params: { session },
      responseType: 'arraybuffer',
    });

    const base64 = Buffer.from(screenshotRes.data, 'binary').toString('base64');
    const contentType = screenshotRes.headers['content-type'] || 'image/png';
    return res.json({
      qr: `data:${contentType};base64,${base64}`,
      type: 'screenshot', // Frontend tahu ini screenshot, bukan QR murni
    });
  } catch (screenshotErr) {
    res.json({ qr: null, message: 'QR tidak tersedia.' });
  }
});

/**
 * POST /api/whatsapp/start — Mulai/buat sesi baru
 */
router.post('/start', async (req, res) => {
  try {
    await wahaApi.post('/api/sessions/start', {
      name: config.waha.session,
      config: {
        webhooks: [
          {
            url: `http://localhost:${process.env.PORT || 3001}/webhook`,
            events: ['message'],
          }
        ],
      },
    });

    res.json({ message: 'Sesi berhasil dimulai! Tunggu QR code muncul...' });
  } catch (err) {
    // Jika sesi sudah ada, coba restart
    if (err.response && err.response.status === 422) {
      return res.json({ message: 'Sesi sudah aktif.' });
    }
    console.error('[WAHA Start]', err.message);
    res.status(500).json({ error: 'Gagal memulai sesi: ' + err.message });
  }
});

/**
 * POST /api/whatsapp/stop — Hentikan sesi
 */
router.post('/stop', async (req, res) => {
  try {
    await wahaApi.post('/api/sessions/stop', {
      name: config.waha.session,
    });
    res.json({ message: 'Sesi berhasil dihentikan.' });
  } catch (err) {
    console.error('[WAHA Stop]', err.message);
    res.status(500).json({ error: 'Gagal menghentikan sesi: ' + err.message });
  }
});

/**
 * POST /api/whatsapp/restart — Restart sesi (stop + start)
 */
router.post('/restart', async (req, res) => {
  try {
    // Stop dulu
    try {
      await wahaApi.post('/api/sessions/stop', { name: config.waha.session });
    } catch (e) { /* abaikan jika sudah stop */ }

    // Tunggu sebentar
    await new Promise(r => setTimeout(r, 1500));

    // Start lagi
    await wahaApi.post('/api/sessions/start', {
      name: config.waha.session,
      config: {
        webhooks: [
          {
            url: `http://localhost:${process.env.PORT || 3001}/webhook`,
            events: ['message'],
          }
        ],
      },
    });

    res.json({ message: 'Sesi berhasil di-restart! Tunggu QR code muncul...' });
  } catch (err) {
    console.error('[WAHA Restart]', err.message);
    res.status(500).json({ error: 'Gagal restart sesi: ' + err.message });
  }
});

/**
 * POST /api/whatsapp/logout — Logout dari WhatsApp (perlu scan QR ulang)
 */
router.post('/logout', async (req, res) => {
  try {
    await wahaApi.post(`/api/sessions/logout`, {
      name: config.waha.session,
    });
    res.json({ message: 'Berhasil logout. Scan QR code untuk login kembali.' });
  } catch (err) {
    console.error('[WAHA Logout]', err.message);
    res.status(500).json({ error: 'Gagal logout: ' + err.message });
  }
});

function getStatusMessage(status) {
  const messages = {
    'WORKING': '✅ WhatsApp terhubung dan aktif!',
    'SCAN_QR_CODE': '📱 Scan QR Code di bawah untuk menghubungkan WhatsApp.',
    'STARTING': '⏳ Sesi sedang dimulai, tunggu sebentar...',
    'STOPPED': '⏹️ Sesi dihentikan.',
    'FAILED': '❌ Sesi gagal. Coba restart.',
  };
  return messages[status] || `Status: ${status}`;
}

module.exports = router;
