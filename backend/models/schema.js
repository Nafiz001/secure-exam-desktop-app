const pool = require('../config/database');

/**
 * Initialize database schema
 * Creates tables: users, exams, questions, submissions, exam_participants
 * and performs safe additive migrations for new features.
 */
const initializeSchema = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        roll_number VARCHAR(50),
        role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS roll_number VARCHAR(50);
    `);

    // Exams table
    await client.query(`
      CREATE TABLE IF NOT EXISTS exams (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        exam_type VARCHAR(20) NOT NULL DEFAULT 'lab_quiz',
        duration INTEGER NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        room_code VARCHAR(6) UNIQUE,
        status VARCHAR(20) DEFAULT 'created',
        started_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Questions table (supports MCQ + written)
    await client.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        question_type VARCHAR(20) NOT NULL DEFAULT 'mcq',
        options JSONB,
        correct_answer VARCHAR(20),
        reference_answer TEXT,
        sample_input TEXT,
        sample_output TEXT,
        starter_code TEXT,
        marks INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Submissions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        answers JSONB NOT NULL,
        violations JSONB DEFAULT '[]',
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        auto_score INTEGER DEFAULT 0,
        manual_score INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        evaluation_status VARCHAR(20) DEFAULT 'pending',
        evaluated_at TIMESTAMP NULL,
        evaluated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(exam_id, student_id)
      );
    `);

    // Exam participants table (for room code system)
    await client.query(`
      CREATE TABLE IF NOT EXISTS exam_participants (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        student_name VARCHAR(255),
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'waiting',
        violation_count INTEGER DEFAULT 0,
        last_violation_type VARCHAR(100),
        last_violation_severity VARCHAR(20),
        last_violation_at TIMESTAMP NULL,
        force_submit_requested BOOLEAN DEFAULT FALSE,
        is_frozen BOOLEAN DEFAULT FALSE,
        UNIQUE(exam_id, student_id)
      );
    `);

    // Safe additive migrations for existing databases
    await client.query(`
      ALTER TABLE exams
      ADD COLUMN IF NOT EXISTS exam_type VARCHAR(20) DEFAULT 'lab_quiz';

      ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) DEFAULT 'mcq';

      ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS reference_answer TEXT;

      ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS sample_input TEXT;

      ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS sample_output TEXT;

      ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS starter_code TEXT;

      ALTER TABLE questions
      ALTER COLUMN options DROP NOT NULL;

      ALTER TABLE questions
      ALTER COLUMN correct_answer DROP NOT NULL;
    `);

    await client.query(`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS auto_score INTEGER DEFAULT 0;

      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS manual_score INTEGER DEFAULT 0;

      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS evaluation_status VARCHAR(20) DEFAULT 'pending';

      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMP NULL;

      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS evaluated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE exam_participants
      ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 0;

      ALTER TABLE exam_participants
      ADD COLUMN IF NOT EXISTS last_violation_type VARCHAR(100);

      ALTER TABLE exam_participants
      ADD COLUMN IF NOT EXISTS last_violation_severity VARCHAR(20);

      ALTER TABLE exam_participants
      ADD COLUMN IF NOT EXISTS last_violation_at TIMESTAMP NULL;

      ALTER TABLE exam_participants
      ADD COLUMN IF NOT EXISTS force_submit_requested BOOLEAN DEFAULT FALSE;

      ALTER TABLE exam_participants
      ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT FALSE;
    `);

    // Backfill score fields for old rows
    await client.query(`
      UPDATE submissions
      SET
        auto_score = COALESCE(auto_score, score, 0),
        manual_score = COALESCE(manual_score, 0),
        score = COALESCE(score, auto_score, 0),
        evaluation_status = COALESCE(evaluation_status, 'pending')
      WHERE auto_score IS NULL
         OR manual_score IS NULL
         OR score IS NULL
         OR evaluation_status IS NULL;
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_roll_number ON users(roll_number);
      CREATE INDEX IF NOT EXISTS idx_users_student_roll ON users(role, roll_number);
      CREATE INDEX IF NOT EXISTS idx_exams_created_by ON exams(created_by);
      CREATE INDEX IF NOT EXISTS idx_exams_type ON exams(exam_type);
      CREATE INDEX IF NOT EXISTS idx_exams_room_code ON exams(room_code);
      CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);
      CREATE INDEX IF NOT EXISTS idx_questions_exam_id ON questions(exam_id);
      CREATE INDEX IF NOT EXISTS idx_questions_exam_type ON questions(exam_id, question_type);
      CREATE INDEX IF NOT EXISTS idx_submissions_exam_id ON submissions(exam_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON submissions(student_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_eval_status ON submissions(exam_id, evaluation_status);
      CREATE INDEX IF NOT EXISTS idx_exam_participants_exam_id ON exam_participants(exam_id);
      CREATE INDEX IF NOT EXISTS idx_exam_participants_student_id ON exam_participants(student_id);
      CREATE INDEX IF NOT EXISTS idx_exam_participants_violation_count ON exam_participants(exam_id, violation_count);
    `);

    await client.query('COMMIT');
    console.log('[SCHEMA] Database schema initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[SCHEMA] Failed to initialize database schema:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { initializeSchema };
