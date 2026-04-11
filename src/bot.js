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
        const { connection, lastDisconnect } = update;

        console.log("[Connection]", connection);

        // ===== PAIRING FIX (PALING STABIL) =====
        if (
            connection === 'connecting' &&
            !isRegistered &&
            !pairingDone &&
            PHONE_NUMBER
        ) {
            pairingDone = true;
            waitingForPairing = true;

            try {
                // ⏳ delay WAJIB (hindari Connection Closed)
                await new Promise(res => setTimeout(res, 5000));

                const code = await socket.requestPairingCode(PHONE_NUMBER);
                const formatted = code?.match(/.{1,4}/g)?.join("-") || code;

                console.log(`\n====================================`);
                console.log(`📱 PAIRING CODE`);
                console.log(`====================================`);
                console.log(`👉 ${formatted}`);
                console.log(`====================================`);
                console.log(`⏳ Masukkan ke WhatsApp (Linked Devices)`);
                console.log(`====================================\n`);

                // timeout pairing
                setTimeout(() => {
                    if (waitingForPairing) {
                        console.log("[!] Pairing timeout. Restart bot.");
                        process.exit(1);
                    }
                }, 60000);

            } catch (err) {
                console.error("[Pairing Error]", err.message);
                waitingForPairing = false;
            }
        }

        // ===== DISCONNECT =====
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;

            console.log(`[!] Disconnect code: ${statusCode}`);

            // 🔒 jangan reconnect saat pairing
            if (waitingForPairing) {
                console.log("[!] Menunggu pairing, tidak reconnect...");
                return;
            }

            // logout
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                console.log("[!] Session logout. Hapus auth...");
                fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                process.exit(1);
            }

            retryCount++;

            if (retryCount > 3) {
                console.log("[!] Gagal konek 3x. Tunggu 10-15 menit.");
                process.exit(1);
            }

            const delay = retryCount * 30000;
            console.log(`[!] Retry ${retryCount}/3 dalam ${delay / 1000}s`);

            setTimeout(() => {
                connectToWhatsApp();
            }, delay);
        }

        // ===== CONNECTED =====
        if (connection === 'open') {
            retryCount = 0;
            waitingForPairing = false;
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

            // ===== FILTER =====
            if (msg.key.fromMe) return;
            if (jid === 'status@broadcast') return;
            if (jid.endsWith('@g.us')) return;
            if (jid.includes('@newsletter')) return;

            // ===== TEXT =====
            const mc = msg.message;
            let text =
                mc.conversation ||
                mc.extendedTextMessage?.text ||
                mc.imageMessage?.caption ||
                mc.videoMessage?.caption ||
                "";

            if (!text.trim()) return;

            console.log(`\n📥 ${jid}: ${text}`);

            // OPTIONAL typing (boleh dihapus kalau bulk)
            // await socket.sendPresenceUpdate('composing', jid);

            const reply = await handleMessage(text.trim(), jid);

            if (reply) {
                await delay(500); // anti spam
                await socket.sendMessage(jid, { text: reply }, { quoted: msg });

                console.log(`📤 ${reply.substring(0, 80)}${reply.length > 80 ? '...' : ''}`);
            }

        } catch (err) {
            console.error("[Message Error]", err.message);
        }
    });
}

// ==============================
// ⏱️ DELAY
// ==============================
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { connectToWhatsApp };