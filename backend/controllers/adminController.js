const bcrypt = require('bcrypt');
const pool = require('../config/database');

const SALT_ROUNDS = 10;

function isValidRoll(roll) {
  return /^\d{7}$/.test(String(roll).trim());
}

function parseCSV(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

/**
 * POST /api/admin/create-teacher
 * Body: { email, password, name? }
 */
const createTeacher = async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'email and password are required' });
  }

  const trimEmail = String(email).trim().toLowerCase();
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [trimEmail]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'teacher', 'active')
       RETURNING id, name, email, role, status, created_at`,
      [name || trimEmail.split('@')[0], trimEmail, hash]
    );

    res.status(201).json({ success: true, data: { user: result.rows[0] } });
  } catch (error) {
    console.error('[Admin] createTeacher error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/admin/create-student
 * Body: { roll, password, email?, name? }
 */
const createStudent = async (req, res) => {
  const { roll, password, email, name } = req.body;

  if (!roll || !password) {
    return res.status(400).json({ success: false, message: 'roll and password are required' });
  }

  const normalizedRoll = String(roll).trim();
  if (!isValidRoll(normalizedRoll)) {
    return res.status(400).json({ success: false, message: 'Roll number must be exactly 7 digits' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  const trimEmail = email ? String(email).trim().toLowerCase() : `${normalizedRoll}@student.kuet`;

  try {
    const rollExists = await pool.query(
      `SELECT id FROM users WHERE role = 'student' AND roll_number = $1`, [normalizedRoll]
    );
    if (rollExists.rows.length > 0) {
      return res.status(409).json({ success: false, message: `Roll ${normalizedRoll} already registered` });
    }

    const emailExists = await pool.query('SELECT id FROM users WHERE email = $1', [trimEmail]);
    if (emailExists.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, roll_number, status)
       VALUES ($1, $2, $3, 'student', $4, 'active')
       RETURNING id, name, email, role, roll_number, status, created_at`,
      [name || `Student ${normalizedRoll}`, trimEmail, hash, normalizedRoll]
    );

    res.status(201).json({ success: true, data: { user: result.rows[0] } });
  } catch (error) {
    console.error('[Admin] createStudent error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/admin/upload-students
 * Body: { csvContent: "roll,password,name,email\n..." }
 * Processes CSV, inserts students, returns summary.
 */
const uploadStudents = async (req, res) => {
  const { csvContent } = req.body;
  if (!csvContent) {
    return res.status(400).json({ success: false, message: 'csvContent is required' });
  }

  const rows = parseCSV(csvContent);
  if (rows.length === 0) {
    return res.status(400).json({ success: false, message: 'CSV has no data rows or is malformed' });
  }

  const results = { created: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    const roll     = String(row.roll || row.roll_number || '').trim();
    const password = String(row.password || row.pass || '').trim();
    const studentName = String(row.name || '').trim() || `Student ${roll}`;
    const email    = String(row.email || '').trim().toLowerCase() || `${roll}@student.kuet`;

    if (!isValidRoll(roll)) {
      results.errors.push({ roll, reason: 'Invalid roll number (must be 7 digits)' });
      results.skipped++;
      continue;
    }
    if (password.length < 6) {
      results.errors.push({ roll, reason: 'Password too short (min 6 chars)' });
      results.skipped++;
      continue;
    }

    try {
      const exists = await pool.query(
        `SELECT id FROM users WHERE role = 'student' AND roll_number = $1`, [roll]
      );
      if (exists.rows.length > 0) {
        results.errors.push({ roll, reason: 'Roll already registered' });
        results.skipped++;
        continue;
      }

      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, roll_number, status)
         VALUES ($1, $2, $3, 'student', $4, 'active')
         ON CONFLICT (email) DO NOTHING`,
        [studentName, email, hash, roll]
      );
      results.created++;
    } catch (err) {
      results.errors.push({ roll, reason: err.message });
      results.skipped++;
    }
  }

  res.json({ success: true, data: results });
};

/**
 * GET /api/admin/users?role=student|teacher
 */
const listUsers = async (req, res) => {
  const { role } = req.query;
  const validRoles = ['student', 'teacher'];

  try {
    let query = `SELECT id, name, email, role, roll_number, status, created_at
                 FROM users WHERE role != 'admin'`;
    const params = [];

    if (role && validRoles.includes(role)) {
      params.push(role);
      query += ` AND role = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json({ success: true, data: { users: result.rows } });
  } catch (error) {
    console.error('[Admin] listUsers error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /api/admin/users/:id/status
 * Body: { status: 'active' | 'inactive' }
 */
const toggleUserStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({ success: false, message: "status must be 'active' or 'inactive'" });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET status = $1, updated_at = NOW()
       WHERE id = $2 AND role != 'admin'
       RETURNING id, name, email, role, roll_number, status`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: { user: result.rows[0] } });
  } catch (error) {
    console.error('[Admin] toggleUserStatus error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/admin/stats
 */
const getStats = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE role = 'teacher' AND status = 'active')  AS active_teachers,
        COUNT(*) FILTER (WHERE role = 'teacher' AND status = 'inactive') AS inactive_teachers,
        COUNT(*) FILTER (WHERE role = 'student' AND status = 'active')  AS active_students,
        COUNT(*) FILTER (WHERE role = 'student' AND status = 'inactive') AS inactive_students
      FROM users WHERE role != 'admin'
    `);

    const examResult = await pool.query(`SELECT COUNT(*) AS total_exams FROM exams`);

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        total_exams: examResult.rows[0].total_exams
      }
    });
  } catch (error) {
    console.error('[Admin] getStats error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /api/admin/users/:id
 * Admin updates a user's name, email, roll number, and/or password.
 * Body: { name?, email?, roll_number?, password? }
 */
const updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, email, roll_number, password } = req.body || {};

  try {
    const existing = await pool.query(
      `SELECT id, role FROM users WHERE id = $1 AND role != 'admin'`,
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const targetRole = existing.rows[0].role;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (typeof name === 'string' && name.trim()) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name.trim());
    }

    if (typeof email === 'string' && email.trim()) {
      const trimmedEmail = email.trim().toLowerCase();
      const emailDup = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [trimmedEmail, id]
      );
      if (emailDup.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'Email already in use' });
      }
      updates.push(`email = $${paramIndex++}`);
      values.push(trimmedEmail);
    }

    if (targetRole === 'student' && typeof roll_number === 'string' && roll_number.trim()) {
      const trimmedRoll = roll_number.trim();
      if (!isValidRoll(trimmedRoll)) {
        return res.status(400).json({ success: false, message: 'Roll number must be exactly 7 digits' });
      }
      const rollDup = await pool.query(
        `SELECT id FROM users WHERE role = 'student' AND roll_number = $1 AND id != $2`,
        [trimmedRoll, id]
      );
      if (rollDup.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'Roll number already in use' });
      }
      updates.push(`roll_number = $${paramIndex++}`);
      values.push(trimmedRoll);
    }

    if (typeof password === 'string' && password.length > 0) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(hash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No editable fields provided' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND role != 'admin'
       RETURNING id, name, email, role, roll_number, status, created_at`,
      values
    );

    res.json({ success: true, data: { user: result.rows[0] } });
  } catch (error) {
    console.error('[Admin] updateUser error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * DELETE /api/admin/users/:id
 * Admin permanently removes a teacher or student.
 * Cascades to exams/submissions via foreign keys.
 */
const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM users WHERE id = $1 AND role != 'admin'
       RETURNING id, name, email, role`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: { user: result.rows[0] } });
  } catch (error) {
    console.error('[Admin] deleteUser error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  createTeacher,
  createStudent,
  uploadStudents,
  listUsers,
  toggleUserStatus,
  getStats,
  updateUser,
  deleteUser,
};
