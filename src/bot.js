const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { handleMessage } = require('./handler');
const readline = require('readline');

// Setup antarmuka untuk membaca nomor telepon dari console
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const socket = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "error" }),
    browser: ["Ubuntu", "Chrome", "20.0.04"]
  });

  // ====== Pairing Code (untuk VPS tanpa GUI) ======
  if (!socket.authState.creds.registered) {
    setTimeout(async () => {
      console.log("\n[!!!] SESSION BELUM ADA [!!!]");
      let phoneNumber = await question("[?] Masukkan nomor WhatsApp untuk dijadikan Bot (Contoh: 628123456789): ");
      phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

      let code = await socket.requestPairingCode(phoneNumber);
      code = code?.match(/.{1,4}/g)?.join("-") || code;

      console.log(`\n=============================================================`);
      console.log(`📱 1. Buka WhatsApp → Pengaturan → Perangkat Tertaut`);
      console.log(`📱 2. Pilih "Tautkan dengan nomor telepon saja"`);
      console.log(`📱 3. MASUKKAN KODE INI: \x1b[32m${code}\x1b[0m`);
      console.log(`=============================================================\n`);
    }, 3000);
  }

  // ====== Connection Events ======
  socket.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`[!] Koneksi terputus (code: ${statusCode}). Reconnect: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000); // Tunggu 3 detik sebelum reconnect
      } else {
        console.log("[!] Terlogout. Hapus folder auth_info_baileys dan jalankan ulang.");
      }
    } else if (connection === 'open') {
      console.log('✅ Bot WhatsApp tersambung dan siap!');
    }
  });

  socket.ev.on('creds.update', saveCreds);

  // ====== Message Handler ======
  socket.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg?.message) return;

    // --- Filter: Abaikan pesan sendiri, broadcast, dan GRUP ---
    if (msg.key.fromMe) return;
    if (msg.key.remoteJid === 'status@broadcast') return;
    if (msg.key.remoteJid.endsWith('@g.us')) return; // GRUP → abaikan

    // --- Ekstrak teks ---
    const messageContent = msg.message;
    let text = messageContent.conversation
      || messageContent.extendedTextMessage?.text
      || messageContent.imageMessage?.caption
      || messageContent.videoMessage?.caption
      || "";

    if (!text.trim()) return;

    const senderNumber = msg.key.remoteJid;
    console.log(`\n[📥] ${senderNumber}: ${text}`);

    // Status "sedang mengetik..."
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
