const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const config = require('./config');

// ============================================================
// PostgreSQL Connection Pool
// ============================================================
const pool = new Pool({ connectionString: config.database.url });

pool.on('error', (err) => {
  console.error('[DB] Pool error:', err.message);
});

// ============================================================
// In-Memory Cache — bot membaca dari sini (<1ms)
// ============================================================
let cachedData = {
  kamar: [],
  booking: [],
  info: {},
  terakhirDiperbarui: null
};

// ============================================================
// Helper: Parse tanggal fleksibel (dd/mm/yyyy, yyyy-mm-dd, dd-mm-yyyy)
// ============================================================
function parseFlexDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = dateStr.trim();

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00+07:00');
    return isNaN(d) ? null : d;
  }

  const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    const d = new Date(`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}T00:00:00+07:00`);
    return isNaN(d) ? null : d;
  }

  return null;
}

// ============================================================
// Helper: Format tanggal ke string dd/mm/yyyy
// ============================================================
function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// ============================================================
// Helper: Nama hari dalam Bahasa Indonesia
// ============================================================
function getNamaHari(date) {
  const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return hari[new Date(date).getDay()];
}

// ============================================================
// Inisialisasi Tabel Database
// ============================================================
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS kamar (
        id SERIAL PRIMARY KEY,
        tipe VARCHAR(100) NOT NULL UNIQUE,
        harga INTEGER NOT NULL DEFAULT 0,
        total_kamar INTEGER NOT NULL DEFAULT 0,
        fasilitas TEXT DEFAULT '',
        keterangan TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS booking (
        id SERIAL PRIMARY KEY,
        nama_tamu VARCHAR(200) NOT NULL,
        no_hp VARCHAR(50),
        tipe_kamar VARCHAR(100),
        check_in DATE NOT NULL,
        check_out DATE NOT NULL,
        status VARCHAR(50) DEFAULT 'confirmed',
        catatan TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS info (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) NOT NULL UNIQUE,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS admin (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('[DB] Tabel berhasil diinisialisasi.');

    // Seed data jika kosong
    await seedIfEmpty(client);
  } finally {
    client.release();
  }
}

// ============================================================
// Seed Data Awal (hanya jika tabel masih kosong)
// ============================================================
async function seedIfEmpty(client) {
  // Seed Kamar
  const { rows: kamarRows } = await client.query('SELECT COUNT(*) FROM kamar');
  if (parseInt(kamarRows[0].count) === 0) {
    await client.query(`
      INSERT INTO kamar (tipe, harga, total_kamar, fasilitas, keterangan) VALUES
      ('Sendiri (1 orang)', 3300000, 40, 'AC, Kamar Mandi Dalam, Air Panas, WiFi Mikrotik, Cleaning Service, Parkir (berbayar)', 'Ukuran kamar 6x4 meter. Listrik token (prabayar). Tidak ada laundry di lokasi, namun tersedia layanan laundry antar-jemput langganan.'),
      ('Berdua (2 orang)', 4300000, 40, 'AC, Kamar Mandi Dalam, Air Panas, WiFi Mikrotik, Cleaning Service, Parkir (berbayar)', 'Ukuran kamar 6x4 meter. Listrik token (prabayar). Tidak ada laundry di lokasi, namun tersedia layanan laundry antar-jemput langganan.')
    `);
    console.log('[DB] Seed: 2 tipe kamar ditambahkan.');
  }

  // Seed Info
  const { rows: infoRows } = await client.query('SELECT COUNT(*) FROM info');
  if (parseInt(infoRows[0].count) === 0) {
    await client.query(`
      INSERT INTO info (key, value) VALUES
      ('deposit', 'Rp 1.500.000 (refundable / bisa dikembalikan)'),
      ('ukuran_kamar', '6 x 4 meter (cukup luas)'),
      ('listrik', 'Token prabayar (tidak termasuk harga sewa)'),
      ('laundry', 'Tidak tersedia di lokasi, namun ada layanan laundry antar-jemput yang biasa menjadi langganan penghuni'),
      ('parkir', 'Tersedia (berbayar)'),
      ('checkin', 'Flexible — hubungi admin untuk jadwal check-in/check-out')
    `);
    console.log('[DB] Seed: Info losmen ditambahkan.');
  }

  // Seed Admin (default: admin / losmen123)
  const { rows: adminRows } = await client.query('SELECT COUNT(*) FROM admin');
  if (parseInt(adminRows[0].count) === 0) {
    const hash = await bcrypt.hash('losmen123', 10);
    await client.query(
      'INSERT INTO admin (username, password_hash) VALUES ($1, $2)',
      ['admin', hash]
    );
    console.log('[DB] Seed: Admin default (admin/losmen123) ditambahkan.');
  }
}

// ============================================================
// Update Cache dari PostgreSQL
// ============================================================
async function updateCache() {
  try {
    const { rows: kamar } = await pool.query('SELECT * FROM kamar ORDER BY id');
    const { rows: booking } = await pool.query('SELECT * FROM booking ORDER BY id DESC');
    const { rows: infoRaw } = await pool.query('SELECT * FROM info');

    cachedData.kamar = kamar.map(k => ({
      tipe: k.tipe,
      harga: k.harga,
      totalKamar: k.total_kamar,
      fasilitas: k.fasilitas,
      keterangan: k.keterangan || ''
    }));

    cachedData.booking = booking.map(b => ({
      namaTamu: b.nama_tamu,
      noHp: b.no_hp,
      tipeKamar: b.tipe_kamar,
      checkIn: b.check_in instanceof Date ? b.check_in.toISOString().split('T')[0] : b.check_in,
      checkOut: b.check_out instanceof Date ? b.check_out.toISOString().split('T')[0] : b.check_out,
      status: (b.status || '').toLowerCase()
    }));

    const infoMap = {};
    infoRaw.forEach(row => {
      if (row.key && row.value) infoMap[row.key.toLowerCase()] = row.value;
    });
    cachedData.info = infoMap;

    cachedData.terakhirDiperbarui = new Date();
    console.log(`[DB Cache] Updated! ${cachedData.kamar.length} tipe kamar, ${cachedData.booking.length} booking.`);
  } catch (err) {
    console.error('[DB Cache Error]', err.message);
  }
}

// Auto-refresh setiap 2 menit (PostgreSQL lokal lebih cepat dari Google Sheets)
setInterval(updateCache, 2 * 60 * 1000);

// ============================================================
// Hitung total booking aktif pada tanggal tertentu
// Untuk kos: semua tipe kamar berbagi pool kamar yang sama
// ============================================================
function countActiveBookings(targetDate) {
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  let totalBooked = 0;
  const countsByType = {};

  cachedData.booking.forEach(b => {
    const status = b.status.toLowerCase();
    if (status === 'cancelled' || status === 'batal' || status === 'checked out' || status === 'selesai') {
      return;
    }

    const ci = parseFlexDate(b.checkIn);
    const co = parseFlexDate(b.checkOut);
    if (!ci || !co) return;

    ci.setHours(0, 0, 0, 0);
    co.setHours(0, 0, 0, 0);

    if (target >= ci && target < co) {
      totalBooked++;
      const tipe = b.tipeKamar.trim();
      countsByType[tipe] = (countsByType[tipe] || 0) + 1;
    }
  });

  return { totalBooked, countsByType };
}

// ============================================================
// Cek ketersediaan kamar pada tanggal tertentu
// Semua tipe kamar berbagi pool 40 kamar fisik yang sama
// ============================================================
function getAvailabilityByDate(targetDate) {
  const { totalBooked } = countActiveBookings(targetDate);

  // Ambil total kamar fisik (gunakan nilai terbesar dari semua tipe)
  const totalFisik = cachedData.kamar.length > 0
    ? Math.max(...cachedData.kamar.map(k => k.totalKamar))
    : 40;

  const tersedia = Math.max(0, totalFisik - totalBooked);

  return cachedData.kamar.map(k => ({
    tipe: k.tipe,
    harga: k.harga,
    totalKamar: totalFisik,
    terpakai: totalBooked,
    tersedia: tersedia,
    fasilitas: k.fasilitas
  }));
}

// ============================================================
// Kalender ketersediaan 7 hari ke depan
// ============================================================
function getWeeklyAvailability(startDate) {
  const start = startDate ? new Date(startDate) : new Date();
  start.setHours(0, 0, 0, 0);

  let result = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);

    const namaHari = getNamaHari(date);
    const tanggal = formatDate(date);
    const availability = getAvailabilityByDate(date);

    const summary = availability.map(k => {
      if (k.tersedia > 0) {
        return `  • ${k.tipe}: ${k.tersedia}/${k.totalKamar} kamar kosong (Rp${k.harga.toLocaleString('id-ID')}/bulan)`;
      } else {
        return `  • ${k.tipe}: PENUH`;
      }
    }).join('\n');

    result.push(`📅 ${namaHari}, ${tanggal}:\n${summary}`);
  }

  return result.join('\n\n');
}

// ============================================================
// Backward-compatible functions
// ============================================================
function getAvailabilityData() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return getAvailabilityByDate(today);
}

function getInfoData() {
  return cachedData.info;
}

function getBookingData() {
  return cachedData.booking;
}

// ============================================================
// CRUD Functions (untuk API admin)
// ============================================================

// --- Kamar ---
async function getAllKamar() {
  const { rows } = await pool.query('SELECT * FROM kamar ORDER BY id');
  return rows;
}

async function createKamar(data) {
  const { rows } = await pool.query(
    'INSERT INTO kamar (tipe, harga, total_kamar, fasilitas, keterangan) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [data.tipe, data.harga, data.total_kamar, data.fasilitas || '', data.keterangan || '']
  );
  await updateCache();
  return rows[0];
}

async function updateKamar(id, data) {
  const { rows } = await pool.query(
    'UPDATE kamar SET tipe=$1, harga=$2, total_kamar=$3, fasilitas=$4, keterangan=$5, updated_at=NOW() WHERE id=$6 RETURNING *',
    [data.tipe, data.harga, data.total_kamar, data.fasilitas || '', data.keterangan || '', id]
  );
  await updateCache();
  return rows[0];
}

async function deleteKamar(id) {
  await pool.query('DELETE FROM kamar WHERE id=$1', [id]);
  await updateCache();
}

// --- Booking ---
async function getAllBooking(filters = {}) {
  let query = 'SELECT * FROM booking';
  const params = [];
  const conditions = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`check_in >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    conditions.push(`check_out <= $${params.length}`);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY created_at DESC';

  const { rows } = await pool.query(query, params);
  return rows;
}

async function createBooking(data) {
  const { rows } = await pool.query(
    'INSERT INTO booking (nama_tamu, no_hp, tipe_kamar, check_in, check_out, status, catatan) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
    [data.nama_tamu, data.no_hp || '', data.tipe_kamar, data.check_in, data.check_out, data.status || 'confirmed', data.catatan || '']
  );
  await updateCache();
  return rows[0];
}

async function updateBooking(id, data) {
  const { rows } = await pool.query(
    'UPDATE booking SET nama_tamu=$1, no_hp=$2, tipe_kamar=$3, check_in=$4, check_out=$5, status=$6, catatan=$7, updated_at=NOW() WHERE id=$8 RETURNING *',
    [data.nama_tamu, data.no_hp || '', data.tipe_kamar, data.check_in, data.check_out, data.status || 'confirmed', data.catatan || '', id]
  );
  await updateCache();
  return rows[0];
}

async function deleteBooking(id) {
  await pool.query('DELETE FROM booking WHERE id=$1', [id]);
  await updateCache();
}

// --- Info ---
async function getAllInfo() {
  const { rows } = await pool.query('SELECT * FROM info ORDER BY id');
  return rows;
}

async function upsertInfo(key, value) {
  const { rows } = await pool.query(
    `INSERT INTO info (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()
     RETURNING *`,
    [key, value]
  );
  await updateCache();
  return rows[0];
}

async function deleteInfo(id) {
  await pool.query('DELETE FROM info WHERE id=$1', [id]);
  await updateCache();
}

// --- Admin ---
async function findAdmin(username) {
  const { rows } = await pool.query('SELECT * FROM admin WHERE username=$1', [username]);
  return rows[0] || null;
}

// --- Dashboard Stats ---
async function getDashboardStats() {
  const totalFisik = cachedData.kamar.length > 0
    ? Math.max(...cachedData.kamar.map(k => k.totalKamar))
    : 40;

  const { totalBooked } = countActiveBookings(new Date());
  const tersedia = Math.max(0, totalFisik - totalBooked);

  const { rows: totalBookingRows } = await pool.query('SELECT COUNT(*) FROM booking');
  const { rows: activeBookingRows } = await pool.query(
    "SELECT COUNT(*) FROM booking WHERE status NOT IN ('cancelled', 'batal', 'checked out', 'selesai')"
  );

  return {
    totalKamar: totalFisik,
    terisi: totalBooked,
    tersedia: tersedia,
    occupancyRate: totalFisik > 0 ? Math.round((totalBooked / totalFisik) * 100) : 0,
    totalBooking: parseInt(totalBookingRows[0].count),
    activeBooking: parseInt(activeBookingRows[0].count),
    tipeKamar: cachedData.kamar.length
  };
}

module.exports = {
  pool,
  initDatabase,
  updateCache,
  // Chatbot compatibility (same interface as sheets.js)
  getAvailabilityData,
  getAvailabilityByDate,
  getWeeklyAvailability,
  getBookingData,
  getInfoData,
  parseFlexDate,
  formatDate,
  // Admin CRUD
  getAllKamar, createKamar, updateKamar, deleteKamar,
  getAllBooking, createBooking, updateBooking, deleteBooking,
  getAllInfo, upsertInfo, deleteInfo,
  findAdmin,
  getDashboardStats
};
