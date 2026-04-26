const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

function signToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
}

function userPayload(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roll_number: user.roll_number || null
  };
}

/**
 * POST /api/auth/login
 * Accepts email OR roll_number + password.
 * Rejects inactive accounts.
 */
const login = async (req, res) => {
  const { email, roll_number, password } = req.body;

  const identifier = email ? String(email).trim() : null;
  const roll       = roll_number ? String(roll_number).trim() : null;

  if ((!identifier && !roll) || !password) {
    return res.status(400).json({ success: false, message: 'Email or roll number and password are required' });
  }

  try {
    let result;
    if (identifier) {
      result = await pool.query(
        `SELECT id, name, email, password_hash, role, roll_number, status
         FROM users WHERE email = $1 LIMIT 1`,
        [identifier]
      );
    } else {
      result = await pool.query(
        `SELECT id, name, email, password_hash, role, roll_number, status
         FROM users WHERE role = 'student' AND roll_number = $1 LIMIT 1`,
        [roll]
      );
    }

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (user.status === 'inactive') {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact admin.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: { user: userPayload(user), token: signToken(user) }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error during login' });
  }
};

/**
 * GET /api/auth/me
 */
const getCurrentUser = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, roll_number, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: { user: result.rows[0] } });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { login, getCurrentUser };
