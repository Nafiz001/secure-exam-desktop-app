const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log('Starting migration: Add student_name to exam_participants...');

    // Add student_name column to exam_participants table
    await pool.query(`
      ALTER TABLE exam_participants 
      ADD COLUMN IF NOT EXISTS student_name VARCHAR(255)
    `);

    console.log('✅ Migration completed successfully');
    console.log('Added student_name column to exam_participants table');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
