#!/bin/bash
# VPS Ubuntu 22.04 Setup Script untuk Hybrid WA Bot
# Gunakan User Root / Sudoer

echo "=================================================="
echo "    Setup VPS Hybrid WA Bot (Node.js + Ollama )"
echo "=================================================="

# 1. Update Server
echo "\n[1/4] Update paket Ubuntu..."
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install Node.js (Versi 20 LTS)
echo "\n[2/4] Install Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v

# 3. Install PM2 untuk menjalankan bot di background
echo "\n[3/4] Install PM2 Process Manager..."
sudo npm install -g pm2

# 4. Install Ollama & Download Model qwen2.5:1.5b
echo "\n[4/4] Install Ollama dan Download Local LLM..."
curl -fsSL https://ollama.com/install.sh | sh
echo "Mendownload model qwen2.5:1.5b (Ini akan memakan waktu tergantung kecepatan internet VPS)..."
# Perintah run di-background agar tidak block install script, kemudian pull
ollama serve &
sleep 5
ollama pull qwen2.5:1.5b

echo "\n=================================================="
echo "Instalasi Dasar VPS Selesai!"
echo "\nLangkah Selanjutnya:"
echo "1. Upload folder bot (atau git clone repositori Anda) ke VPS."
echo "2. Masuk ke folder bot (contoh: cd chatbbot), lalu jalankan: npm install"
echo "3. Jalankan bot: node index.js (Scan QR code)"
echo "4. Jika sudah bisa jalan lancar, jalankan pakai PM2: pm2 start index.js --name wajaga"
echo "=================================================="
