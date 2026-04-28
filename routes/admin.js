const express = require('express');
const router  = express.Router();
const pool    = require('../db/db');

// ── GET /admin/locations ──────────────────────────────────────────────────────
router.get('/locations', async (req, res, next) => {
  try {
    const { rows: locations } = await pool.query('SELECT * FROM locations ORDER BY name');
    res.render('admin/locations/index', { locations });
  } catch (err) { next(err); }
});

// ── GET /admin/locations/new ──────────────────────────────────────────────────
router.get('/locations/new', (req, res) => {
  res.render('admin/locations/form', { location: null, action: '/admin/locations' });
});

// ── POST /admin/locations — Create ────────────────────────────────────────────
router.post('/locations', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.redirect('/admin/locations');
    await pool.query(
      'INSERT INTO locations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [name]
    );
    res.redirect('/admin/locations');
  } catch (err) { next(err); }
});

// ── GET /admin/locations/:id/edit ─────────────────────────────────────────────
router.get('/locations/:id/edit', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM locations WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).render('error', { message: 'Location not found' });
    res.render('admin/locations/form', {
      location: rows[0],
      action: '/admin/locations/' + req.params.id + '/edit',
    });
  } catch (err) { next(err); }
});

// ── POST /admin/locations/:id/edit — Update ───────────────────────────────────
router.post('/locations/:id/edit', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.redirect('/admin/locations');
    await pool.query('UPDATE locations SET name = $1 WHERE id = $2', [name, req.params.id]);
    res.redirect('/admin/locations');
  } catch (err) { next(err); }
});

// ── POST /admin/locations/:id/delete — Delete ─────────────────────────────────
router.post('/locations/:id/delete', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM locations WHERE id = $1', [req.params.id]);
    res.redirect('/admin/locations');
  } catch (err) { next(err); }
});

module.exports = router;