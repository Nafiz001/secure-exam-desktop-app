const { Pool } = require('pg');
require('dotenv').config();

// Flexible config: supports local PostgreSQL and Supabase
const isSupabase = process.env.DB_HOST && process.env.DB_HOST.includes('supabase');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Enable SSL for Supabase and production
  ssl: isSupabase || process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

module.exports = pool;
