require('dotenv').config();
const express    = require('express');
const path       = require('path');
const multer     = require('multer');

const app = express();

// ── View engine ──────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ────────────────────────────────────────────────────────────────────
const formRoutes      = require('./routes/form');
const questionRoutes  = require('./routes/questions');
const submissionRoutes = require('./routes/submissions');

app.use('/',           formRoutes);
app.use('/admin/questions', questionRoutes);
app.use('/submissions',     submissionRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { message: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  Server running at http://localhost:${PORT}`);
});