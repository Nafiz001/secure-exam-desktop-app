const express = require('express');
const router = express.Router();
const {
  register,
  registerTeacherSelf,
  login,
  changePassword,
  listTeachers,
  resetTeacherPassword,
  getCurrentUser
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');

// Public routes
router.post('/login', login);
router.post('/register-teacher', registerTeacherSelf);

// Admin-only: create teacher/admin accounts with an initial password
router.post('/register', protect, authorize('admin'), register);

// Admin-only: manage teacher accounts
router.get('/teachers', protect, authorize('admin'), listTeachers);
router.put('/teachers/:id/reset-password', protect, authorize('admin'), resetTeacherPassword);

// Protected routes
router.get('/me', protect, getCurrentUser);
router.post('/change-password', protect, changePassword);

module.exports = router;
