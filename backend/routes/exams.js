const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  createExam,
  getExams,
  getExamById,
  updateExam,
  deleteExam,
  restartExam,
  duplicateExam,
  submitExam,
  joinExam,
  getExamParticipants,
  startExam,
  getExamStatus,
  getMyActiveExams,
  exportExamResultsCsv
} = require('../controllers/examController');
const { runCode } = require('../controllers/codeExecutionController');
const {
  addQuestion,
  updateQuestion,
  deleteQuestion,
  getExamSubmissions,
  getEvaluationParticipants,
  getSubmissionAnswerSheet,
  evaluateWrittenAnswers
} = require('../controllers/questionController');

// Exam routes
router.post('/', protect, authorize('teacher'), createExam);
router.get('/', protect, getExams);
router.get('/my-active', protect, authorize('student'), getMyActiveExams);
router.get('/:id', protect, getExamById);
router.put('/:id', protect, authorize('teacher'), updateExam);
router.delete('/:id', protect, authorize('teacher'), deleteExam);
router.post('/:id/restart', protect, authorize('teacher'), restartExam);
router.post('/:id/duplicate', protect, authorize('teacher'), duplicateExam);
router.get('/:id/export-results.csv', protect, authorize('teacher'), exportExamResultsCsv);

// Room code system routes
// Public: students join with room code + name + roll number, no prior login
router.post('/join', joinExam);
router.get('/:id/participants', protect, authorize('teacher'), getExamParticipants);
router.post('/:id/start', protect, authorize('teacher'), startExam);
router.get('/:id/status', protect, getExamStatus);

// Question routes
router.post('/:examId/questions', protect, authorize('teacher'), addQuestion);
router.put('/questions/:id', protect, authorize('teacher'), updateQuestion);
router.delete('/questions/:id', protect, authorize('teacher'), deleteQuestion);

// Submission routes
router.post('/:id/submit', protect, authorize('student'), submitExam);
router.post('/:id/run-code', protect, authorize('student'), runCode);
router.get('/:examId/submissions', protect, authorize('teacher'), getExamSubmissions);
router.get('/:examId/evaluation/participants', protect, authorize('teacher'), getEvaluationParticipants);
router.get('/:examId/evaluation/submissions/:submissionId', protect, authorize('teacher'), getSubmissionAnswerSheet);
router.put('/:examId/evaluation/submissions/:submissionId/score', protect, authorize('teacher'), evaluateWrittenAnswers);

module.exports = router;
