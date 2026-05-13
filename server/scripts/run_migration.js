const { loadEnv } = require('../utilities/envLoader');

// Load env
loadEnv();

const pool = require('../utilities/db');

const migrationSQL = `
-- Create office_work_entries table (without FK for now due to permission)
CREATE TABLE IF NOT EXISTS office_work_entries (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  task TEXT NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  work_date DATE,
  start_time TIME,
  end_time TIME,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_office_work_user ON office_work_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_office_work_created ON office_work_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_office_work_completed ON office_work_entries(completed);

ALTER TABLE office_work_entries ADD COLUMN IF NOT EXISTS work_date DATE;
ALTER TABLE office_work_entries ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE office_work_entries ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE office_work_entries ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE office_work_entries
SET work_date = (created_at AT TIME ZONE 'Asia/Dhaka')::date
WHERE work_date IS NULL;

CREATE TABLE IF NOT EXISTS office_work_sessions (
  id BIGSERIAL PRIMARY KEY,
  entry_id BIGINT NOT NULL REFERENCES office_work_entries(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  work_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_office_work_sessions_entry ON office_work_sessions(entry_id);
CREATE INDEX IF NOT EXISTS idx_office_work_sessions_user_date ON office_work_sessions(user_id, work_date DESC);
`;

async function runMigration() {
  try {
    console.log('Connecting to database...');

    // Check which database we're connected to
    const dbInfo = await pool.query('SELECT current_database() as db');
    console.log('Connected to database:', dbInfo.rows[0].db);

    console.log('Running migration...');
    await pool.query(migrationSQL);
    console.log('Migration completed successfully!');

    // Verify the table was created
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'office_work_entries'
    `);
    if (result.rows.length > 0) {
      console.log('✓ Table office_work_entries created');
    } else {
      console.log('✗ Table was not created');
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
