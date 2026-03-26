const pool = require('../config/database');

/**
 * Migration: Add room code system columns
 */
const addRoomCodeColumns = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('Adding room_code, status, and started_at columns to exams table...');
    
    // Add columns to exams table if they don't exist
    await client.query(`
      DO $$ 
      BEGIN 
        BEGIN
          ALTER TABLE exams ADD COLUMN room_code VARCHAR(6) UNIQUE;
        EXCEPTION
          WHEN duplicate_column THEN 
            RAISE NOTICE 'column room_code already exists';
        END;

        BEGIN
          ALTER TABLE exams ADD COLUMN status VARCHAR(20) DEFAULT 'created';
        EXCEPTION
          WHEN duplicate_column THEN 
            RAISE NOTICE 'column status already exists';
        END;

        BEGIN
          ALTER TABLE exams ADD COLUMN started_at TIMESTAMP NULL;
        EXCEPTION
          WHEN duplicate_column THEN 
            RAISE NOTICE 'column started_at already exists';
        END;
      END $$;
    `);

    console.log('Creating exam_participants table...');
    
    // Create exam_participants table
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

    console.log('Creating indexes...');
    
    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_exams_room_code ON exams(room_code);
      CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);
      CREATE INDEX IF NOT EXISTS idx_exam_participants_exam_id ON exam_participants(exam_id);
      CREATE INDEX IF NOT EXISTS idx_exam_participants_student_id ON exam_participants(student_id);
    `);

    await client.query('COMMIT');
    console.log('✓ Migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run migration if executed directly
if (require.main === module) {
  addRoomCodeColumns()
    .then(() => {
      console.log('Migration finished');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration error:', error);
      process.exit(1);
    });
}

module.exports = addRoomCodeColumns;
