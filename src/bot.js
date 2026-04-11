const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { handleMessage } = require('./handler');
const fs = require('fs');
const config = require('./config');

// Nomor telepon dari .env — TIDAK PAKAI INPUT TERMINAL
const PHONE_NUMBER = process.env.BOT_PHONE_NUMBER || '';

// Hitung retry untuk backoff (hindari rate limit WhatsApp)
let retryCount = 0;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const isRegistered = state.creds?.registered || false;

  if (!isRegistered && !PHONE_NUMBER) {
    console.error("[ERROR] BOT_PHONE_NUMBER belum diisi di file .env!");
    console.error("[ERROR] Contoh: BOT_PHONE_NUMBER=628123456789");
    process.exit(1);
  }

  if (!isRegistered) {
    console.log(`[Info] Session belum ada. Akan pairing dengan nomor: ${PHONE_NUMBER}`);
  }

  const socket = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "error" }),
    browser: Browsers.ubuntu("Chrome"),
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0 // Disable query timeout
  });

  let pairingDone = false;

  // ====== Connection Events ======
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // QR muncul = WebSocket sudah siap → langsung minta pairing code
    if (qr && !isRegistered && !pairingDone && PHONE_NUMBER) {
      pairingDone = true;

      // Delay kecil untuk memastikan koneksi stabil
      await new Promise(r => setTimeout(r, 2000));

      try {
        const code = await socket.requestPairingCode(PHONE_NUMBER);
        const formatted = code?.match(/.{1,4}/g)?.join("-") || code;

        console.log(`\n=============================================================`);
        console.log(`📱  PAIRING CODE SIAP!`);
        console.log(`=============================================================`);
        console.log(`📱 1. Buka WhatsApp → Pengaturan → Perangkat Tertaut`);
        console.log(`📱 2. Ketuk "Tautkan Perangkat"`);
        console.log(`📱 3. Pilih "Tautkan dengan nomor telepon saja"`);
        console.log(`📱 4. MASUKKAN KODE: \x1b[32m${formatted}\x1b[0m`);
        console.log(`=============================================================`);
        console.log(`⏳ Menunggu scan... (kode berlaku beberapa menit)\n`);
      } catch (err) {
        console.error(`[Pairing Error] ${err.message}`);
        console.log("[Info] Tunggu 30 detik lalu coba ulang: node index.js");
        process.exit(1);
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        console.log("[!] Session logout/invalid. Menghapus auth...");
        fs.rmSync('auth_info_baileys', { recursive: true, force: true });
        process.exit(1);
      }

      // Backoff: tunggu lebih lama setiap kali gagal (maks 30 detik)
      retryCount++;
      const delay = Math.min(retryCount * 5000, 30000);
      console.log(`[!] Koneksi terputus (code: ${statusCode}). Retry #${retryCount} dalam ${delay / 1000}s...`);
      setTimeout(connectToWhatsApp, delay);
    }

    if (connection === 'open') {
      retryCount = 0; // Reset retry counter
      console.log('✅ Bot WhatsApp tersambung dan siap menerima pesan!');
    }
  });

  socket.ev.on('creds.update', saveCreds);

  // ====== Message Handler ======
  socket.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg?.message) return;

    if (msg.key.fromMe) return;
    if (msg.key.remoteJid === 'status@broadcast') return;
    if (msg.key.remoteJid.endsWith('@g.us')) return; // Abaikan grup

    const messageContent = msg.message;
    let text = messageContent.conversation
      || messageContent.extendedTextMessage?.text
      || messageContent.imageMessage?.caption
      || messageContent.videoMessage?.caption
      || "";

    if (!text.trim()) return;

    const senderNumber = msg.key.remoteJid;
    console.log(`\n[📥] ${senderNumber}: ${text}`);

    await socket.sendPresenceUpdate('composing', senderNumber);

    try {
      const reply = await handleMessage(text.trim(), senderNumber);
      if (reply) {
        await socket.sendMessage(senderNumber, { text: reply }, { quoted: msg });
        console.log(`[📤] ${reply.substring(0, 80)}${reply.length > 80 ? '...' : ''}`);
      }
    } catch (error) {
      console.error('[Bot Error]', error.message);
    }
  });
}

module.exports = { connectToWhatsApp };
