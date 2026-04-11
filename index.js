const { connectToWhatsApp } = require('./src/bot');

console.log("============================================");
console.log("  🏨 Chatbot Hybrid Losmen — Starting...");
console.log("============================================\n");

// Tangkap error global agar bot tidak crash diam-diam
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});

connectToWhatsApp();
