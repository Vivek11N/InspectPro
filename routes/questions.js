const express = require('express');
const router  = express.Router();
const pool    = require('../db/db');

// ── Helper: normalise options from DB to a JS array ──────────────────────────
// Handles three formats that may exist in the DB:
//   • proper JSON array  →  '["A","B"]'
//   • plain CSV string   →  'A,B,C'
//   • null / empty
function parseOptions(raw) {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw; // already parsed by pg driver
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    // Make sure it really is an array
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    // Fall back: treat as comma-separated
    return trimmed.split(',').map(s => s.trim()).filter(Boolean);
  }
}

// Apply normalisation to every question row coming out of the DB.
// After this call, q.options is ALWAYS either null or a valid JSON string.
function normaliseQuestions(rows) {
  return rows.map(q => {
    const arr = parseOptions(q.options);
    q.options = arr ? JSON.stringify(arr) : null;
    return q;
  });
}

// ── GET /admin/questions — List all questions ─────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { rows: categories } = await pool.query('SELECT * FROM categories ORDER BY id');
    const { rows: questions }  = await pool.query(
      `SELECT q.*, c.name AS category_name
       FROM questions q
       JOIN categories c ON c.id = q.category_id
       ORDER BY c.id, q.group_index, q.order_index`
    );
    res.render('admin/questions/index', { categories, questions: normaliseQuestions(questions) });
  } catch (err) { next(err); }
});

// ── GET /admin/questions/new — New question form ──────────────────────────────
router.get('/new', async (req, res, next) => {
  try {
    const { rows: categories } = await pool.query('SELECT * FROM categories ORDER BY id');
    const { rows: allQuestions } = await pool.query(
      'SELECT id, question_text, field_type, options FROM questions ORDER BY group_index, order_index'
    );
    res.render('admin/questions/form', {
      categories,
      allQuestions: normaliseQuestions(allQuestions),
      question: null,
      action: '/admin/questions',
      method: 'POST',
    });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const {
     category_id, question_text, field_type, 
      options_raw, order_index, group_index,
      conditional_on_question_id, conditional_on_value, is_required,
    } = req.body;

    // Auto-generate field_name from question_text
    const field_name = question_text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    let options = null;
    if (options_raw && options_raw.trim()) {
      options = JSON.stringify(options_raw.split('\n').map(s => s.trim()).filter(Boolean));
    }

    await pool.query(
  `INSERT INTO questions
     (category_id, question_text, field_name, field_type, options,
      order_index, group_index, conditional_on_question_id, conditional_on_value, is_required)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
  [
    category_id, question_text, field_name, field_type, options,
    order_index || 0, group_index || 1,
    conditional_on_question_id || null, conditional_on_value || null,
    is_required === 'on' || is_required === 'true',
  ]
);
    res.redirect('/admin/questions');
  } catch (err) { next(err); }
});

// ── GET /admin/questions/:id/edit — Edit form ─────────────────────────────────
router.get('/:id/edit', async (req, res, next) => {
  try {
    const { rows: categories } = await pool.query('SELECT * FROM categories ORDER BY id');
    const { rows }             = await pool.query('SELECT * FROM questions WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).render('error', { message: 'Question not found' });

    const [question] = normaliseQuestions(rows);

    // Build newline-separated text for the textarea from the now-clean JSON
    if (question.options) {
      try { question.options_raw = JSON.parse(question.options).join('\n'); }
      catch { question.options_raw = ''; }
    } else {
      question.options_raw = '';
    }

    const { rows: allQuestions } = await pool.query(
      'SELECT id, question_text, field_type, options FROM questions WHERE id != $1 ORDER BY group_index, order_index',
      [req.params.id]
    );

    res.render('admin/questions/form', {
      categories,
      allQuestions: normaliseQuestions(allQuestions),
      question,
      action: `/admin/questions/${question.id}?_method=PUT`,
      method: 'POST',
    });
  } catch (err) { next(err); }
});

// ── POST /admin/questions/:id?_method=PUT — Update question ───────────────────
router.post('/:id', async (req, res, next) => {
  try {
    const {
      category_id, question_text, field_type,
      options_raw, order_index, group_index,
      conditional_on_question_id, conditional_on_value, is_required,
    } = req.body;

    let options = null;
    if (options_raw && options_raw.trim()) {
      options = JSON.stringify(options_raw.split('\n').map(s => s.trim()).filter(Boolean));
    }

    await pool.query(
      `UPDATE questions SET
         category_id=$1, question_text=$2, field_type=$3,
         options=$4, order_index=$5, group_index=$6,
         conditional_on_question_id=$7, conditional_on_value=$8,
         is_required=$9, updated_at=NOW()
       WHERE id=$10`,
      [
        category_id, question_text, field_type, options,
        order_index || 0, group_index || 1,
        conditional_on_question_id || null, conditional_on_value || null,
        is_required === 'on' || is_required === 'true',
        req.params.id,
      ]
    );
    res.redirect('/admin/questions');
  } catch (err) { next(err); }
});

// ── POST /admin/questions/:id/delete — Delete question ────────────────────────
router.post('/:id/delete', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM questions WHERE id=$1', [req.params.id]);
    res.redirect('/admin/questions');
  } catch (err) { next(err); }
});

module.exports = router;