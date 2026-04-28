const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db/db');

// ── parseAnswers: handles encoded, double-encoded, and plain JSON ─────────────
function parseAnswers(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;

  // Attempt 1: plain JSON (what we get from query string after express decodes it)
  try { return JSON.parse(raw); } catch {}

  // Attempt 2: decode once then parse
  try { return JSON.parse(decodeURIComponent(raw)); } catch {}

  // Attempt 3: decode twice then parse (double-encoded)
  try { return JSON.parse(decodeURIComponent(decodeURIComponent(raw))); } catch {}

  return {};
}

// ── Multer setup ──────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) &&
               allowed.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Only image files are allowed'));
  },
});

// ── GET /image/:id ────────────────────────────────────────────────────────────
router.get('/image/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT image_data, mimetype, original_name FROM submission_images WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length || !rows[0].image_data)
      return res.status(404).send('Image not found in database');
    const img = rows[0];
    res.setHeader('Content-Type', img.mimetype || 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="${img.original_name}"`);
    res.send(img.image_data);
  } catch (err) { next(err); }
});

// ── GET / — Category selection ────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { rows: categories } = await pool.query('SELECT * FROM categories ORDER BY id');
    res.render('index', { categories });
  } catch (err) { next(err); }
});

// ── GET /form/:slug ───────────────────────────────────────────────────────────
router.get('/form/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const group    = parseInt(req.query.group) || 1;
    const answers  = parseAnswers(req.query.answers);
    const locationId = req.query.location_id || '';

    const { rows: cats } = await pool.query('SELECT * FROM categories WHERE slug = $1', [slug]);
    if (!cats.length) return res.status(404).render('error', { message: 'Category not found' });
    const category = cats[0];

    const { rows: allQuestions } = await pool.query(
      'SELECT * FROM questions WHERE category_id = $1 ORDER BY group_index, order_index',
      [category.id]
    );

    const maxGroup = allQuestions.reduce((m, q) => Math.max(m, q.group_index), 1);

    const groupQuestions = allQuestions.filter(q => {
      if (q.group_index !== group) return false;
      if (q.conditional_on_question_id && q.conditional_on_value) {
        const linkedAnswer = answers[String(q.conditional_on_question_id)];
        return String(linkedAnswer || '').trim().toLowerCase() ===
               String(q.conditional_on_value).trim().toLowerCase();
      }
      return true;
    });

    let locations = [];
    if (group === 1) {
      const { rows } = await pool.query('SELECT * FROM locations ORDER BY name');
      locations = rows;
    }

    res.render('form', {
      category, questions: groupQuestions, group,
      maxGroup, isLastGroup: group >= maxGroup,
      answers, slug, locations, locationId,
    });
  } catch (err) { next(err); }
});

// ── POST /form/:slug/step ─────────────────────────────────────────────────────
router.post('/form/:slug/step', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const group    = parseInt(req.body._group) || 1;

    // ── Parse previous answers carried from the hidden field ─────────────────
    // The hidden field value is encodeURIComponent(JSON.stringify(answers)).
    // express urlencoded middleware decodes it once, so we receive a plain
    // JSON string — JSON.parse is sufficient, but fallbacks cover edge cases.
    const prevAnswers = parseAnswers(req.body._answers);
    const locationId  = req.body._location_id || '';

    // ── Collect only this step's answers ─────────────────────────────────────
    const stepAnswers = {};
    Object.keys(req.body).forEach(key => {
      // Skip all internal hidden fields
      if (key.startsWith('_')) return;
      stepAnswers[key] = req.body[key];
    });

    // Merge: previous answers + this step's answers
    const answers = { ...prevAnswers, ...stepAnswers };

    console.log('--- STEP POST DEBUG ---');
    console.log('group:', group);
    console.log('prevAnswers:', prevAnswers);
    console.log('stepAnswers:', stepAnswers);
    console.log('merged answers:', answers);
    console.log('locationId:', locationId);

    const { rows: cats } = await pool.query('SELECT * FROM categories WHERE slug = $1', [slug]);
    if (!cats.length) return res.status(404).render('error', { message: 'Category not found' });

    const { rows: allQuestions } = await pool.query(
      'SELECT * FROM questions WHERE category_id = $1 ORDER BY group_index, order_index',
      [cats[0].id]
    );

    const maxGroup = allQuestions.reduce((m, q) => Math.max(m, q.group_index), 1);
    const answersJson = JSON.stringify(answers);

    if (group + 1 > maxGroup) {
      return res.redirect(
        `/form/${slug}/images?answers=${encodeURIComponent(answersJson)}&location_id=${encodeURIComponent(locationId)}`
      );
    }

    res.redirect(
      `/form/${slug}?group=${group + 1}&answers=${encodeURIComponent(answersJson)}&location_id=${encodeURIComponent(locationId)}`
    );
  } catch (err) { next(err); }
});

// ── GET /form/:slug/images ────────────────────────────────────────────────────
router.get('/form/:slug/images', async (req, res, next) => {
  try {
    const { slug }   = req.params;
    const answers    = parseAnswers(req.query.answers);
    const locationId = req.query.location_id || '';

    const { rows: cats } = await pool.query('SELECT * FROM categories WHERE slug = $1', [slug]);
    if (!cats.length) return res.status(404).render('error', { message: 'Category not found' });

    res.render('images', {
      category: cats[0], answers, slug,
      answersJson: encodeURIComponent(JSON.stringify(answers)),
      locationId,
    });
  } catch (err) { next(err); }
});

// ── POST /form/:slug/submit ───────────────────────────────────────────────────
router.post('/form/:slug/submit', upload.array('images', 10), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { slug }   = req.params;
    const answers    = parseAnswers(req.body._answers);
    const locationId = req.body._location_id ? parseInt(req.body._location_id) : null;

    console.log('--- SUBMIT DEBUG ---');
    console.log('answers:', answers);
    console.log('locationId:', locationId);

    const { rows: cats } = await pool.query('SELECT * FROM categories WHERE slug = $1', [slug]);
    if (!cats.length) return res.status(404).render('error', { message: 'Category not found' });

    await client.query('BEGIN');

    const { rows: sub } = await client.query(
      `INSERT INTO form_submissions (category_id, answers, location_id)
       VALUES ($1, $2, $3) RETURNING id, submission_uuid`,
      [cats[0].id, JSON.stringify(answers), locationId]
    );

    const submissionId   = sub[0].id;
    const submissionUuid = sub[0].submission_uuid;

    if (req.files && req.files.length) {
      for (const file of req.files) {
        const imageBuffer = fs.readFileSync(file.path);
        await client.query(
          `INSERT INTO submission_images
             (submission_id, filename, original_name, mimetype, size, image_data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [submissionId, file.filename, file.originalname, file.mimetype, file.size, imageBuffer]
        );
      }
    }

    await client.query('COMMIT');
    res.redirect(`/submissions/${submissionUuid}/thankyou`);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;