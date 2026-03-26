const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

/**
 * Register a new user
 * POST /api/auth/register
 */
const register = async (req, res) => {
  const { name, email, password, role, roll_number } = req.body;

  // Validation
  if (!name || !email || !password || !role) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required'
    });
  }

  // Validate role
  const validRoles = ['student', 'teacher', 'admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid role. Must be student, teacher, or admin'
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

    // Insert user
    const normalizedRoll = role === 'student' && roll_number ? String(roll_number).trim() : null;

    if (normalizedRoll) {
      const rollExists = await pool.query(
        'SELECT id FROM users WHERE role = $1 AND roll_number = $2',
        ['student', normalizedRoll]
      );

      if (rollExists.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Student with this roll number already exists'
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, roll_number) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, name, email, role, roll_number, created_at`,
      [name, email, password_hash, role, normalizedRoll]
    );

    const user = result.rows[0];

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

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          roll_number: user.roll_number || null
        },
        token
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
      'SELECT id, name, email, password_hash, role, roll_number FROM users WHERE email = $1',
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
          roll_number: user.roll_number || null
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
 * Student direct login by roll number (no password)
 * POST /api/auth/student-roll-login
 */
const studentRollLogin = async (req, res) => {
  const { roll_number } = req.body;

  if (!roll_number) {
    return res.status(400).json({
      success: false,
      message: 'Roll number is required'
    });
  }

  const normalizedRoll = String(roll_number).trim();
  const generatedEmailBase = `${normalizedRoll}@student.local`;

  try {
    let result = await pool.query(
      `SELECT id, name, email, role, roll_number
       FROM users
       WHERE role = 'student'
         AND (
           roll_number = $1
           OR SPLIT_PART(email, '@', 1) = $1
         )
       LIMIT 1`,
      [normalizedRoll]
    );

    if (result.rows.length === 0) {
      // Auto-provision student account for first-time roll number login.
      let generatedEmail = generatedEmailBase;
      const emailExists = await pool.query(
        'SELECT id FROM users WHERE email = $1 LIMIT 1',
        [generatedEmail]
      );

      if (emailExists.rows.length > 0) {
        generatedEmail = `${normalizedRoll}.${Date.now()}@student.local`;
      }

      const generatedPasswordHash = await bcrypt.hash(`roll:${normalizedRoll}:${Date.now()}`, 10);
      const inserted = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, roll_number)
         VALUES ($1, $2, $3, 'student', $4)
         RETURNING id, name, email, role, roll_number`,
        [`Student ${normalizedRoll}`, generatedEmail, generatedPasswordHash, normalizedRoll]
      );

      result = { rows: [inserted.rows[0]] };
    }

    const user = result.rows[0];

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
      message: 'Student login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          roll_number: user.roll_number || normalizedRoll
        },
        token
      }
    });
  } catch (error) {
    console.error('Student roll login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during student roll login'
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
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
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
  studentRollLogin,
  getCurrentUser
};
