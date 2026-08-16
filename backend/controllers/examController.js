const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/**
 * Generate unique room code
 */
function generateRoomCode() {
  // Exclude confusing characters: 0, O, 1, I, L
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function generateUniqueRoomCode() {
  let code = generateRoomCode();
  let exists = await pool.query('SELECT id FROM exams WHERE room_code = $1', [code]);
  while (exists.rows.length > 0) {
    code = generateRoomCode();
    exists = await pool.query('SELECT id FROM exams WHERE room_code = $1', [code]);
  }
  return code;
}

function normalizeQuestionType(rawType) {
  const normalized = String(rawType || 'mcq').toLowerCase();
  if (normalized === 'written') return 'written';
  if (normalized === 'coding') return 'coding';
  return 'mcq';
}

function normalizeExamType(rawType) {
  return String(rawType || 'lab_quiz').toLowerCase() === 'lab_test' ? 'lab_test' : 'lab_quiz';
}

function normalizeBoolean(rawValue, fallback) {
  if (rawValue === undefined || rawValue === null) return fallback;
  if (typeof rawValue === 'boolean') return rawValue;
  return rawValue === 'true' || rawValue === '1' || rawValue === 1 || rawValue === true;
}

async function syncExpiredExamStatuses() {
  const expiredExamResult = await pool.query(
    `UPDATE exams
     SET status = 'completed',
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'in_progress'
       AND started_at IS NOT NULL
       AND started_at + (duration * INTERVAL '1 minute') <= CURRENT_TIMESTAMP
     RETURNING id`
  );

  const expiredExamIds = expiredExamResult.rows.map((row) => Number(row.id)).filter(Number.isInteger);
  if (expiredExamIds.length === 0) {
    return;
  }

  await pool.query(
    `UPDATE exam_participants
     SET status = 'completed'
     WHERE exam_id = ANY($1::INT[])
       AND status = 'taking'`,
    [expiredExamIds]
  );
}

/**
 * Create a new exam (Teacher only)
 * POST /api/exams
 */
const createExam = async (req, res) => {
  const {
    title,
    description,
    duration,
    exam_type,
    webcam_required,
    allow_multiple_attempts,
    show_results_to_students
  } = req.body;
  const teacherId = req.user.userId;
  const normalizedExamType = normalizeExamType(exam_type);
  const webcamRequired = normalizeBoolean(webcam_required, false);
  const allowMultipleAttempts = normalizeBoolean(allow_multiple_attempts, false);
  const showResultsToStudents = normalizeBoolean(show_results_to_students, false);

  if (!title || !duration) {
    return res.status(400).json({
      success: false,
      message: 'Title and duration are required'
    });
  }

  if (duration <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Duration must be greater than 0'
    });
  }

  try {
    const roomCode = await generateUniqueRoomCode();

    const result = await pool.query(
      `INSERT INTO exams (
         title, description, exam_type, duration, created_by, room_code, status,
         webcam_required, allow_multiple_attempts, show_results_to_students
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'created', $7, $8, $9)
       RETURNING *`,
      [
        title,
        description || '',
        normalizedExamType,
        duration,
        teacherId,
        roomCode,
        webcamRequired,
        allowMultipleAttempts,
        showResultsToStudents
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Exam created successfully',
      data: {
        exam: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Create exam error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating exam'
    });
  }
};

/**
 * Get all exams
 * GET /api/exams
 */
const getExams = async (req, res) => {
  const { userId, role } = req.user;

  try {
    await syncExpiredExamStatuses();

    let query;
    let params;

    if (role === 'teacher') {
      query = `
        SELECT e.*, u.name as teacher_name,
          (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as question_count,
          (SELECT COUNT(*) FROM questions WHERE exam_id = e.id AND COALESCE(question_type, 'mcq') = 'written') as written_question_count,
          (SELECT COUNT(*) FROM questions WHERE exam_id = e.id AND COALESCE(question_type, 'mcq') = 'coding') as coding_question_count
        FROM exams e
        JOIN users u ON e.created_by = u.id
        WHERE e.created_by = $1
        ORDER BY e.created_at DESC
      `;
      params = [userId];
    } else {
      query = `
        SELECT e.*, u.name as teacher_name,
          (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as question_count,
          (SELECT COUNT(*) FROM questions WHERE exam_id = e.id AND COALESCE(question_type, 'mcq') = 'written') as written_question_count,
          (SELECT COUNT(*) FROM questions WHERE exam_id = e.id AND COALESCE(question_type, 'mcq') = 'coding') as coding_question_count
        FROM exams e
        JOIN users u ON e.created_by = u.id
        ORDER BY e.created_at DESC
      `;
      params = [];
    }

    const result = await pool.query(query, params);

    res.status(200).json({
      success: true,
      data: {
        exams: result.rows
      }
    });
  } catch (error) {
    console.error('Get exams error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching exams'
    });
  }
};

/**
 * Get single exam with questions
 * GET /api/exams/:id
 */
const getExamById = async (req, res) => {
  const examId = req.params.id;
  const { role, userId } = req.user;

  try {
    await syncExpiredExamStatuses();

    const examResult = await pool.query(
      `SELECT e.*, u.name as teacher_name
       FROM exams e
       JOIN users u ON e.created_by = u.id
       WHERE e.id = $1`,
      [examId]
    );

    if (examResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    const exam = examResult.rows[0];

    let hasSubmitted = false;
    if (role === 'student') {
      const submissionCheck = await pool.query(
        'SELECT id FROM submissions WHERE exam_id = $1 AND student_id = $2',
        [examId, userId]
      );
      // When multiple attempts are allowed, don't block re-entry here —
      // submitExam is the actual gate and will replace the prior attempt.
      hasSubmitted = submissionCheck.rows.length > 0 && !exam.allow_multiple_attempts;
    }

    let questionsQuery;
    if (role === 'teacher' || role === 'admin') {
      questionsQuery = `
        SELECT
          id,
          exam_id,
          question_text,
          COALESCE(question_type, 'mcq') as question_type,
          options,
          correct_answer,
          reference_answer,
          sample_input,
          sample_output,
          starter_code,
          marks,
          image_url,
          created_at
        FROM questions
        WHERE exam_id = $1
        ORDER BY id ASC
      `;
    } else {
      questionsQuery = `
        SELECT
          id,
          exam_id,
          question_text,
          COALESCE(question_type, 'mcq') as question_type,
          options,
          sample_input,
          sample_output,
          starter_code,
          marks,
          image_url,
          created_at
        FROM questions
        WHERE exam_id = $1
        ORDER BY id ASC
      `;
    }

    const questionsResult = await pool.query(questionsQuery, [examId]);

    res.status(200).json({
      success: true,
      data: {
        exam: {
          ...exam,
          questions: questionsResult.rows,
          has_submitted: hasSubmitted
        }
      }
    });
  } catch (error) {
    console.error('Get exam by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching exam'
    });
  }
};

/**
 * Update exam (Teacher only - own exams)
 * PUT /api/exams/:id
 */
const updateExam = async (req, res) => {
  const examId = req.params.id;
  const {
    title,
    description,
    duration,
    exam_type,
    webcam_required,
    allow_multiple_attempts,
    show_results_to_students
  } = req.body;
  const teacherId = req.user.userId;
  const normalizedExamType = exam_type === undefined ? null : normalizeExamType(exam_type);
  const webcamRequired = webcam_required === undefined ? null : normalizeBoolean(webcam_required, false);
  const allowMultipleAttempts = allow_multiple_attempts === undefined
    ? null
    : normalizeBoolean(allow_multiple_attempts, false);
  const showResultsToStudents = show_results_to_students === undefined
    ? null
    : normalizeBoolean(show_results_to_students, false);

  try {
    const checkResult = await pool.query(
      'SELECT * FROM exams WHERE id = $1 AND created_by = $2',
      [examId, teacherId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission to update it'
      });
    }

    const result = await pool.query(
      `UPDATE exams
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           duration = COALESCE($3, duration),
           exam_type = COALESCE($4, exam_type),
           webcam_required = COALESCE($5, webcam_required),
           allow_multiple_attempts = COALESCE($6, allow_multiple_attempts),
           show_results_to_students = COALESCE($7, show_results_to_students),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $8 AND created_by = $9
       RETURNING *`,
        [
          title,
          description,
          duration,
          normalizedExamType,
          webcamRequired,
          allowMultipleAttempts,
          showResultsToStudents,
          examId,
          teacherId
        ]
    );

    res.status(200).json({
      success: true,
      message: 'Exam updated successfully',
      data: {
        exam: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Update exam error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating exam'
    });
  }
};

/**
 * Delete exam (Teacher only - own exams)
 * DELETE /api/exams/:id
 */
const deleteExam = async (req, res) => {
  const examId = req.params.id;
  const teacherId = req.user.userId;

  try {
    const result = await pool.query(
      'DELETE FROM exams WHERE id = $1 AND created_by = $2 RETURNING id',
      [examId, teacherId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission to delete it'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Exam deleted successfully'
    });
  } catch (error) {
    console.error('Delete exam error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while deleting exam'
    });
  }
};

/**
 * Restart a completed (or otherwise stalled) exam so the same room code can
 * run again — resets status/started_at and clears participants back to
 * 'waiting' so they can rejoin. Existing submissions are untouched; whether
 * a student who already submitted can submit again is governed separately
 * by allow_multiple_attempts (see submitExam).
 * POST /api/exams/:id/restart
 */
const restartExam = async (req, res) => {
  const examId = req.params.id;
  const teacherId = req.user.userId;

  try {
    const examCheck = await pool.query(
      'SELECT id FROM exams WHERE id = $1 AND created_by = $2',
      [examId, teacherId]
    );

    if (examCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission'
      });
    }

    const result = await pool.query(
      `UPDATE exams
       SET status = 'created', started_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [examId]
    );

    await pool.query(
      `UPDATE exam_participants
       SET status = 'waiting'
       WHERE exam_id = $1`,
      [examId]
    );

    res.status(200).json({
      success: true,
      message: 'Exam restarted. Students can rejoin with the same room code.',
      data: {
        exam: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Restart exam error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while restarting exam'
    });
  }
};

/**
 * Duplicate an exam (Teacher only - own exams) — creates a fresh copy with a
 * new room code and all the same questions, so a teacher can run a new
 * session without disturbing the original exam's data/results.
 * POST /api/exams/:id/duplicate
 */
const duplicateExam = async (req, res) => {
  const examId = req.params.id;
  const teacherId = req.user.userId;

  try {
    const sourceResult = await pool.query(
      'SELECT * FROM exams WHERE id = $1 AND created_by = $2',
      [examId, teacherId]
    );

    if (sourceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission'
      });
    }

    const source = sourceResult.rows[0];
    const roomCode = await generateUniqueRoomCode();

    const newExamResult = await pool.query(
      `INSERT INTO exams (
         title, description, exam_type, duration, created_by, room_code, status,
         webcam_required, allow_multiple_attempts, show_results_to_students
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'created', $7, $8, $9)
       RETURNING *`,
      [
        `${source.title} (Copy)`,
        source.description,
        source.exam_type,
        source.duration,
        teacherId,
        roomCode,
        source.webcam_required,
        source.allow_multiple_attempts,
        source.show_results_to_students
      ]
    );
    const newExam = newExamResult.rows[0];

    await pool.query(
      `INSERT INTO questions (
         exam_id, question_text, question_type, options, correct_answer, reference_answer,
         sample_input, sample_output, starter_code, marks, image_url
       )
       SELECT $1, question_text, question_type, options, correct_answer, reference_answer,
              sample_input, sample_output, starter_code, marks, image_url
       FROM questions
       WHERE exam_id = $2
       ORDER BY id ASC`,
      [newExam.id, examId]
    );

    res.status(201).json({
      success: true,
      message: 'Exam duplicated successfully',
      data: {
        exam: newExam
      }
    });
  } catch (error) {
    console.error('Duplicate exam error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while duplicating exam'
    });
  }
};

/**
 * Submit exam answers (Student only)
 * POST /api/exams/:id/submit
 */
const submitExam = async (req, res) => {
  const examId = req.params.id;
  const studentId = req.user.userId;
  const { answers, violations } = req.body;

  if (!answers || !Array.isArray(answers)) {
    return res.status(400).json({
      success: false,
      message: 'Answers array is required'
    });
  }

  try {
    const examMetaResult = await pool.query(
      'SELECT allow_multiple_attempts, show_results_to_students FROM exams WHERE id = $1',
      [examId]
    );
    if (examMetaResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }
    const allowMultipleAttempts = Boolean(examMetaResult.rows[0].allow_multiple_attempts);
    const showResultsToStudents = Boolean(examMetaResult.rows[0].show_results_to_students);

    const alreadySubmitted = await pool.query(
      'SELECT id FROM submissions WHERE exam_id = $1 AND student_id = $2',
      [examId, studentId]
    );

    if (alreadySubmitted.rows.length > 0) {
      if (!allowMultipleAttempts) {
        return res.status(409).json({
          success: false,
          message: 'You have already submitted this exam'
        });
      }
      // Multiple attempts allowed: drop the previous attempt so the new one
      // takes its place (submissions has a unique (exam_id, student_id) row).
      await pool.query(
        'DELETE FROM submissions WHERE exam_id = $1 AND student_id = $2',
        [examId, studentId]
      );
    }

    const questionsResult = await pool.query(
      `SELECT id, COALESCE(question_type, 'mcq') as question_type, correct_answer, marks
       FROM questions
       WHERE exam_id = $1
       ORDER BY id ASC`,
      [examId]
    );

    const questions = questionsResult.rows;
    const answerMap = new Map();
    answers.forEach((answer) => {
      if (answer && answer.question_id !== undefined && answer.question_id !== null) {
        answerMap.set(Number(answer.question_id), answer);
      }
    });

    let autoScore = 0;
    let hasManualEvaluationQuestions = false;
    const normalizedAnswers = [];

    questions.forEach((question) => {
      const qType = normalizeQuestionType(question.question_type);
      const maxMarks = Number(question.marks) || 0;
      const incoming = answerMap.get(Number(question.id)) || {};

      if (qType === 'written' || qType === 'coding') {
        hasManualEvaluationQuestions = true;
        const writtenAnswer = typeof incoming.written_answer === 'string'
          ? incoming.written_answer.trim()
          : '';
        const language = typeof incoming.language === 'string' ? incoming.language.trim() : '';

        normalizedAnswers.push({
          question_id: Number(question.id),
          question_type: qType,
          selected_answer: null,
          written_answer: writtenAnswer,
          language,
          is_correct: null,
          max_marks: maxMarks,
          awarded_marks: 0,
          evaluated: false,
          evaluation_comment: ''
        });
      } else {
        const selectedAnswerRaw = incoming.selected_answer;
        const selectedAnswer = selectedAnswerRaw === undefined || selectedAnswerRaw === null || selectedAnswerRaw === ''
          ? null
          : Number(selectedAnswerRaw);
        const correctAnswer = question.correct_answer === undefined || question.correct_answer === null || question.correct_answer === ''
          ? null
          : Number(question.correct_answer);

        const isCorrect = selectedAnswer !== null
          && !Number.isNaN(selectedAnswer)
          && correctAnswer !== null
          && !Number.isNaN(correctAnswer)
          && selectedAnswer === correctAnswer;

        const awardedMarks = isCorrect ? maxMarks : 0;
        autoScore += awardedMarks;

        normalizedAnswers.push({
          question_id: Number(question.id),
          question_type: 'mcq',
          selected_answer: selectedAnswer,
          written_answer: null,
          is_correct: isCorrect,
          max_marks: maxMarks,
          awarded_marks: awardedMarks,
          evaluated: true,
          evaluation_comment: ''
        });
      }
    });

    const evaluationStatus = hasManualEvaluationQuestions ? 'pending' : 'completed';

    const result = await pool.query(
      `INSERT INTO submissions (
         exam_id, student_id, answers, violations,
         auto_score, manual_score, score, evaluation_status
       ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING
         id, exam_id, student_id, auto_score, manual_score, score,
         evaluation_status, submitted_at`,
      [
        examId,
        studentId,
        JSON.stringify(normalizedAnswers),
        JSON.stringify(violations || []),
        autoScore,
        0,
        autoScore,
        evaluationStatus
      ]
    );

    const submission = result.rows[0];
    const responseSubmission = showResultsToStudents
      ? { ...submission, results_hidden: false }
      : {
          ...submission,
          auto_score: null,
          manual_score: null,
          score: null,
          evaluation_status: null,
          results_hidden: true
        };

    res.status(201).json({
      success: true,
      message: hasManualEvaluationQuestions
        ? 'Exam submitted. Manual answers are pending teacher evaluation.'
        : 'Exam submitted successfully',
      data: {
        submission: responseSubmission
      }
    });
  } catch (error) {
    console.error('Submit exam error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while submitting exam'
    });
  }
};

/**
 * Student joins exam via room code (no prior login required).
 * Identifies/provisions a student account from name + roll number,
 * and issues a JWT so the rest of the exam-taking flow stays authenticated.
 * POST /api/exams/join
 */
const joinExam = async (req, res) => {
  const { roomCode, studentName, rollNumber } = req.body;

  if (!roomCode) {
    return res.status(400).json({
      success: false,
      message: 'Room code is required'
    });
  }

  if (!studentName || studentName.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Student name is required'
    });
  }

  if (!rollNumber || String(rollNumber).trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Roll number is required'
    });
  }

  const normalizedName = studentName.trim();
  const normalizedRoll = String(rollNumber).trim();

  try {
    await syncExpiredExamStatuses();

    // Find or auto-provision the student account for this roll number.
    let studentResult = await pool.query(
      `SELECT id, name, email, role FROM users WHERE role = 'student' AND roll_number = $1 LIMIT 1`,
      [normalizedRoll]
    );

    let student;
    if (studentResult.rows.length === 0) {
      let generatedEmail = `${normalizedRoll}@student.local`;
      const emailExists = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [generatedEmail]);
      if (emailExists.rows.length > 0) {
        generatedEmail = `${normalizedRoll}.${Date.now()}@student.local`;
      }

      const generatedPasswordHash = await bcrypt.hash(`roll:${normalizedRoll}:${Date.now()}`, 10);
      const inserted = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, roll_number)
         VALUES ($1, $2, $3, 'student', $4)
         RETURNING id, name, email, role`,
        [normalizedName, generatedEmail, generatedPasswordHash, normalizedRoll]
      );
      student = inserted.rows[0];
    } else {
      student = studentResult.rows[0];
      if (student.name !== normalizedName) {
        await pool.query('UPDATE users SET name = $1 WHERE id = $2', [normalizedName, student.id]);
        student.name = normalizedName;
      }
    }

    const studentId = student.id;

    const examResult = await pool.query(
      `SELECT e.*, u.name as teacher_name,
         (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as question_count
       FROM exams e
       JOIN users u ON e.created_by = u.id
       WHERE UPPER(e.room_code) = UPPER($1)`,
      [roomCode]
    );

    if (examResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invalid room code'
      });
    }

    const exam = examResult.rows[0];

    if (exam.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'This exam has already ended'
      });
    }

    const token = jwt.sign(
      { userId: student.id, email: student.email, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    const userPayload = { id: student.id, name: normalizedName, email: student.email, role: 'student' };

    const participantCheck = await pool.query(
      'SELECT id FROM exam_participants WHERE exam_id = $1 AND student_id = $2',
      [exam.id, studentId]
    );

    if (participantCheck.rows.length > 0) {
      await pool.query(
        'UPDATE exam_participants SET student_name = $1 WHERE exam_id = $2 AND student_id = $3',
        [normalizedName, exam.id, studentId]
      );

      return res.status(200).json({
        success: true,
        message: 'Already joined this exam',
        data: { exam, token, user: userPayload }
      });
    }

    await pool.query(
      'INSERT INTO exam_participants (exam_id, student_id, student_name, status) VALUES ($1, $2, $3, $4)',
      [exam.id, studentId, normalizedName, 'waiting']
    );

    if (exam.status === 'created') {
      await pool.query(
        'UPDATE exams SET status = $1 WHERE id = $2',
        ['waiting', exam.id]
      );
      exam.status = 'waiting';
    }

    res.status(200).json({
      success: true,
      message: 'Successfully joined exam',
      data: { exam, token, user: userPayload }
    });
  } catch (error) {
    console.error('Join exam error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while joining exam'
    });
  }
};

/**
 * Get participants of an exam (Teacher only - own exams)
 * GET /api/exams/:id/participants
 */
const getExamParticipants = async (req, res) => {
  const examId = req.params.id;
  const teacherId = req.user.userId;

  try {
    const examCheck = await pool.query(
      'SELECT id FROM exams WHERE id = $1 AND created_by = $2',
      [examId, teacherId]
    );

    if (examCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission'
      });
    }

    const result = await pool.query(
      `SELECT 
         ep.*,
         COALESCE(ep.student_name, u.name) as student_name,
         u.name as account_name,
         u.email as student_email,
         u.role
       FROM exam_participants ep
       JOIN users u ON ep.student_id = u.id
       WHERE ep.exam_id = $1
       ORDER BY ep.joined_at ASC`,
      [examId]
    );

    res.status(200).json({
      success: true,
      data: {
        participants: result.rows
      }
    });
  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching participants'
    });
  }
};

/**
 * Teacher starts the exam
 * POST /api/exams/:id/start
 */
const startExam = async (req, res) => {
  const examId = req.params.id;
  const teacherId = req.user.userId;

  try {
    const examCheck = await pool.query(
      'SELECT id, status FROM exams WHERE id = $1 AND created_by = $2',
      [examId, teacherId]
    );

    if (examCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission'
      });
    }

    const exam = examCheck.rows[0];

    if (exam.status === 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'Exam already started'
      });
    }

    const participantCount = await pool.query(
      'SELECT COUNT(*) FROM exam_participants WHERE exam_id = $1',
      [examId]
    );

    if (parseInt(participantCount.rows[0].count, 10) === 0) {
      return res.status(400).json({
        success: false,
        message: 'No students have joined yet'
      });
    }

    const startedAt = new Date();
    await pool.query(
      'UPDATE exams SET status = $1, started_at = $2 WHERE id = $3',
      ['in_progress', startedAt, examId]
    );

    await pool.query(
      'UPDATE exam_participants SET status = $1 WHERE exam_id = $2',
      ['taking', examId]
    );

    res.status(200).json({
      success: true,
      message: 'Exam started successfully',
      data: {
        status: 'in_progress',
        started_at: startedAt
      }
    });
  } catch (error) {
    console.error('Start exam error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while starting exam'
    });
  }
};

/**
 * Get exam status and timer info
 * GET /api/exams/:id/status
 */
const getExamStatus = async (req, res) => {
  const examId = req.params.id;
  const userId = req.user.userId;
  const userRole = req.user.role;

  try {
    await syncExpiredExamStatuses();

    const examResult = await pool.query(
      'SELECT id, title, status, started_at, duration, created_by FROM exams WHERE id = $1',
      [examId]
    );

    if (examResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    const exam = examResult.rows[0];

    if (userRole === 'student') {
      const participantCheck = await pool.query(
        'SELECT id FROM exam_participants WHERE exam_id = $1 AND student_id = $2',
        [examId, userId]
      );

      if (participantCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'You have not joined this exam'
        });
      }
    } else if (userRole === 'teacher' && exam.created_by !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const participantCount = await pool.query(
      'SELECT COUNT(*) FROM exam_participants WHERE exam_id = $1',
      [examId]
    );

    res.status(200).json({
      success: true,
      data: {
        id: exam.id,
        title: exam.title,
        status: exam.status,
        started_at: exam.started_at,
        duration: exam.duration,
        participants_count: parseInt(participantCount.rows[0].count, 10)
      }
    });
  } catch (error) {
    console.error('Get exam status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching exam status'
    });
  }
};

/**
 * Get student's active/waiting exams
 * GET /api/exams/my-active
 */
const getMyActiveExams = async (req, res) => {
  const studentId = req.user.userId;

  try {
    await syncExpiredExamStatuses();

    const result = await pool.query(
      `SELECT
         e.*,
         u.name as teacher_name,
         ep.status as participation_status,
         ep.joined_at,
         e.started_at AT TIME ZONE 'UTC' + (e.duration || ' minutes')::INTERVAL as exam_end_time,
         NOW() AT TIME ZONE 'UTC' as current_time,
         (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as question_count
       FROM exam_participants ep
       JOIN exams e ON ep.exam_id = e.id
       JOIN users u ON e.created_by = u.id
       LEFT JOIN submissions s ON s.exam_id = e.id AND s.student_id = ep.student_id
       WHERE ep.student_id = $1
         AND e.status IN ('waiting', 'in_progress')
         AND (s.id IS NULL OR e.allow_multiple_attempts)
       ORDER BY ep.joined_at DESC`,
      [studentId]
    );

    res.status(200).json({
      success: true,
      data: {
        exams: result.rows
      }
    });
  } catch (error) {
    console.error('Get active exams error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching active exams'
    });
  }
};

/**
 * Export aggregate results for an exam as CSV (Teacher only — own exams).
 * GET /api/exams/:id/export-results.csv
 *
 * One row per participant (so even students who joined but never submitted
 * appear with blank scores). Columns are auto-quoted and CRLF-terminated.
 */
const exportExamResultsCsv = async (req, res) => {
  const examId = req.params.id;
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
    const exam = examCheck.rows[0];

    // Total marks (sum of all question marks) for context.
    const totalMarksResult = await pool.query(
      'SELECT COALESCE(SUM(marks), 0) AS total_marks FROM questions WHERE exam_id = $1',
      [examId]
    );
    const totalMarks = Number(totalMarksResult.rows[0]?.total_marks) || 0;

    // Left-join participants ↔ submissions so non-submitted students appear.
    const rowsResult = await pool.query(
      `SELECT
         u.roll_number,
         COALESCE(ep.student_name, u.name) AS student_name,
         u.email,
         ep.status                        AS participant_status,
         ep.violation_count,
         s.submitted_at,
         s.auto_score,
         s.manual_score,
         s.score,
         s.evaluation_status
       FROM exam_participants ep
       JOIN users u ON u.id = ep.student_id
       LEFT JOIN submissions s
         ON s.exam_id = ep.exam_id AND s.student_id = ep.student_id
       WHERE ep.exam_id = $1
       ORDER BY u.roll_number NULLS LAST, u.name ASC`,
      [examId]
    );

    const csvEscape = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      // Quote if it contains comma, quote, CR, LF, or leading/trailing space.
      if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const header = [
      'Roll Number',
      'Student Name',
      'Email',
      'Status',
      'Submitted At',
      'Auto Score',
      'Manual Score',
      'Total Score',
      `Out Of (${totalMarks})`,
      'Evaluation Status',
      'Violations'
    ];

    const lines = [header.map(csvEscape).join(',')];
    rowsResult.rows.forEach((row) => {
      lines.push([
        row.roll_number || '',
        row.student_name || '',
        row.email || '',
        row.participant_status || (row.submitted_at ? 'submitted' : 'joined'),
        row.submitted_at ? new Date(row.submitted_at).toISOString() : '',
        row.auto_score ?? '',
        row.manual_score ?? '',
        row.score ?? '',
        totalMarks,
        row.evaluation_status || (row.submitted_at ? 'pending' : 'not_submitted'),
        row.violation_count ?? 0
      ].map(csvEscape).join(','));
    });

    const safeTitle = String(exam.title || `exam_${examId}`)
      .replace(/[^a-z0-9_-]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || `exam_${examId}`;
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `${safeTitle}_results_${dateStamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM so Excel recognises UTF-8 names (non-ASCII roll labels etc.).
    res.send('﻿' + lines.join('\r\n') + '\r\n');
  } catch (error) {
    console.error('Export results CSV error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while exporting results'
    });
  }
};

module.exports = {
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
};
