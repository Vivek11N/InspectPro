const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db/db');

// ── Helper: safely parse answers from any source ─────────────────────────────
function parseAnswers(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    // ✅ Decode HTML entities before parsing (handles &quot; &amp; etc.)
    const decoded = raw
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    try {
      return JSON.parse(decoded);
    } catch {
      try {
        return JSON.parse(decodeURIComponent(decoded));
      } catch {
        return {};
      }
    }
  }
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

// ── GET /image/:id — Serve image binary from PostgreSQL ──────────────────────
router.get('/image/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT image_data, mimetype, original_name FROM submission_images WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length || !rows[0].image_data) {
      return res.status(404).send('Image not found in database');
    }
    const img = rows[0];
    res.setHeader('Content-Type', img.mimetype || 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="${img.original_name}"`);
    res.send(img.image_data);
  } catch (err) { next(err); }
});

// ── GET / — Category selection page ──────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { rows: categories } = await pool.query('SELECT * FROM categories ORDER BY id');
    res.render('index', { categories });
  } catch (err) { next(err); }
});

// ── GET /form/:slug — Show questions for a step ───────────────────────────────
router.get('/form/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const group    = parseInt(req.query.group) || 1;
    const answers  = parseAnswers(req.query.answers);

    const { rows: cats } = await pool.query(
      'SELECT * FROM categories WHERE slug = $1', [slug]
    );
    if (!cats.length) return res.status(404).render('error', { message: 'Category not found' });
    const category = cats[0];

    const { rows: allQuestions } = await pool.query(
      'SELECT * FROM questions WHERE category_id = $1 ORDER BY group_index, order_index',
      [category.id]
    );

    // Normalise options to always be a JSON string for the template
    const normalisedQuestions = allQuestions.map(q => {
      if (q.options && typeof q.options !== 'string') {
        q.options = JSON.stringify(q.options);
      }
      return q;
    });

    const maxGroup = normalisedQuestions.reduce((m, q) => Math.max(m, q.group_index), 1);

    const groupQuestions = normalisedQuestions.filter(q => {
      if (q.group_index !== group) return false;
      // Apply conditional logic if present
      if (q.conditional_on_question_id && q.conditional_on_value) {
        const linkedAnswer = answers[String(q.conditional_on_question_id)];
        return String(linkedAnswer || '').trim().toLowerCase() ===
               String(q.conditional_on_value || '').trim().toLowerCase();
      }
      return true;
    });

    res.render('form', {
      category,
      questions: groupQuestions,
      group,
      maxGroup,
      isLastGroup: group >= maxGroup,
      answers,
      slug,
    });
  } catch (err) { next(err); }
});

// ── POST /form/:slug/step — Advance to next step ──────────────────────────────
router.post('/form/:slug/step', async (req, res, next) => {
  try {
    const { slug }    = req.params;
    const group       = parseInt(req.body._group) || 1;
    const prevAnswers = parseAnswers(req.body._answers);

    // Merge previous answers with this step's answers (strip internal fields)
    const stepAnswers = { ...req.body };
    delete stepAnswers._group;
    delete stepAnswers._answers;
    const answers = { ...prevAnswers, ...stepAnswers };

    const { rows: cats } = await pool.query(
      'SELECT * FROM categories WHERE slug = $1', [slug]
    );
    if (!cats.length) return res.status(404).render('error', { message: 'Category not found' });

    const { rows: allQuestions } = await pool.query(
      'SELECT * FROM questions WHERE category_id = $1 ORDER BY group_index, order_index',
      [cats[0].id]
    );

    const maxGroup    = allQuestions.reduce((m, q) => Math.max(m, q.group_index), 1);
    const answersJson = JSON.stringify(answers);

    if (group + 1 > maxGroup) {
      return res.redirect(`/form/${slug}/images?answers=${encodeURIComponent(answersJson)}`);
    }
    res.redirect(`/form/${slug}?group=${group + 1}&answers=${encodeURIComponent(answersJson)}`);
  } catch (err) { next(err); }
});

// ── GET /form/:slug/images — Image upload page ────────────────────────────────
router.get('/form/:slug/images', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const answers  = parseAnswers(req.query.answers);

    const { rows: cats } = await pool.query(
      'SELECT * FROM categories WHERE slug = $1', [slug]
    );
    if (!cats.length) return res.status(404).render('error', { message: 'Category not found' });

    res.render('images', {
      category:    cats[0],
      answers,
      slug,
      // ✅ Pass as plain JSON string — use <%- in template to avoid HTML escaping
      answersJson: JSON.stringify(answers),
    });
  } catch (err) { next(err); }
});

// ── POST /form/:slug/submit — Save submission + images ────────────────────────
router.post('/form/:slug/submit', upload.array('images', 10), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { slug } = req.params;

    // ✅ _answers comes from hidden input as plain JSON string
    const answers = parseAnswers(req.body._answers);

    // Debug log — remove once confirmed working
    console.log('[submit] RAW _answers:', req.body._answers);
    console.log('[submit] PARSED answers:', answers);

    const { rows: cats } = await pool.query(
      'SELECT * FROM categories WHERE slug = $1', [slug]
    );
    if (!cats.length) return res.status(404).render('error', { message: 'Category not found' });

    await client.query('BEGIN');

    const { rows: sub } = await client.query(
      `INSERT INTO form_submissions (category_id, answers)
       VALUES ($1, $2::jsonb) RETURNING id, submission_uuid`,
      [cats[0].id, JSON.stringify(answers)]
    );
    const submissionId   = sub[0].id;
    const submissionUuid = sub[0].submission_uuid;

    // Save images to DB as BYTEA
    if (req.files && req.files.length) {
      for (const file of req.files) {
        const imageBuffer = fs.readFileSync(file.path);
        await client.query(
          `INSERT INTO submission_images
             (submission_id, filename, original_name, mimetype, size, image_data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [submissionId, file.filename, file.originalname, file.mimetype, file.size, imageBuffer]
        );
        // Clean up temp file from disk after saving to DB
        fs.unlink(file.path, () => {});
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