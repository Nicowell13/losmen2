const express = require('express');
const db = require('../db');

const router = express.Router();

/**
 * GET /api/kamar — List semua tipe kamar
 */
router.get('/', async (req, res) => {
  try {
    const kamar = await db.getAllKamar();
    res.json(kamar);
  } catch (err) {
    console.error('[API Kamar]', err.message);
    res.status(500).json({ error: 'Gagal memuat data kamar.' });
  }
});

/**
 * POST /api/kamar — Tambah tipe kamar baru
 */
router.post('/', async (req, res) => {
  try {
    const { tipe, harga, total_kamar, fasilitas, keterangan } = req.body;
    if (!tipe || harga === undefined) {
      return res.status(400).json({ error: 'Tipe dan harga wajib diisi.' });
    }
    const kamar = await db.createKamar({ tipe, harga, total_kamar: total_kamar || 0, fasilitas, keterangan });
    res.status(201).json(kamar);
  } catch (err) {
    console.error('[API Kamar]', err.message);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Tipe kamar sudah ada.' });
    }
    res.status(500).json({ error: 'Gagal menambah kamar.' });
  }
});

/**
 * PUT /api/kamar/:id — Update kamar
 */
router.put('/:id', async (req, res) => {
  try {
    const { tipe, harga, total_kamar, fasilitas, keterangan } = req.body;
    const kamar = await db.updateKamar(req.params.id, { tipe, harga, total_kamar, fasilitas, keterangan });
    if (!kamar) {
      return res.status(404).json({ error: 'Kamar tidak ditemukan.' });
    }
    res.json(kamar);
  } catch (err) {
    console.error('[API Kamar]', err.message);
    res.status(500).json({ error: 'Gagal mengupdate kamar.' });
  }
});

/**
 * DELETE /api/kamar/:id — Hapus kamar
 */
router.delete('/:id', async (req, res) => {
  try {
    await db.deleteKamar(req.params.id);
    res.json({ message: 'Kamar berhasil dihapus.' });
  } catch (err) {
    console.error('[API Kamar]', err.message);
    res.status(500).json({ error: 'Gagal menghapus kamar.' });
  }
});

module.exports = router;
