const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const fs = require('fs');
require('dotenv').config();

const { handleMessage } = require('./handler');

const PHONE_NUMBER = process.env.BOT_PHONE_NUMBER || '';

let retryCount = 0;

// ==============================
// FLAG: Sedang menunggu user input pairing code
// Selama true → JANGAN RECONNECT
// ==============================
let waitingForPairing = false;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const isRegistered = state.creds?.registered || false;

    if (!isRegistered && !PHONE_NUMBER) {
        console.error("[ERROR] Isi BOT_PHONE_NUMBER di .env");
        process.exit(1);
    }

    const logger = pino({ level: "silent" });

    const socket = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        printQRInTerminal: false,
        logger,
        browser: ["Ubuntu", "Chrome", "22.04"],
        connectTimeoutMs: 60000,
        markOnlineOnConnect: true
    });

    let pairingDone = false;

    // ==============================
    // 🔌 CONNECTION HANDLER
    // ==============================
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // ===== PAIRING CODE (via QR event = WS ready) =====
        if (qr && !isRegistered && !pairingDone && PHONE_NUMBER) {
            pairingDone = true;
            waitingForPairing = true; // LOCK: jangan reconnect

            try {
                const code = await socket.requestPairingCode(PHONE_NUMBER);
                const formatted = code?.match(/.{1,4}/g)?.join("-") || code;

                console.log(`\n====================================`);
                console.log(`📱 PAIRING CODE`);
                console.log(`====================================`);
                console.log(`👉 ${formatted}`);
                console.log(`====================================`);
                console.log(`⏳ Masukkan kode di atas ke WhatsApp.`);
                console.log(`   Anda punya waktu 60 detik.`);
                console.log(`====================================\n`);

                // Auto-unlock setelah 60 detik (kode expired)
                setTimeout(() => {
                    if (waitingForPairing) {
                        console.log("[!] Waktu pairing habis. Restart bot: node index.js");
                        process.exit(1);
                    }
                }, 60000);

            } catch (err) {
                console.error("[Pairing Error]", err.message);
                waitingForPairing = false;
            }
        }

        // ===== DISCONNECT HANDLER =====
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;

            // Jika sedang menunggu pairing → JANGAN reconnect
            // Biarkan user punya waktu memasukkan kode
            if (waitingForPairing) {
                console.log(`[!] Disconnect (${statusCode}) — Tapi pairing sedang berlangsung, menunggu...`);
                return; // JANGAN reconnect!
            }

            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                console.log("[!] Session logout. Hapus auth...");
                fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                process.exit(1);
            }

            retryCount++;

            // Maksimal 3 kali retry lalu berhenti (hindari rate limit WhatsApp)
            if (retryCount > 3) {
                console.log("[!] Gagal konek 3x. WhatsApp kemungkinan blokir sementara IP ini.");
                console.log("[!] Tunggu 15 menit, lalu jalankan ulang: node index.js");
                process.exit(1);
            }

            // Delay PANJANG: 30s → 60s → 120s
            const delay = retryCount * 30000;
            console.log(`[!] Disconnect (${statusCode}). Retry ${retryCount}/3 dalam ${delay / 1000}s...`);

            setTimeout(() => {
                connectToWhatsApp();
            }, delay);
        }

        // ===== CONNECTED =====
        if (connection === 'open') {
            retryCount = 0;
            waitingForPairing = false; // UNLOCK
            console.log("✅ WhatsApp Connected & Ready!");
        }
    });

    socket.ev.on('creds.update', saveCreds);

    // ==============================
    // 💬 MESSAGE HANDLER
    // ==============================
    socket.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg?.message) return;

            const jid = msg.key.remoteJid;
            if (!jid) return;

            // Filter
            if (msg.key.fromMe) return;
            if (jid === 'status@broadcast') return;
            if (jid.endsWith('@g.us')) return;
            if (jid.includes('@newsletter')) return;

            // Ambil text
            const mc = msg.message;
            let text =
                mc.conversation ||
                mc.extendedTextMessage?.text ||
                mc.imageMessage?.caption ||
                mc.videoMessage?.caption ||
                "";

            if (!text.trim()) return;

            console.log(`\n📥 ${jid}: ${text}`);

            // Typing indicator
            await socket.sendPresenceUpdate('composing', jid);

            // Process
            const reply = await handleMessage(text.trim(), jid);

            if (reply) {
                await new Promise(r => setTimeout(r, 500)); // anti-spam delay
                await socket.sendMessage(jid, { text: reply }, { quoted: msg });
                console.log(`📤 ${reply.substring(0, 80)}${reply.length > 80 ? '...' : ''}`);
            }

        } catch (err) {
            console.error("[Message Error]", err.message);
        }
    });
}

module.exports = { connectToWhatsApp };