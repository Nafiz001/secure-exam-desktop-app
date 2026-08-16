const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { chat, generateQuestions } = require('../controllers/aiController');

router.post('/chat', protect, authorize('teacher'), chat);
router.post('/generate-questions', protect, authorize('teacher'), generateQuestions);

module.exports = router;
