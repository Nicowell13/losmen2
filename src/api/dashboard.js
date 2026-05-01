const express = require('express');
const db = require('../db');

const router = express.Router();

/**
 * GET /api/dashboard — Statistik dashboard admin
 */
router.get('/', async (req, res) => {
  try {
    const stats = await db.getDashboardStats();
    res.json(stats);
  } catch (err) {
    console.error('[API Dashboard]', err.message);
    res.status(500).json({ error: 'Gagal memuat dashboard.' });
  }
});

module.exports = router;
