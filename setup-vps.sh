#!/bin/bash
# =====================================================
# VPS Ubuntu 22.04 Setup Script — Hybrid WA Bot
# Run as root: chmod +x setup-vps.sh && ./setup-vps.sh
# =====================================================

set -e

echo "=================================================="
echo "  🏨 Setup VPS Hybrid WA Bot (Node.js + Ollama)"
echo "=================================================="

# =====================================================
# 0. SWAP RAM (4GB) — PENTING untuk VPS 8GB + Ollama
# =====================================================
echo ""
echo "[0/5] Membuat Swap 4GB..."

if [ -f /swapfile ]; then
    echo "  → Swapfile sudah ada, skip."
else
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile

    # Jadikan permanen (survive reboot)
    echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab

    # Optimalkan swap agar tidak terlalu agresif
    sysctl vm.swappiness=10
    echo 'vm.swappiness=10' | tee -a /etc/sysctl.conf

    echo "  ✅ Swap 4GB aktif!"
fi

# Tampilkan status RAM + Swap
free -h
echo ""

# =====================================================
# 1. Update Ubuntu (NON-INTERACTIVE agar tidak stuck)
# =====================================================
echo "[1/5] Update paket Ubuntu (non-interactive)..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
sudo apt-get install -y curl git

# =====================================================
# 2. Install Node.js 20 LTS
# =====================================================
echo ""
echo "[2/5] Install Node.js 20 LTS..."
if command -v node &> /dev/null; then
    echo "  → Node.js sudah terinstall: $(node -v)"
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "  Node: $(node -v) | NPM: $(npm -v)"

# =====================================================
# 3. Install PM2
# =====================================================
echo ""
echo "[3/5] Install PM2 Process Manager..."
if command -v pm2 &> /dev/null; then
    echo "  → PM2 sudah terinstall."
else
    sudo npm install -g pm2
fi

# Setup PM2 auto-start saat VPS reboot
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# =====================================================
# 4. Install Ollama + Model qwen2.5:1.5b
# =====================================================
echo ""
echo "[4/5] Install Ollama..."
if command -v ollama &> /dev/null; then
    echo "  → Ollama sudah terinstall."
else
    curl -fsSL https://ollama.com/install.sh | sh
fi

# Pastikan Ollama service jalan
sudo systemctl enable ollama 2>/dev/null || true
sudo systemctl start ollama 2>/dev/null || true

# Tunggu Ollama siap
echo "  Menunggu Ollama siap..."
sleep 5

echo ""
echo "[5/5] Download model qwen2.5:1.5b..."
ollama pull qwen2.5:1.5b

# =====================================================
# 6. Install Dependencies Bot (jika ada package.json)
# =====================================================
echo ""
if [ -f "package.json" ]; then
    echo "[Bonus] Menginstall npm dependencies..."
    npm install
fi

# =====================================================
# SELESAI
# =====================================================
echo ""
echo "=================================================="
echo "  ✅ SETUP VPS SELESAI!"
echo "=================================================="
echo ""
echo "  RAM + Swap saat ini:"
free -h
echo ""
echo "  Langkah selanjutnya:"
echo "  1. Edit file .env → masukkan info losmen Anda"
echo "  2. Jalankan bot:  node index.js"
echo "  3. Scan pairing code dari WhatsApp"
echo "  4. Setelah OK:    pm2 start index.js --name cs-losmen"
echo "  5. Simpan state:  pm2 save"
echo "=================================================="
