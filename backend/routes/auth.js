const express = require('express');
const router = express.Router();
const { register, login, studentRollLogin, getCurrentUser } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/student-roll-login', studentRollLogin);

// Protected route
router.get('/me', protect, getCurrentUser);

module.exports = router;
