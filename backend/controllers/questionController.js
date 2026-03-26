const pool = require('../config/database');

function normalizeQuestionType(rawType) {
  const normalized = String(rawType || 'mcq').toLowerCase();
  if (normalized === 'written') return 'written';
  if (normalized === 'coding') return 'coding';
  return 'mcq';
}

function parseJsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (error) {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Add question to exam (Teacher only - own exams)
 * POST /api/exams/:examId/questions
 */
const addQuestion = async (req, res) => {
  const examId = req.params.examId;
  const {
    question_text,
    question_type,
    options,
    correct_answer,
    reference_answer,
    sample_input,
    sample_output,
    starter_code,
    marks
  } = req.body;
  const teacherId = req.user.userId;

  const normalizedType = normalizeQuestionType(question_type);
  const normalizedMarks = Number(marks);

  if (!question_text || normalizedMarks <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Question text and valid marks are required'
    });
  }

  if (normalizedType === 'mcq') {
    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'MCQ options must be an array with at least 2 choices'
      });
    }

    if (correct_answer === undefined || correct_answer === null || correct_answer === '') {
      return res.status(400).json({
        success: false,
        message: 'Correct answer is required for MCQ questions'
      });
    }
  }

  try {
    const examCheck = await pool.query(
      'SELECT id, exam_type FROM exams WHERE id = $1 AND created_by = $2',
      [examId, teacherId]
    );

    if (examCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission to add questions'
      });
    }

    const examType = String(examCheck.rows[0].exam_type || 'lab_quiz');
    if (examType === 'lab_test' && normalizedType !== 'coding') {
      return res.status(400).json({
        success: false,
        message: 'Lab tests support only coding questions'
      });
    }

    if (examType === 'lab_quiz' && normalizedType === 'coding') {
      return res.status(400).json({
        success: false,
        message: 'Coding questions are allowed only in lab test exams'
      });
    }

    const mcqOptions = normalizedType === 'mcq' ? JSON.stringify(options) : null;
    const mcqCorrectAnswer = normalizedType === 'mcq' ? String(correct_answer) : null;
    const writtenReference = normalizedType === 'written'
      ? (reference_answer || '')
      : null;
    const codingSampleInput = normalizedType === 'coding' ? (sample_input || '') : null;
    const codingSampleOutput = normalizedType === 'coding' ? (sample_output || '') : null;
    const codingStarter = normalizedType === 'coding' ? (starter_code || '') : null;

    const result = await pool.query(
      `INSERT INTO questions (
         exam_id, question_text, question_type, options, correct_answer, reference_answer,
         sample_input, sample_output, starter_code, marks
       ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       RETURNING
         id, exam_id, question_text, question_type, options, correct_answer, reference_answer,
         sample_input, sample_output, starter_code, marks, created_at`,
      [
        examId,
        question_text,
        normalizedType,
        mcqOptions,
        mcqCorrectAnswer,
        writtenReference,
        codingSampleInput,
        codingSampleOutput,
        codingStarter,
        normalizedMarks
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Question added successfully',
      data: {
        question: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Add question error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while adding question'
    });
  }
};

/**
 * Update question (Teacher only - own exams)
 * PUT /api/exams/questions/:id
 */
const updateQuestion = async (req, res) => {
  const questionId = req.params.id;
  const {
    question_text,
    question_type,
    options,
    correct_answer,
    reference_answer,
    sample_input,
    sample_output,
    starter_code,
    marks
  } = req.body;
  const teacherId = req.user.userId;

  const normalizedType = normalizeQuestionType(question_type);
  const normalizedMarks = marks === undefined || marks === null ? null : Number(marks);

  if (normalizedMarks !== null && normalizedMarks <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Marks must be greater than 0'
    });
  }

  if (normalizedType === 'mcq') {
    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'MCQ options must be an array with at least 2 choices'
      });
    }

    if (correct_answer === undefined || correct_answer === null || correct_answer === '') {
      return res.status(400).json({
        success: false,
        message: 'Correct answer is required for MCQ questions'
      });
    }
  }

  try {
    const checkResult = await pool.query(
      `SELECT q.*, e.exam_type FROM questions q 
       JOIN exams e ON q.exam_id = e.id 
       WHERE q.id = $1 AND e.created_by = $2`,
      [questionId, teacherId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Question not found or you do not have permission to update it'
      });
    }

    const examType = String(checkResult.rows[0].exam_type || 'lab_quiz');
    if (examType === 'lab_test' && normalizedType !== 'coding') {
      return res.status(400).json({
        success: false,
        message: 'Lab tests support only coding questions'
      });
    }

    if (examType === 'lab_quiz' && normalizedType === 'coding') {
      return res.status(400).json({
        success: false,
        message: 'Coding questions are allowed only in lab test exams'
      });
    }

    const nextOptions = normalizedType === 'mcq' ? JSON.stringify(options) : null;
    const nextCorrect = normalizedType === 'mcq' ? String(correct_answer) : null;
    const nextReference = normalizedType === 'written' ? (reference_answer || '') : null;
    const nextSampleInput = normalizedType === 'coding' ? (sample_input || '') : null;
    const nextSampleOutput = normalizedType === 'coding' ? (sample_output || '') : null;
    const nextStarterCode = normalizedType === 'coding' ? (starter_code || '') : null;

    const result = await pool.query(
      `UPDATE questions 
       SET question_text = COALESCE($1, question_text),
           question_type = COALESCE($2, question_type),
           options = $3,
           correct_answer = $4,
           reference_answer = $5,
           sample_input = $6,
           sample_output = $7,
           starter_code = $8,
           marks = COALESCE($9, marks)
       WHERE id = $10
       RETURNING
         id, exam_id, question_text, question_type, options, correct_answer, reference_answer,
         sample_input, sample_output, starter_code, marks, created_at`,
      [
        question_text,
        normalizedType,
        nextOptions,
        nextCorrect,
        nextReference,
        nextSampleInput,
        nextSampleOutput,
        nextStarterCode,
        normalizedMarks,
        questionId
      ]
    );

    res.status(200).json({
      success: true,
      message: 'Question updated successfully',
      data: {
        question: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Update question error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating question'
    });
  }
};

/**
 * Delete question (Teacher only - own exams)
 * DELETE /api/exams/questions/:id
 */
const deleteQuestion = async (req, res) => {
  const questionId = req.params.id;
  const teacherId = req.user.userId;

  try {
    const result = await pool.query(
      `DELETE FROM questions 
       WHERE id = $1 AND exam_id IN (
         SELECT id FROM exams WHERE created_by = $2
       )
       RETURNING id`,
      [questionId, teacherId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Question not found or you do not have permission to delete it'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Question deleted successfully'
    });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while deleting question'
    });
  }
};

/**
 * Get submissions for an exam (submitted only)
 * GET /api/exams/:examId/submissions
 */
const getExamSubmissions = async (req, res) => {
  const examId = req.params.examId;
  const teacherId = req.user.userId;

  try {
    const examCheck = await pool.query(
      'SELECT id, title FROM exams WHERE id = $1 AND created_by = $2',
      [examId, teacherId]
    );

    if (examCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission to view submissions'
      });
    }

    const result = await pool.query(
      `SELECT
         s.*,
         COALESCE(ep.student_name, u.name) as student_name,
         u.email as student_email
       FROM submissions s
       JOIN users u ON s.student_id = u.id
       LEFT JOIN exam_participants ep ON ep.exam_id = s.exam_id AND ep.student_id = s.student_id
       WHERE s.exam_id = $1
       ORDER BY s.submitted_at DESC`,
      [examId]
    );

    res.status(200).json({
      success: true,
      data: {
        submissions: result.rows
      }
    });
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching submissions'
    });
  }
};

/**
 * Evaluation participant list (all participants, submitted or not)
 * GET /api/exams/:examId/evaluation/participants
 */
const getEvaluationParticipants = async (req, res) => {
  const examId = req.params.examId;
  const teacherId = req.user.userId;

  try {
    const examCheck = await pool.query(
      'SELECT id, title FROM exams WHERE id = $1 AND created_by = $2',
      [examId, teacherId]
    );

    if (examCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission'
      });
    }

    const participantsResult = await pool.query(
      `SELECT
         ep.id as participant_id,
         ep.student_id,
         COALESCE(ep.student_name, u.name) as student_name,
         u.email as student_email,
         ep.joined_at,
         ep.status as participation_status,
         s.id as submission_id,
         s.submitted_at,
         s.auto_score,
         s.manual_score,
         s.score,
         s.evaluation_status
       FROM exam_participants ep
       JOIN users u ON ep.student_id = u.id
       LEFT JOIN submissions s ON s.exam_id = ep.exam_id AND s.student_id = ep.student_id
       WHERE ep.exam_id = $1
       ORDER BY ep.joined_at ASC`,
      [examId]
    );

    res.status(200).json({
      success: true,
      data: {
        exam: examCheck.rows[0],
        participants: participantsResult.rows
      }
    });
  } catch (error) {
    console.error('Get evaluation participants error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching evaluation participants'
    });
  }
};

/**
 * Get one student's answer sheet for evaluation
 * GET /api/exams/:examId/evaluation/submissions/:submissionId
 */
const getSubmissionAnswerSheet = async (req, res) => {
  const examId = req.params.examId;
  const submissionId = req.params.submissionId;
  const teacherId = req.user.userId;

  try {
    const ownershipCheck = await pool.query(
      'SELECT id, title FROM exams WHERE id = $1 AND created_by = $2',
      [examId, teacherId]
    );

    if (ownershipCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission'
      });
    }

    const submissionResult = await pool.query(
      `SELECT
         s.*,
         COALESCE(ep.student_name, u.name) as student_name,
         u.email as student_email
       FROM submissions s
       JOIN users u ON s.student_id = u.id
       LEFT JOIN exam_participants ep ON ep.exam_id = s.exam_id AND ep.student_id = s.student_id
       WHERE s.id = $1 AND s.exam_id = $2`,
      [submissionId, examId]
    );

    if (submissionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    const submission = submissionResult.rows[0];
    const rawAnswers = parseJsonArray(submission.answers, []);
    const answerMap = new Map();
    rawAnswers.forEach((answer) => {
      if (answer && answer.question_id !== undefined && answer.question_id !== null) {
        answerMap.set(Number(answer.question_id), answer);
      }
    });

    const questionsResult = await pool.query(
      `SELECT
         id,
         question_text,
         COALESCE(question_type, 'mcq') as question_type,
         options,
         correct_answer,
         reference_answer,
         sample_input,
         sample_output,
         starter_code,
         marks
       FROM questions
       WHERE exam_id = $1
       ORDER BY id ASC`,
      [examId]
    );

    const answerSheet = questionsResult.rows.map((question) => {
      const answer = answerMap.get(Number(question.id)) || {};
      return {
        question_id: Number(question.id),
        question_text: question.question_text,
        question_type: normalizeQuestionType(question.question_type),
        options: parseJsonArray(question.options, []),
        correct_answer: question.correct_answer,
        reference_answer: question.reference_answer || '',
        sample_input: question.sample_input || '',
        sample_output: question.sample_output || '',
        starter_code: question.starter_code || '',
        max_marks: Number(question.marks) || 0,
        selected_answer: answer.selected_answer ?? null,
        written_answer: answer.written_answer || '',
        language: answer.language || '',
        is_correct: answer.is_correct ?? null,
        awarded_marks: Number(answer.awarded_marks ?? 0),
        evaluated: Boolean(answer.evaluated),
        evaluation_comment: answer.evaluation_comment || ''
      };
    });

    res.status(200).json({
      success: true,
      data: {
        exam: ownershipCheck.rows[0],
        submission: {
          id: submission.id,
          student_id: submission.student_id,
          student_name: submission.student_name,
          student_email: submission.student_email,
          submitted_at: submission.submitted_at,
          violations: submission.violations,
          auto_score: Number(submission.auto_score) || 0,
          manual_score: Number(submission.manual_score) || 0,
          score: Number(submission.score) || 0,
          evaluation_status: submission.evaluation_status,
          evaluated_at: submission.evaluated_at,
          answer_sheet: answerSheet
        }
      }
    });
  } catch (error) {
    console.error('Get submission answer sheet error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching answer sheet'
    });
  }
};

/**
 * Evaluate written answers for a submission
 * PUT /api/exams/:examId/evaluation/submissions/:submissionId/score
 */
const evaluateWrittenAnswers = async (req, res) => {
  const examId = req.params.examId;
  const submissionId = req.params.submissionId;
  const teacherId = req.user.userId;
  const { evaluations } = req.body;

  if (!Array.isArray(evaluations)) {
    return res.status(400).json({
      success: false,
      message: 'Evaluations array is required'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const examCheck = await client.query(
      'SELECT id FROM exams WHERE id = $1 AND created_by = $2',
      [examId, teacherId]
    );

    if (examCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission'
      });
    }

    const submissionResult = await client.query(
      `SELECT id, answers, auto_score
       FROM submissions
       WHERE id = $1 AND exam_id = $2`,
      [submissionId, examId]
    );

    if (submissionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    const submission = submissionResult.rows[0];
    const answers = parseJsonArray(submission.answers, []);
    const answerMap = new Map();
    answers.forEach((answer, index) => {
      if (answer && answer.question_id !== undefined && answer.question_id !== null) {
        answerMap.set(Number(answer.question_id), { answer, index });
      }
    });

    const questionsResult = await client.query(
      `SELECT id, COALESCE(question_type, 'mcq') as question_type, marks
       FROM questions
       WHERE exam_id = $1`,
      [examId]
    );

    const writtenQuestions = questionsResult.rows
      .filter((question) => ['written', 'coding'].includes(normalizeQuestionType(question.question_type)))
      .map((question) => ({
        id: Number(question.id),
        question_type: normalizeQuestionType(question.question_type),
        marks: Number(question.marks) || 0
      }));

    const writtenQuestionMap = new Map();
    writtenQuestions.forEach((question) => {
      writtenQuestionMap.set(question.id, question);
    });

    for (const evaluation of evaluations) {
      const questionId = Number(evaluation.question_id);
      if (!writtenQuestionMap.has(questionId)) {
        continue;
      }

      const questionMeta = writtenQuestionMap.get(questionId);
      const rawMarks = Number(evaluation.awarded_marks);
      const normalizedMarks = Number.isNaN(rawMarks)
        ? 0
        : Math.max(0, Math.min(rawMarks, questionMeta.marks));
      const comment = typeof evaluation.evaluation_comment === 'string'
        ? evaluation.evaluation_comment.trim()
        : '';

      const existing = answerMap.get(questionId);
      if (!existing) {
        const newAnswer = {
          question_id: questionId,
          question_type: questionMeta.question_type,
          selected_answer: null,
          written_answer: '',
          language: '',
          is_correct: null,
          max_marks: questionMeta.marks,
          awarded_marks: normalizedMarks,
          evaluated: true,
          evaluation_comment: comment
        };
        answers.push(newAnswer);
        answerMap.set(questionId, { answer: newAnswer, index: answers.length - 1 });
      } else {
        existing.answer.awarded_marks = normalizedMarks;
        existing.answer.evaluated = true;
        existing.answer.evaluation_comment = comment;
      }
    }

    let manualScore = 0;
    let allWrittenEvaluated = true;

    writtenQuestions.forEach((question) => {
      const entry = answerMap.get(question.id);
      if (!entry) {
        allWrittenEvaluated = false;
        return;
      }

      const awarded = Number(entry.answer.awarded_marks) || 0;
      manualScore += Math.max(0, Math.min(awarded, question.marks));
      if (!entry.answer.evaluated) {
        allWrittenEvaluated = false;
      }
    });

    const autoScore = Number(submission.auto_score) || 0;
    const totalScore = autoScore + manualScore;
    const evaluationStatus = writtenQuestions.length === 0 || allWrittenEvaluated
      ? 'completed'
      : 'pending';

    const updateResult = await client.query(
      `UPDATE submissions
       SET
         answers = $1,
         manual_score = $2,
         score = $3,
         evaluation_status = $4,
         evaluated_at = CURRENT_TIMESTAMP,
         evaluated_by = $5
       WHERE id = $6
       RETURNING id, auto_score, manual_score, score, evaluation_status, evaluated_at`,
      [
        JSON.stringify(answers),
        manualScore,
        totalScore,
        evaluationStatus,
        teacherId,
        submissionId
      ]
    );

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      message: 'Evaluation saved successfully',
      data: {
        submission: updateResult.rows[0]
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Evaluate written answers error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while saving evaluation'
    });
  } finally {
    client.release();
  }
};

module.exports = {
  addQuestion,
  updateQuestion,
  deleteQuestion,
  getExamSubmissions,
  getEvaluationParticipants,
  getSubmissionAnswerSheet,
  evaluateWrittenAnswers
};
