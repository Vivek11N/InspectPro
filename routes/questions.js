const express = require('express');
const router  = express.Router();
const pool    = require('../db/db');

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
    res.render('admin/questions/index', { categories, questions });
  } catch (err) { next(err); }
});

// ── GET /admin/questions/new — New question form ──────────────────────────────
router.get('/new', async (req, res, next) => {
  try {
    const { rows: categories } = await pool.query('SELECT * FROM categories ORDER BY id');
    const { rows: allQuestions } = await pool.query(
      'SELECT id, question_text, field_name, field_type, options FROM questions ORDER BY group_index, order_index'
    );
    res.render('admin/questions/form', {
      categories,
      allQuestions,
      question: null,
      action: '/admin/questions',
      method: 'POST',
    });
  } catch (err) { next(err); }
});

// ── POST /admin/questions — Create question ───────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const {
      category_id, question_text, field_name, field_type,
      options_raw, order_index, group_index,
      conditional_on_field, conditional_on_value, is_required,
    } = req.body;

    let options = null;
    if (options_raw && options_raw.trim()) {
      options = JSON.stringify(options_raw.split('\n').map(s => s.trim()).filter(Boolean));
    }

    await pool.query(
      `INSERT INTO questions
         (category_id, question_text, field_name, field_type, options,
          order_index, group_index, conditional_on_field, conditional_on_value, is_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        category_id, question_text, field_name, field_type, options,
        order_index || 0, group_index || 1,
        conditional_on_field || null, conditional_on_value || null,
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

    const question = rows[0];
    // Convert options JSON array back to newline-separated text for the textarea
    if (question.options) {
      try { question.options_raw = JSON.parse(question.options).join('\n'); }
      catch { question.options_raw = ''; }
    }

    const { rows: allQuestions } = await pool.query(
      'SELECT id, question_text, field_name, field_type, options FROM questions WHERE id != $1 ORDER BY group_index, order_index',
      [req.params.id]
    );

    res.render('admin/questions/form', {
      categories,
      allQuestions,
      question,
      action: `/admin/questions/${question.id}?_method=PUT`,
      method: 'POST',
    });
  } catch (err) { next(err); }
});

// ── POST /admin/questions/:id?_method=PUT — Update question ───────────────────
router.post('/:id', async (req, res, next) => {
  try {
    // Support ?_method=PUT override
    const {
      category_id, question_text, field_name, field_type,
      options_raw, order_index, group_index,
      conditional_on_field, conditional_on_value, is_required,
    } = req.body;

    let options = null;
    if (options_raw && options_raw.trim()) {
      options = JSON.stringify(options_raw.split('\n').map(s => s.trim()).filter(Boolean));
    }

    await pool.query(
      `UPDATE questions SET
         category_id=$1, question_text=$2, field_name=$3, field_type=$4,
         options=$5, order_index=$6, group_index=$7,
         conditional_on_field=$8, conditional_on_value=$9,
         is_required=$10, updated_at=NOW()
       WHERE id=$11`,
      [
        category_id, question_text, field_name, field_type, options,
        order_index || 0, group_index || 1,
        conditional_on_field || null, conditional_on_value || null,
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