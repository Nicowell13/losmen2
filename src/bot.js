const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { handleMessage } = require('./handler');
const readline = require('readline');
const fs = require('fs');

// Simpan nomor agar tidak perlu input ulang
let savedPhoneNumber = null;

/**
 * Minta nomor telepon dari user via terminal (sekali saja).
 */
async function askPhoneNumber() {
  if (savedPhoneNumber) return savedPhoneNumber;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("[?] Masukkan nomor WhatsApp Bot (Contoh: 628123456789): ", (answer) => {
      rl.close();
      savedPhoneNumber = answer.replace(/[^0-9]/g, '');
      resolve(savedPhoneNumber);
    });
  });
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  // Cek apakah sudah pernah login sebelumnya
  const isRegistered = state.creds?.registered || false;

  // Jika belum pernah login, minta nomor DULU sebelum buat koneksi
  if (!isRegistered) {
    console.log("\n[!!!] SESSION BELUM ADA — Perlu Pairing [!!!]");
    await askPhoneNumber();
    console.log(`[OK] Nomor disimpan: ${savedPhoneNumber}. Menghubungkan ke WhatsApp...\n`);
  }

  const socket = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "error" }),
    browser: Browsers.ubuntu("Chrome")
  });

  // Flag agar pairing code hanya diminta sekali per koneksi
  let pairingRequested = false;

  // ====== Connection Events ======
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Ketika QR muncul & belum registered → minta pairing code
    if (qr && !isRegistered && !pairingRequested) {
      pairingRequested = true;
      try {
        let code = await socket.requestPairingCode(savedPhoneNumber);
        code = code?.match(/.{1,4}/g)?.join("-") || code;

        console.log(`=============================================================`);
        console.log(`📱 1. Buka WhatsApp → Pengaturan → Perangkat Tertaut`);
        console.log(`📱 2. Pilih "Tautkan dengan nomor telepon saja"`);
        console.log(`📱 3. MASUKKAN KODE INI: \x1b[32m${code}\x1b[0m`);
        console.log(`=============================================================\n`);
        console.log(`⏳ Menunggu Anda memasukkan kode di WhatsApp...\n`);
      } catch (err) {
        console.error("[Pairing Error]", err.message);
        console.log("[Info] Coba jalankan ulang: node index.js");
        process.exit(1);
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`[!] Koneksi terputus (code: ${statusCode}).`);

      if (statusCode === DisconnectReason.loggedOut) {
        // Session sudah logout, hapus auth dan mulai dari awal
        console.log("[!] Session logout. Hapus auth dan jalankan ulang.");
        fs.rmSync('auth_info_baileys', { recursive: true, force: true });
        process.exit(1);
      }

      if (shouldReconnect) {
        console.log("[...] Reconnect dalam 5 detik...");
        setTimeout(connectToWhatsApp, 5000);
      }
    } else if (connection === 'open') {
      console.log('✅ Bot WhatsApp tersambung dan siap menerima pesan!');
    }
  });

  socket.ev.on('creds.update', saveCreds);

  // ====== Message Handler ======
  socket.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg?.message) return;

    // Filter: Abaikan sendiri, broadcast, dan GRUP
    if (msg.key.fromMe) return;
    if (msg.key.remoteJid === 'status@broadcast') return;
    if (msg.key.remoteJid.endsWith('@g.us')) return;

    // Ekstrak teks
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

module.exports = {
  connectToWhatsApp
};
