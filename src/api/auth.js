const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/login
 * Login admin → return JWT token
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan password wajib diisi.' });
    }

    const admin = await db.findAdmin(username);
    if (!admin) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.json({
      message: 'Login berhasil!',
      token,
      admin: { id: admin.id, username: admin.username }
    });
  } catch (err) {
    console.error('[Auth Error]', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

/**
 * GET /api/auth/me
 * Cek token → return user info
 */
router.get('/me', authMiddleware, (req, res) => {
  res.json({ admin: req.admin });
});

module.exports = router;
