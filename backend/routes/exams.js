const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  createExam,
  getExams,
  getExamById,
  updateExam,
  deleteExam,
  submitExam,
  joinExam,
  getExamParticipants,
  startExam,
  getExamStatus,
  getMyActiveExams
} = require('../controllers/examController');
const {
  addQuestion,
  updateQuestion,
  deleteQuestion,
  getExamSubmissions
} = require('../controllers/questionController');

// Exam routes
router.post('/', protect, authorize('teacher'), createExam);
router.get('/', protect, getExams);
router.get('/my-active', protect, authorize('student'), getMyActiveExams);
router.get('/:id', protect, getExamById);
router.put('/:id', protect, authorize('teacher'), updateExam);
router.delete('/:id', protect, authorize('teacher'), deleteExam);

// Room code system routes
router.post('/join', protect, authorize('student'), joinExam);
router.get('/:id/participants', protect, authorize('teacher'), getExamParticipants);
router.post('/:id/start', protect, authorize('teacher'), startExam);
router.get('/:id/status', protect, getExamStatus);

// Question routes
router.post('/:examId/questions', protect, authorize('teacher'), addQuestion);
router.put('/questions/:id', protect, authorize('teacher'), updateQuestion);
router.delete('/questions/:id', protect, authorize('teacher'), deleteQuestion);

// Submission routes
router.post('/:id/submit', protect, authorize('student'), submitExam);
router.get('/:examId/submissions', protect, authorize('teacher'), getExamSubmissions);

module.exports = router;
