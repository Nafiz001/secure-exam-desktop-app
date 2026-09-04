const express = require('express');
const router = express.Router();
const {
  registerTeacherSelf,
  verifyEmail,
  resendVerificationCode,
  forgotPassword,
  resetPassword,
  login,
  changePassword,
  getCurrentUser
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Public routes
router.post('/login', login);
router.post('/register-teacher', registerTeacherSelf);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerificationCode);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/me', protect, getCurrentUser);
router.post('/change-password', protect, changePassword);

module.exports = router;
