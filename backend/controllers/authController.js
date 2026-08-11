const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

/**
 * Register a new user
 * POST /api/auth/register
 */
const register = async (req, res) => {
  const { name, email, password, role } = req.body;

  // Validation
  if (!name || !email || !password || !role) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required'
    });
  }

  // Validate role - students no longer have accounts created this way;
  // they join exams directly via room code.
  const validRoles = ['teacher', 'admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid role. Must be teacher or admin'
    });
  }

  try {
    // Check if user already exists
    const userExists = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Teacher accounts are created by an admin with an initial password
    // and must change it on first login.
    const mustChangePassword = role === 'teacher';

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, must_change_password)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, must_change_password, created_at`,
      [name, email, password_hash, role, mustChangePassword]
    );

    const user = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          must_change_password: user.must_change_password
        }
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration'
    });
  }
};

/**
 * Login user
 * POST /api/auth/login
 */
const login = async (req, res) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required'
    });
  }

  try {
    // Find user by email
    const result = await pool.query(
      'SELECT id, name, email, password_hash, role, must_change_password FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          must_change_password: user.must_change_password
        },
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
};

/**
 * Change own password (required on first login for admin-created teacher accounts)
 * POST /api/auth/change-password
 */
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Current password and new password are required'
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 6 characters'
    });
  }

  try {
    const result = await pool.query(
      'SELECT id, password_hash FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, user.id]
    );

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while changing password'
    });
  }
};

/**
 * List all teacher accounts (Admin only)
 * GET /api/auth/teachers
 */
const listTeachers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, must_change_password, created_at
       FROM users
       WHERE role = 'teacher'
       ORDER BY created_at DESC`
    );

    res.status(200).json({
      success: true,
      data: {
        teachers: result.rows
      }
    });
  } catch (error) {
    console.error('List teachers error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching teachers'
    });
  }
};

/**
 * Reset a teacher's password to a new admin-issued temporary password
 * (Admin only). The teacher is forced to change it again on next login.
 * PUT /api/auth/teachers/:id/reset-password
 */
const resetTeacherPassword = async (req, res) => {
  const teacherId = req.params.id;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'A temporary password of at least 6 characters is required'
    });
  }

  try {
    const result = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'teacher'`,
      [teacherId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `UPDATE users
       SET password_hash = $1, must_change_password = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newPasswordHash, teacherId]
    );

    res.status(200).json({
      success: true,
      message: 'Temporary password set. The teacher must change it on next login.'
    });
  } catch (error) {
    console.error('Reset teacher password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while resetting password'
    });
  }
};

/**
 * Verify token and get current user
 * GET /api/auth/me
 */
const getCurrentUser = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, must_change_password, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  register,
  login,
  changePassword,
  listTeachers,
  resetTeacherPassword,
  getCurrentUser
};
