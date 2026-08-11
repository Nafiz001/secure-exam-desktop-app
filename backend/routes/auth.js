const express = require('express');
const router = express.Router();
const { register, login, changePassword, getCurrentUser } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');

// Public routes
router.post('/login', login);

// Admin-only: create teacher/admin accounts with an initial password
router.post('/register', protect, authorize('admin'), register);

// Protected routes
router.get('/me', protect, getCurrentUser);
router.post('/change-password', protect, changePassword);

module.exports = router;
