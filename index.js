const { connectToWhatsApp } = require('./src/bot');

console.log("============================================");
console.log("  🏨 Chatbot Hybrid Losmen — Starting...");
console.log("============================================\n");

process.on('uncaughtException', (err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});

connectToWhatsApp();