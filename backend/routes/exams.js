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
  getMyActiveExams,
  getMyResults,
  getMyResultDetails,
  recordViolation,
  forceSubmitParticipant,
  toggleParticipantFreeze,
  joinByRoom,
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
router.get('/my-results', protect, authorize('student'), getMyResults);
router.get('/my-results/:submissionId', protect, authorize('student'), getMyResultDetails);
router.get('/:id', protect, getExamById);
router.put('/:id', protect, authorize('teacher'), updateExam);
router.delete('/:id', protect, authorize('teacher'), deleteExam);

// Room code system routes
router.post('/join-by-room', joinByRoom); // public — issues its own token
router.post('/join', protect, authorize('student'), joinExam);
router.get('/:id/participants', protect, authorize('teacher'), getExamParticipants);
router.post('/:id/participants/:participantId/force-submit', protect, authorize('teacher'), forceSubmitParticipant);
router.post('/:id/participants/:participantId/toggle-freeze', protect, authorize('teacher'), toggleParticipantFreeze);
router.post('/:id/start', protect, authorize('teacher'), startExam);
router.get('/:id/status', protect, getExamStatus);

// Question routes
router.post('/:examId/questions', protect, authorize('teacher'), addQuestion);
router.put('/questions/:id', protect, authorize('teacher'), updateQuestion);
router.delete('/questions/:id', protect, authorize('teacher'), deleteQuestion);

// Submission routes
router.post('/:id/submit', protect, authorize('student'), submitExam);
router.post('/:id/run-code', protect, authorize('student'), runCode);
router.post('/:id/violations', protect, authorize('student'), recordViolation);
router.get('/:examId/submissions', protect, authorize('teacher'), getExamSubmissions);
router.get('/:examId/evaluation/participants', protect, authorize('teacher'), getEvaluationParticipants);
router.get('/:examId/evaluation/submissions/:submissionId', protect, authorize('teacher'), getSubmissionAnswerSheet);
router.put('/:examId/evaluation/submissions/:submissionId/score', protect, authorize('teacher'), evaluateWrittenAnswers);

// CSV aggregate-results export (teacher only — own exams)
router.get('/:id/export-results.csv', protect, authorize('teacher'), exportExamResultsCsv);

module.exports = router;
