#!/bin/bash
# =====================================================
# VPS Ubuntu 22.04 Setup Script — WAHA + Webhook Bot
# Run as root: chmod +x setup-vps.sh && ./setup-vps.sh
# =====================================================

set -e

echo "=================================================="
echo "  🏨 Setup VPS Hybrid WA Bot (Node.js + WAHA + Ollama)"
echo "=================================================="

# =====================================================
# 0. SWAP RAM (4GB)
# =====================================================
echo ""
echo "[0/6] Membuat Swap 4GB..."
if [ -f /swapfile ]; then
    echo "  → Swapfile sudah ada, skip."
else
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab
    sysctl vm.swappiness=10
    echo 'vm.swappiness=10' | tee -a /etc/sysctl.conf
    echo "  ✅ Swap 4GB aktif!"
fi
free -h

# =====================================================
# 1. Update Ubuntu & Install Base Tools + Redis
# =====================================================
echo ""
echo "[1/6] Update paket Ubuntu & Install Redis..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
sudo apt-get install -y curl git apt-transport-https ca-certificates software-properties-common redis-server

sudo systemctl enable redis-server
sudo systemctl start redis-server

# =====================================================
# 2. Install Docker & Run WAHA
# =====================================================
echo ""
echo "[2/6] Install Docker & WAHA Server..."
if command -v docker &> /dev/null; then
    echo "  → Docker sudah terinstall: $(docker --version)"
else
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
fi

sudo systemctl enable docker
sudo systemctl start docker

# Jalankan Container WAHA jika belum jalan
echo "  → Konfigurasi WAHA Container (Port 3000)..."
docker stop waha 2>/dev/null || true
docker rm waha 2>/dev/null || true
docker run -d \
  --name waha \
  -p 3000:3000 \
  -e WAHA_WEBHOOK_ENDPOINT=http://host.docker.internal:3001/webhook \
  -e WAHA_WEBHOOK_EVENTS="message" \
  -e WAHA_API_KEY=losmen123 \
  --add-host=host.docker.internal:host-gateway \
  --restart always \
  devlikeapro/waha

echo "  ✅ WAHA berjalan di Docker!"

# =====================================================
# 3. Install Node.js 20 LTS
# =====================================================
echo ""
echo "[3/6] Install Node.js 20 LTS..."
if command -v node &> /dev/null; then
    echo "  → Node.js sudah terinstall."
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# =====================================================
# 4. Install PM2
# =====================================================
echo ""
echo "[4/6] Install PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# =====================================================
# 5. Install Ollama + Model
# =====================================================
echo ""
echo "[5/6] Install Ollama..."
if ! command -v ollama &> /dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
fi
sudo systemctl enable ollama 2>/dev/null || true
sudo systemctl start ollama 2>/dev/null || true
sleep 5
echo "  Pulling phi3:mini..."
ollama pull phi3:mini

# =====================================================
# 6. Install Dependencies
# =====================================================
echo ""
if [ -f "package.json" ]; then
    echo "[6/6] Install NPM dependencies..."
    npm install
fi

echo ""
echo "=================================================="
echo "  ✅ SETUP VPS (WAHA) SELESAI!"
echo "=================================================="
echo "  1. Buka browser: http://$(curl -s ifconfig.me):3000"
echo "  2. Di tab Sessions, tambahkan session baru bernama: default"
echo "  3. Klik ikon kamera untuk Scan QR Code (Gunakan WA HP Anda)"
echo "  4. Di VPS Terminal jalankan bot NLU Node.js: pm2 start index.js --name cs-losmen"
echo "=================================================="
