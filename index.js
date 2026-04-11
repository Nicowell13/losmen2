const { connectToWhatsApp } = require('./src/bot');

console.log("============================================");
console.log("  🏨 Chatbot Hybrid Losmen — Starting...");
console.log("============================================\n");

// ==============================
// 🔥 GLOBAL ERROR HANDLER
// ==============================

// Error sync (crash langsung)
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);

  // optional restart
  setTimeout(() => {
    console.log('[SYSTEM] Restarting bot...');
    process.exit(1);
  }, 3000);
});

// Error async (promise)
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);

  // optional restart
  setTimeout(() => {
    console.log('[SYSTEM] Restarting bot...');
    process.exit(1);
  }, 3000);
});

// ==============================
// 🚀 START BOT
// ==============================

(async () => {
  try {
    await connectToWhatsApp();
  } catch (err) {
    console.error('[INIT ERROR]', err.message);

    // retry start kalau gagal awal
    setTimeout(() => {
      console.log('[SYSTEM] Retry start...');
      process.exit(1);
    }, 5000);
  }
})();