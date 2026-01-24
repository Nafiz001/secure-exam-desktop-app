const pool = require('../config/database');

/**
 * Initialize database schema
 * Creates tables: users, exams, questions, submissions
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
        role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Exams table
    await client.query(`
      CREATE TABLE IF NOT EXISTS exams (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        duration INTEGER NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        room_code VARCHAR(6) UNIQUE,
        status VARCHAR(20) DEFAULT 'created',
        started_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Questions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        options JSONB NOT NULL,
        correct_answer VARCHAR(10) NOT NULL,
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
        score INTEGER,
        UNIQUE(exam_id, student_id)
      );
    `);

    // Exam participants table (for room code system)
    await client.query(`
      CREATE TABLE IF NOT EXISTS exam_participants (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'waiting',
        UNIQUE(exam_id, student_id)
      );
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_exams_created_by ON exams(created_by);
      CREATE INDEX IF NOT EXISTS idx_exams_room_code ON exams(room_code);
      CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);
      CREATE INDEX IF NOT EXISTS idx_questions_exam_id ON questions(exam_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_exam_id ON submissions(exam_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON submissions(student_id);
      CREATE INDEX IF NOT EXISTS idx_exam_participants_exam_id ON exam_participants(exam_id);
      CREATE INDEX IF NOT EXISTS idx_exam_participants_student_id ON exam_participants(student_id);
    `);

    await client.query('COMMIT');
    console.log('✓ Database schema initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('✗ Failed to initialize database schema:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { initializeSchema };
