const express = require('express');
const router = express.Router();
const {
  registerTeacherSelf,
  login,
  changePassword,
  getCurrentUser
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Public routes
router.post('/login', login);
router.post('/register-teacher', registerTeacherSelf);

// Protected routes
router.get('/me', protect, getCurrentUser);
router.post('/change-password', protect, changePassword);

module.exports = router;
