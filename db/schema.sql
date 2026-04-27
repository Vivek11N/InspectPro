-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Questions table
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  field_type VARCHAR(50) NOT NULL DEFAULT 'text',
  -- field_type options: text | textarea | number | yesno | select | radio
  options JSONB,           -- for select/radio: ["Option A","Option B"]
  order_index INTEGER NOT NULL DEFAULT 0,
  group_index INTEGER NOT NULL DEFAULT 1,    -- which "step/page" this question belongs to
  conditional_on_field VARCHAR(100),         -- show only when this field...
  conditional_on_value TEXT,                 -- ...equals this value
  is_required BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Form submissions
CREATE TABLE IF NOT EXISTS form_submissions (
  id SERIAL PRIMARY KEY,
  submission_uuid UUID DEFAULT uuid_generate_v4(),
  category_id INTEGER REFERENCES categories(id),
  submitted_at TIMESTAMP DEFAULT NOW(),
  answers JSONB NOT NULL DEFAULT '{}'
);

-- Images linked to a submission
CREATE TABLE IF NOT EXISTS submission_images (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER REFERENCES form_submissions(id) ON DELETE CASCADE,
  filename VARCHAR(500) NOT NULL,
  original_name VARCHAR(500),
  mimetype VARCHAR(100),
  size INTEGER,
  image_data BYTEA,          -- actual image binary stored in DB
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- If you already created the table without image_data, run this once:
-- ALTER TABLE submission_images ADD COLUMN IF NOT EXISTS image_data BYTEA;

-- Seed categories
INSERT INTO categories (name, slug, description) VALUES
  ('Kitchen',    'kitchen',   'Kitchen area inspection'),
  ('Washroom',   'washroom',  'Washroom area inspection'),
  ('Desk',       'desk',      'Desk / workstation area inspection'),
  ('Front Desk', 'frontdesk', 'Front desk / reception inspection')
ON CONFLICT (slug) DO NOTHING;