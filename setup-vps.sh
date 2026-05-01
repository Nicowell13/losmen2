#!/bin/bash
# =====================================================
# VPS Ubuntu 22.04 Setup Script — WAHA + Webhook Bot + PostgreSQL
# Run as root: chmod +x setup-vps.sh && ./setup-vps.sh
# =====================================================

set -e

echo "=================================================="
echo "  🏨 Setup VPS Hybrid WA Bot (Node.js + WAHA + Ollama + PostgreSQL)"
echo "=================================================="

# =====================================================
# 0. SWAP RAM (4GB)
# =====================================================
echo ""
echo "[0/7] Membuat Swap 4GB..."
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
echo "[1/7] Update paket Ubuntu & Install Redis..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
sudo apt-get install -y curl git apt-transport-https ca-certificates software-properties-common redis-server

sudo systemctl enable redis-server
sudo systemctl start redis-server

# =====================================================
# 2. Install PostgreSQL
# =====================================================
echo ""
echo "[2/7] Install PostgreSQL..."
if command -v psql &> /dev/null; then
    echo "  → PostgreSQL sudah terinstall: $(psql --version)"
else
    sudo apt-get install -y postgresql postgresql-contrib
fi

sudo systemctl enable postgresql
sudo systemctl start postgresql

# Buat user & database untuk losmen
echo "  → Membuat database losmen_db..."
sudo -u postgres psql -c "CREATE USER losmen WITH PASSWORD 'losmen123';" 2>/dev/null || echo "  → User losmen sudah ada."
sudo -u postgres psql -c "CREATE DATABASE losmen_db OWNER losmen;" 2>/dev/null || echo "  → Database losmen_db sudah ada."
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE losmen_db TO losmen;" 2>/dev/null || true

echo "  ✅ PostgreSQL siap! (losmen_db)"

# =====================================================
# 3. Install Docker & Run WAHA
# =====================================================
echo ""
echo "[3/7] Install Docker & WAHA Server..."
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
# 4. Install Node.js 20 LTS
# =====================================================
echo ""
echo "[4/7] Install Node.js 20 LTS..."
if command -v node &> /dev/null; then
    echo "  → Node.js sudah terinstall."
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# =====================================================
# 5. Install PM2
# =====================================================
echo ""
echo "[5/7] Install PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# =====================================================
# 6. Install Ollama + Qwen 2.5 1.5B
# =====================================================
echo ""
echo "[6/7] Install Ollama + Qwen 2.5 1.5B..."
if ! command -v ollama &> /dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
fi
sudo systemctl enable ollama 2>/dev/null || true
sudo systemctl start ollama 2>/dev/null || true
sleep 5
echo "  Pulling qwen2.5:1.5b (ringan ~1GB, cocok untuk VPS 4-core 8GB)..."
ollama pull qwen2.5:1.5b

# =====================================================
# 7. Install Dependencies
# =====================================================
echo ""
if [ -f "package.json" ]; then
    echo "[7/7] Install NPM dependencies..."
    npm install
fi

echo ""
echo "=================================================="
echo "  ✅ SETUP VPS SELESAI!"
echo "=================================================="
echo "  1. Buka browser: http://$(curl -s ifconfig.me):3000"
echo "  2. Di tab Sessions, tambahkan session baru: default"
echo "  3. Scan QR Code dengan WA HP Anda"
echo "  4. Jalankan bot: pm2 start index.js --name cs-losmen"
echo ""
echo "  📊 Admin Panel API: http://$(curl -s ifconfig.me):3001/api/"
echo "  🔑 Login default: admin / losmen123"
echo "=================================================="
