const express = require('express');
const router  = express.Router();
const pool    = require('../db/db');

// ── GET /submissions — List all submissions ───────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT fs.id, fs.submission_uuid, fs.submitted_at,
              c.name AS category_name,
              (SELECT COUNT(*) FROM submission_images si WHERE si.submission_id = fs.id) AS image_count
       FROM form_submissions fs
       JOIN categories c ON c.id = fs.category_id
       ORDER BY fs.submitted_at DESC`
    );
    res.render('submissions/index', { submissions: rows });
  } catch (err) { next(err); }
});

// ── GET /submissions/:uuid/thankyou — MUST be before /:uuid ──────────────────
router.get('/:uuid/thankyou', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT fs.*, c.name AS category_name
       FROM form_submissions fs
       JOIN categories c ON c.id = fs.category_id
       WHERE fs.submission_uuid = $1`,
      [req.params.uuid]
    );
    if (!rows.length) return res.status(404).render('error', { message: 'Submission not found' });
    res.render('submissions/thankyou', { submission: rows[0] });
  } catch (err) { next(err); }
});

// ── GET /submissions/:uuid — View a single submission ────────────────────────
router.get('/:uuid', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
  `SELECT fs.*, c.name AS category_name, l.name AS location_name
   FROM form_submissions fs
   JOIN categories c ON c.id = fs.category_id
   LEFT JOIN locations l ON l.id = fs.location_id
   WHERE fs.submission_uuid = $1`,
  [req.params.uuid]
);
    if (!rows.length) return res.status(404).render('error', { message: 'Submission not found' });

    const submission = rows[0];

    // ✅ Ensure answers is always a parsed object, not a raw string
    if (typeof submission.answers === 'string') {
      try { submission.answers = JSON.parse(submission.answers); }
      catch { submission.answers = {}; }
    }
    submission.answers = submission.answers || {};

    const { rows: images } = await pool.query(
      'SELECT * FROM submission_images WHERE submission_id = $1 ORDER BY uploaded_at',
      [submission.id]
    );

    // Load question labels for the answers
    const { rows: questions } = await pool.query(
      'SELECT id, question_text FROM questions WHERE category_id = $1 ORDER BY group_index, order_index',
      [submission.category_id]
    );
    const labelMap = {};
    questions.forEach(q => { labelMap[String(q.id)] = q.question_text; });

    res.render('submissions/details', { submission, images, labelMap });
  } catch (err) { next(err); }
});

module.exports = router;