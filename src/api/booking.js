const express = require('express');
const db = require('../db');

const router = express.Router();

/**
 * GET /api/booking — List semua booking (dengan filter opsional)
 * Query params: ?status=confirmed&from=2026-01-01&to=2026-12-31
 */
router.get('/', async (req, res) => {
  try {
    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.from) filters.from = req.query.from;
    if (req.query.to) filters.to = req.query.to;

    const booking = await db.getAllBooking(filters);
    res.json(booking);
  } catch (err) {
    console.error('[API Booking]', err.message);
    res.status(500).json({ error: 'Gagal memuat data booking.' });
  }
});

/**
 * POST /api/booking — Tambah booking baru
 */
router.post('/', async (req, res) => {
  try {
    const { nama_tamu, no_hp, tipe_kamar, check_in, check_out, status, catatan } = req.body;
    if (!nama_tamu || !check_in || !check_out) {
      return res.status(400).json({ error: 'Nama tamu, check-in, dan check-out wajib diisi.' });
    }
    const booking = await db.createBooking({ nama_tamu, no_hp, tipe_kamar, check_in, check_out, status, catatan });
    res.status(201).json(booking);
  } catch (err) {
    console.error('[API Booking]', err.message);
    res.status(500).json({ error: 'Gagal menambah booking.' });
  }
});

/**
 * PUT /api/booking/:id — Update booking
 */
router.put('/:id', async (req, res) => {
  try {
    const { nama_tamu, no_hp, tipe_kamar, check_in, check_out, status, catatan } = req.body;
    const booking = await db.updateBooking(req.params.id, { nama_tamu, no_hp, tipe_kamar, check_in, check_out, status, catatan });
    if (!booking) {
      return res.status(404).json({ error: 'Booking tidak ditemukan.' });
    }
    res.json(booking);
  } catch (err) {
    console.error('[API Booking]', err.message);
    res.status(500).json({ error: 'Gagal mengupdate booking.' });
  }
});

/**
 * DELETE /api/booking/:id — Hapus booking
 */
router.delete('/:id', async (req, res) => {
  try {
    await db.deleteBooking(req.params.id);
    res.json({ message: 'Booking berhasil dihapus.' });
  } catch (err) {
    console.error('[API Booking]', err.message);
    res.status(500).json({ error: 'Gagal menghapus booking.' });
  }
});

module.exports = router;
