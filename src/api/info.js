const express = require('express');
const db = require('../db');

const router = express.Router();

/**
 * GET /api/info — List semua info/settings
 */
router.get('/', async (req, res) => {
  try {
    const info = await db.getAllInfo();
    res.json(info);
  } catch (err) {
    console.error('[API Info]', err.message);
    res.status(500).json({ error: 'Gagal memuat info.' });
  }
});

/**
 * PUT /api/info — Batch update info (key-value pairs)
 * Body: { items: [{ key: "deposit", value: "Rp 1.500.000" }, ...] }
 */
router.put('/', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Format: { items: [{ key, value }] }' });
    }

    const results = [];
    for (const item of items) {
      if (item.key && item.value) {
        const result = await db.upsertInfo(item.key, item.value);
        results.push(result);
      }
    }

    res.json({ message: 'Info berhasil diupdate.', data: results });
  } catch (err) {
    console.error('[API Info]', err.message);
    res.status(500).json({ error: 'Gagal mengupdate info.' });
  }
});

/**
 * DELETE /api/info/:id — Hapus info
 */
router.delete('/:id', async (req, res) => {
  try {
    await db.deleteInfo(req.params.id);
    res.json({ message: 'Info berhasil dihapus.' });
  } catch (err) {
    console.error('[API Info]', err.message);
    res.status(500).json({ error: 'Gagal menghapus info.' });
  }
});

module.exports = router;
