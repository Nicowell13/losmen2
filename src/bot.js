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
let isReconnecting = false;

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

        // ===== FIX PAIRING (ANTI ERROR) =====
        if (
            connection === 'connecting' &&
            !isRegistered &&
            !pairingDone &&
            PHONE_NUMBER
        ) {
            pairingDone = true;

            try {
                // ⏳ delay wajib biar socket ready
                await new Promise(res => setTimeout(res, 4000));

                const code = await socket.requestPairingCode(PHONE_NUMBER);
                const formatted = code?.match(/.{1,4}/g)?.join("-") || code;

                console.log(`\n====================================`);
                console.log(`📱 PAIRING CODE`);
                console.log(`====================================`);
                console.log(`👉 ${formatted}`);
                console.log(`====================================\n`);

            } catch (err) {
                console.error("[Pairing Error]", err.message);
            }
        }

        // ===== DISCONNECT HANDLER =====
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;

            console.log(`[!] Disconnect code: ${statusCode}`);

            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                console.log("[!] Session logout. Hapus auth...");
                fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                process.exit(1);
            }

            if (isReconnecting) return;
            isReconnecting = true;

            retryCount++;
            const delay = Math.min(retryCount * 5000, 30000);

            console.log(`[!] Reconnect dalam ${delay / 1000}s`);

            setTimeout(() => {
                isReconnecting = false;
                connectToWhatsApp();
            }, delay);
        }

        // ===== CONNECTED =====
        if (connection === 'open') {
            retryCount = 0;
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

            // ===== AMBIL TEXT =====
            const messageContent = msg.message;

            let text =
                messageContent.conversation ||
                messageContent.extendedTextMessage?.text ||
                messageContent.imageMessage?.caption ||
                messageContent.videoMessage?.caption ||
                "";

            if (!text.trim()) return;

            console.log(`\n📥 ${jid}: ${text}`);

            // ===== PROCESS =====
            const reply = await handleMessage(text.trim(), jid);

            if (reply) {
                await delay(500); // anti spam

                await socket.sendMessage(
                    jid,
                    { text: reply },
                    { quoted: msg }
                );

                console.log(`📤 ${reply.substring(0, 80)}${reply.length > 80 ? '...' : ''}`);
            }

        } catch (err) {
            console.error("[Message Error]", err.message);
        }
    });
}

// ==============================
// ⏱️ DELAY FUNCTION
// ==============================
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { connectToWhatsApp };