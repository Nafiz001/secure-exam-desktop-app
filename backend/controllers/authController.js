const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { sendMail, generateCode } = require('../utils/mailer');

const CODE_TTL_MINUTES = 10;

/**
 * Teacher self-service account creation.
 * The teacher sets their own password immediately, but the account stays
 * unverified (and can't log in) until they confirm the emailed code.
 * POST /api/auth/register-teacher
 */
const registerTeacherSelf = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Name, email, and password are required'
    });
  }

  if (String(password).length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters'
    });
  }

  try {
    const userExists = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists'
      });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const code = generateCode();
    const expires = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO users
         (name, email, password_hash, role, must_change_password, is_verified, verification_code, verification_code_expires)
       VALUES ($1, $2, $3, 'teacher', FALSE, FALSE, $4, $5)
       RETURNING id, name, email, role`,
      [name.trim(), email.trim(), password_hash, code, expires]
    );

    const user = result.rows[0];

    try {
      await sendMail({
        to: user.email,
        subject: 'Verify your Invigilo teacher account',
        html: `<p>Hi ${user.name},</p>
               <p>Your verification code is:</p>
               <h2 style="letter-spacing:4px;">${code}</h2>
               <p>This code expires in ${CODE_TTL_MINUTES} minutes.</p>`
      });
    } catch (mailErr) {
      console.error('Verification email send failed:', mailErr.message);
      await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again later.'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Verification code sent to your email',
      data: { email: user.email, needsVerification: true }
    });
  } catch (error) {
    console.error('Teacher self-registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration'
    });
  }
};

/**
 * Confirm the emailed verification code and activate the account.
 * POST /api/auth/verify-email
 */
const verifyEmail = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ success: false, message: 'Email and code are required' });
  }

  try {
    const result = await pool.query(
      `SELECT id, name, email, role, is_verified, verification_code, verification_code_expires
       FROM users WHERE email = $1`,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ success: false, message: 'Account is already verified' });
    }

    if (!user.verification_code || user.verification_code !== String(code).trim()) {
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }

    if (!user.verification_code_expires || new Date(user.verification_code_expires) < new Date()) {
      return res.status(400).json({ success: false, message: 'Verification code has expired. Please request a new one.' });
    }

    await pool.query(
      `UPDATE users SET is_verified = TRUE, verification_code = NULL, verification_code_expires = NULL,
       updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [user.id]
    );

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(200).json({
      success: true,
      message: 'Account verified successfully',
      data: {
        user: { id: user.id, name: user.name, email: user.email, role: user.role, must_change_password: false },
        token
      }
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ success: false, message: 'Internal server error while verifying account' });
  }
};

/**
 * Resend a fresh verification code to an unverified account.
 * POST /api/auth/resend-verification
 */
const resendVerificationCode = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, is_verified FROM users WHERE email = $1',
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ success: false, message: 'Account is already verified' });
    }

    const code = generateCode();
    const expires = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    await pool.query(
      'UPDATE users SET verification_code = $1, verification_code_expires = $2 WHERE id = $3',
      [code, expires, user.id]
    );

    await sendMail({
      to: user.email,
      subject: 'Your new Invigilo verification code',
      html: `<p>Hi ${user.name},</p>
             <p>Your new verification code is:</p>
             <h2 style="letter-spacing:4px;">${code}</h2>
             <p>This code expires in ${CODE_TTL_MINUTES} minutes.</p>`
    });

    res.status(200).json({ success: true, message: 'Verification code resent' });
  } catch (error) {
    console.error('Resend verification error:', error);
    const statusCode = Number(error?.statusCode) || 500;
    res.status(statusCode).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * Request a password reset code by email.
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email FROM users WHERE email = $1',
      [email.trim()]
    );

    // Don't reveal whether the account exists.
    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a reset code has been sent.'
      });
    }

    const user = result.rows[0];
    const code = generateCode();
    const expires = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    await pool.query(
      'UPDATE users SET reset_code = $1, reset_code_expires = $2 WHERE id = $3',
      [code, expires, user.id]
    );

    await sendMail({
      to: user.email,
      subject: 'Reset your Invigilo password',
      html: `<p>Hi ${user.name},</p>
             <p>Your password reset code is:</p>
             <h2 style="letter-spacing:4px;">${code}</h2>
             <p>This code expires in ${CODE_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.</p>`
    });

    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a reset code has been sent.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Internal server error while processing request' });
  }
};

/**
 * Confirm a reset code and set a new password.
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res) => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    return res.status(400).json({ success: false, message: 'Email, code, and new password are required' });
  }

  if (String(newPassword).length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }

  try {
    const result = await pool.query(
      'SELECT id, reset_code, reset_code_expires FROM users WHERE email = $1',
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });
    }

    const user = result.rows[0];

    if (!user.reset_code || user.reset_code !== String(code).trim()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });
    }

    if (!user.reset_code_expires || new Date(user.reset_code_expires) < new Date()) {
      return res.status(400).json({ success: false, message: 'Reset code has expired. Please request a new one.' });
    }

    const password_hash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `UPDATE users SET password_hash = $1, reset_code = NULL, reset_code_expires = NULL,
       must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [password_hash, user.id]
    );

    res.status(200).json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Internal server error while resetting password' });
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
      'SELECT id, name, email, password_hash, role, must_change_password, is_verified FROM users WHERE email = $1',
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

    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in.',
        data: { needsVerification: true, email: user.email }
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
 * Change own password
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
  registerTeacherSelf,
  verifyEmail,
  resendVerificationCode,
  forgotPassword,
  resetPassword,
  login,
  changePassword,
  getCurrentUser
};
