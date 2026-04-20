/**
 * One-time script to create or reset the default admin account.
 * Run from the backend directory: node reset-admin.js
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool   = require('./config/database');

const ADMIN_EMAIL    = 'admin@kuet.ac.bd';
const ADMIN_PASSWORD = 'admin1234';
const ADMIN_NAME     = 'Admin';

async function run() {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const result = await pool.query(`
    INSERT INTO users (name, email, password_hash, role, status)
    VALUES ($1, $2, $3, 'admin', 'active')
    ON CONFLICT (email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          role          = 'admin',
          status        = 'active',
          name          = EXCLUDED.name
    RETURNING id, email, role
  `, [ADMIN_NAME, ADMIN_EMAIL, hash]);

  console.log('Admin account ready:', result.rows[0]);
  console.log(`Email:    ${ADMIN_EMAIL}`);
  console.log(`Password: ${ADMIN_PASSWORD}`);
  console.log('Change the password from the Admin Panel after first login.');
  await pool.end();
}

run().catch((err) => { console.error(err); process.exit(1); });
