const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  reportEvent,
  uploadSnapshot,
  getStudentsStatus,
  getStudentEvents
} = require('../controllers/proctoringController');

// Student routes
router.post('/:examId/event', protect, authorize('student'), reportEvent);
router.post('/:examId/snapshot', protect, authorize('student'), uploadSnapshot);

// Teacher routes
router.get('/:examId/students', protect, authorize('teacher'), getStudentsStatus);
router.get('/:examId/events/:studentId', protect, authorize('teacher'), getStudentEvents);

module.exports = router;
