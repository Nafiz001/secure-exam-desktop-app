const { Pool, types } = require('pg');
require('dotenv').config();

// Our TIMESTAMP columns hold UTC (the session below is pinned to UTC), but
// node-postgres would otherwise parse them as the app server's local time —
// shifting every stored time by that machine's UTC offset. That skew made
// running exams look like they were still in the future, so they never
// auto-expired. 1114 = TIMESTAMP WITHOUT TIME ZONE.
types.setTypeParser(1114, (value) => new Date(`${value}Z`));

// Flexible config: supports local PostgreSQL and Supabase
const isSupabase = process.env.DB_HOST && process.env.DB_HOST.includes('supabase');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Pin the session to UTC so stored timestamps and CURRENT_TIMESTAMP
  // comparisons always share one frame, whatever the host machine is set to.
  options: '-c timezone=UTC',
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
