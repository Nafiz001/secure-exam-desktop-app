const pool = require('../config/database');

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

function normalizeQuestionFlowMode(rawMode) {
  return String(rawMode || 'all_at_once').toLowerCase() === 'one_by_one' ? 'one_by_one' : 'all_at_once';
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function hashSeed(input) {
  const text = String(input || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandomFactory(seedValue) {
  let seed = seedValue >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function deterministicShuffle(items, seedKey) {
  const shuffled = Array.isArray(items) ? [...items] : [];
  const nextRandom = seededRandomFactory(hashSeed(seedKey));
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function normalizeViolationSeverity(rawSeverity) {
  const normalized = String(rawSeverity || '').toLowerCase();
  if (normalized === 'low') return 'low';
  if (normalized === 'high') return 'high';
  return 'medium';
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

async function ensureTeacherOwnsExam(examId, teacherId) {
  const examCheck = await pool.query(
    'SELECT id, status FROM exams WHERE id = $1 AND created_by = $2',
    [examId, teacherId]
  );
  return examCheck.rows[0] || null;
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
    question_flow_mode,
    randomize_question_order
  } = req.body;
  const teacherId = req.user.userId;
  const normalizedExamType = normalizeExamType(exam_type);
  const webcamRequired = normalizeBoolean(webcam_required, false);
  const questionFlowMode = normalizeQuestionFlowMode(question_flow_mode);
  const randomizeQuestionOrder = normalizeBoolean(randomize_question_order, false);

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
         title,
         description,
         exam_type,
         duration,
         created_by,
         room_code,
         status,
         webcam_required,
         question_flow_mode,
         randomize_question_order
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'created', $7, $8, $9)
       RETURNING
         id,
         title,
         description,
         exam_type,
         duration,
         created_by,
         room_code,
         status,
         webcam_required,
         question_flow_mode,
         randomize_question_order,
         created_at`,
      [
        title,
        description || '',
        normalizedExamType,
        duration,
        teacherId,
        roomCode,
        webcamRequired,
        questionFlowMode,
        randomizeQuestionOrder
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
      hasSubmitted = submissionCheck.rows.length > 0;
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
          created_at
        FROM questions
        WHERE exam_id = $1
        ORDER BY id ASC
      `;
    }

    const questionsResult = await pool.query(questionsQuery, [examId]);
    const shouldRandomize = role === 'student' && normalizeBoolean(exam.randomize_question_order, false);
    const questions = shouldRandomize
      ? deterministicShuffle(questionsResult.rows, `exam:${examId}:student:${userId}`)
      : questionsResult.rows;

    res.status(200).json({
      success: true,
      data: {
        exam: {
          ...exam,
          questions,
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
    question_flow_mode,
    randomize_question_order
  } = req.body;
  const teacherId = req.user.userId;
  const normalizedExamType = exam_type === undefined ? null : normalizeExamType(exam_type);
  const webcamRequired = webcam_required === undefined ? null : normalizeBoolean(webcam_required, false);
  const questionFlowMode = question_flow_mode === undefined ? null : normalizeQuestionFlowMode(question_flow_mode);
  const randomizeQuestionOrder = randomize_question_order === undefined
    ? null
    : normalizeBoolean(randomize_question_order, false);

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
           question_flow_mode = COALESCE($6, question_flow_mode),
           randomize_question_order = COALESCE($7, randomize_question_order),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND created_by = $9
       RETURNING *`,
      [
        title,
        description,
        duration,
        normalizedExamType,
        webcamRequired,
        questionFlowMode,
        randomizeQuestionOrder,
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
    const alreadySubmitted = await pool.query(
      'SELECT id FROM submissions WHERE exam_id = $1 AND student_id = $2',
      [examId, studentId]
    );

    if (alreadySubmitted.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'You have already submitted this exam'
      });
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

    await pool.query(
      `UPDATE exam_participants
       SET
         status = 'completed',
         force_submit_requested = FALSE,
         is_frozen = FALSE
       WHERE exam_id = $1 AND student_id = $2`,
      [examId, studentId]
    );

    res.status(201).json({
      success: true,
      message: hasManualEvaluationQuestions
        ? 'Exam submitted. Manual answers are pending teacher evaluation.'
        : 'Exam submitted successfully',
      data: {
        submission: result.rows[0]
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
 * Student joins exam via room code
 * POST /api/exams/join
 */
const joinExam = async (req, res) => {
  const { roomCode, studentName } = req.body;
  const studentId = req.user.userId;

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

  try {
    await syncExpiredExamStatuses();

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

    const participantCheck = await pool.query(
      'SELECT id FROM exam_participants WHERE exam_id = $1 AND student_id = $2',
      [exam.id, studentId]
    );

    if (participantCheck.rows.length > 0) {
      await pool.query(
        `UPDATE exam_participants
         SET
           student_name = $1,
           force_submit_requested = FALSE,
           is_frozen = FALSE
         WHERE exam_id = $2 AND student_id = $3`,
        [studentName.trim(), exam.id, studentId]
      );

      return res.status(200).json({
        success: true,
        message: 'Already joined this exam',
        data: { exam }
      });
    }

    await pool.query(
      'INSERT INTO exam_participants (exam_id, student_id, student_name, status) VALUES ($1, $2, $3, $4)',
      [exam.id, studentId, studentName.trim(), 'waiting']
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
      data: { exam }
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

    await pool.query(
      `UPDATE exam_participants
       SET
         force_submit_requested = FALSE,
         is_frozen = FALSE
       WHERE exam_id = $1`,
      [examId]
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

    let participantData = null;
    if (userRole === 'student') {
      const participantCheck = await pool.query(
        `SELECT id, status, COALESCE(is_frozen, FALSE) as is_frozen, COALESCE(force_submit_requested, FALSE) as force_submit_requested
         FROM exam_participants
         WHERE exam_id = $1 AND student_id = $2`,
        [examId, userId]
      );

      if (participantCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'You have not joined this exam'
        });
      }
      participantData = participantCheck.rows[0];
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
        participants_count: parseInt(participantCount.rows[0].count, 10),
        participant_status: participantData?.status || null,
        is_frozen: Boolean(participantData?.is_frozen),
        force_submit_requested: Boolean(participantData?.force_submit_requested)
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
         AND s.id IS NULL
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
 * Get student's submitted exam results summary
 * GET /api/exams/my-results
 */
const getMyResults = async (req, res) => {
  const studentId = req.user.userId;

  try {
    const result = await pool.query(
      `SELECT
         s.id as submission_id,
         s.exam_id,
         s.submitted_at,
         s.auto_score,
         s.manual_score,
         s.score,
         s.evaluation_status,
         s.evaluated_at,
         e.title as exam_title,
         e.exam_type,
         e.duration,
         u.name as teacher_name
       FROM submissions s
       JOIN exams e ON s.exam_id = e.id
       JOIN users u ON e.created_by = u.id
       WHERE s.student_id = $1
       ORDER BY s.submitted_at DESC`,
      [studentId]
    );

    res.status(200).json({
      success: true,
      data: {
        results: result.rows
      }
    });
  } catch (error) {
    console.error('Get my results error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching results'
    });
  }
};

/**
 * Get one submitted exam result with question-level details (Student only)
 * GET /api/exams/my-results/:submissionId
 */
const getMyResultDetails = async (req, res) => {
  const studentId = req.user.userId;
  const submissionId = req.params.submissionId;

  try {
    const submissionResult = await pool.query(
      `SELECT
         s.id,
         s.exam_id,
         s.submitted_at,
         s.auto_score,
         s.manual_score,
         s.score,
         s.evaluation_status,
         s.evaluated_at,
         s.answers,
         e.title as exam_title,
         e.exam_type,
         e.duration,
         u.name as teacher_name
       FROM submissions s
       JOIN exams e ON s.exam_id = e.id
       JOIN users u ON e.created_by = u.id
       WHERE s.id = $1 AND s.student_id = $2`,
      [submissionId, studentId]
    );

    if (submissionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Result not found'
      });
    }

    const submission = submissionResult.rows[0];
    const rawAnswers = Array.isArray(submission.answers)
      ? submission.answers
      : (() => {
          try {
            const parsed = JSON.parse(submission.answers || '[]');
            return Array.isArray(parsed) ? parsed : [];
          } catch (error) {
            return [];
          }
        })();

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
         marks
       FROM questions
       WHERE exam_id = $1
       ORDER BY id ASC`,
      [submission.exam_id]
    );

    const details = questionsResult.rows.map((question) => {
      const answer = answerMap.get(Number(question.id)) || {};
      const parsedOptions = Array.isArray(question.options)
        ? question.options
        : (() => {
            try {
              const parsed = JSON.parse(question.options || '[]');
              return Array.isArray(parsed) ? parsed : [];
            } catch (error) {
              return [];
            }
          })();

      return {
        question_id: Number(question.id),
        question_text: question.question_text,
        question_type: normalizeQuestionType(question.question_type),
        options: parsedOptions,
        correct_answer: question.correct_answer,
        reference_answer: question.reference_answer || '',
        sample_input: question.sample_input || '',
        sample_output: question.sample_output || '',
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
        result: {
          submission_id: submission.id,
          exam_id: submission.exam_id,
          exam_title: submission.exam_title,
          exam_type: submission.exam_type,
          duration: submission.duration,
          teacher_name: submission.teacher_name,
          submitted_at: submission.submitted_at,
          auto_score: Number(submission.auto_score) || 0,
          manual_score: Number(submission.manual_score) || 0,
          score: Number(submission.score) || 0,
          evaluation_status: submission.evaluation_status,
          evaluated_at: submission.evaluated_at,
          answers: details
        }
      }
    });
  } catch (error) {
    console.error('Get my result details error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching result details'
    });
  }
};

/**
 * Record a live violation for an active exam participant
 * POST /api/exams/:id/violations
 */
const recordViolation = async (req, res) => {
  const examId = req.params.id;
  const studentId = req.user.userId;
  const { type, severity } = req.body || {};
  const normalizedType = String(type || '').trim();
  const normalizedSeverity = normalizeViolationSeverity(severity);

  if (!normalizedType) {
    return res.status(400).json({
      success: false,
      message: 'Violation type is required'
    });
  }

  try {
    await syncExpiredExamStatuses();

    const examCheck = await pool.query(
      'SELECT id, status FROM exams WHERE id = $1',
      [examId]
    );

    if (examCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found'
      });
    }

    const exam = examCheck.rows[0];
    if (exam.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'Violations can be recorded only while exam is in progress'
      });
    }

    const participantResult = await pool.query(
      `UPDATE exam_participants
       SET
         violation_count = COALESCE(violation_count, 0) + 1,
         last_violation_type = $1,
         last_violation_severity = $2,
         last_violation_at = CURRENT_TIMESTAMP
       WHERE exam_id = $3 AND student_id = $4
       RETURNING id, violation_count, last_violation_type, last_violation_severity, last_violation_at`,
      [normalizedType.slice(0, 100), normalizedSeverity, examId, studentId]
    );

    if (participantResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You have not joined this exam'
      });
    }

    res.status(200).json({
      success: true,
      data: participantResult.rows[0]
    });
  } catch (error) {
    console.error('Record violation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while recording violation'
    });
  }
};

/**
 * Teacher requests force submit for a participant
 * POST /api/exams/:id/participants/:participantId/force-submit
 */
const forceSubmitParticipant = async (req, res) => {
  const examId = req.params.id;
  const participantId = req.params.participantId;
  const teacherId = req.user.userId;

  try {
    const exam = await ensureTeacherOwnsExam(examId, teacherId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission'
      });
    }

    const participantResult = await pool.query(
      `UPDATE exam_participants
       SET force_submit_requested = TRUE, is_frozen = FALSE
       WHERE id = $1 AND exam_id = $2
       RETURNING id, exam_id, student_id, student_name, status, force_submit_requested`,
      [participantId, examId]
    );

    if (participantResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Participant not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Force submit requested for participant',
      data: {
        participant: participantResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Force submit participant error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while forcing participant submission'
    });
  }
};

/**
 * Teacher toggles freeze/unfreeze for a participant
 * POST /api/exams/:id/participants/:participantId/toggle-freeze
 */
const toggleParticipantFreeze = async (req, res) => {
  const examId = req.params.id;
  const participantId = req.params.participantId;
  const teacherId = req.user.userId;

  try {
    const exam = await ensureTeacherOwnsExam(examId, teacherId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission'
      });
    }

    const toggleResult = await pool.query(
      `UPDATE exam_participants
       SET is_frozen = NOT COALESCE(is_frozen, FALSE)
       WHERE id = $1 AND exam_id = $2
       RETURNING id, exam_id, student_id, student_name, status, is_frozen`,
      [participantId, examId]
    );

    if (toggleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Participant not found'
      });
    }

    const participant = toggleResult.rows[0];
    res.status(200).json({
      success: true,
      message: participant.is_frozen ? 'Participant exam frozen' : 'Participant exam unfrozen',
      data: {
        participant
      }
    });
  } catch (error) {
    console.error('Toggle participant freeze error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while toggling participant freeze'
    });
  }
};

/**
 * POST /api/exams/join-by-room
 * No login required — student provides roomCode + roll to enter an exam directly.
 * Body: { roomCode, roll }
 */
const joinByRoom = async (req, res) => {
  const { roomCode, roll } = req.body;

  if (!roomCode || !roll) {
    return res.status(400).json({ success: false, message: 'roomCode and roll are required' });
  }

  const normalizedRoll = String(roll).trim();
  const normalizedCode = String(roomCode).trim().toUpperCase();

  try {
    // Find active student by roll
    const studentResult = await pool.query(
      `SELECT id, name, email, role, roll_number, status FROM users
       WHERE role = 'student' AND roll_number = $1 LIMIT 1`,
      [normalizedRoll]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No student found with this roll number. Contact admin.' });
    }

    const student = studentResult.rows[0];
    if (student.status === 'inactive') {
      return res.status(403).json({ success: false, message: 'Your account is inactive. Contact admin.' });
    }

    // Find exam by room code
    const examResult = await pool.query(
      `SELECT id, title, exam_type, duration, status, webcam_required, question_flow_mode, randomize_question_order, started_at
       FROM exams WHERE room_code = $1 LIMIT 1`,
      [normalizedCode]
    );

    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invalid room code' });
    }

    const exam = examResult.rows[0];
    if (exam.status === 'completed') {
      return res.status(400).json({ success: false, message: 'This exam has already ended' });
    }

    // Check if already submitted
    const submissionCheck = await pool.query(
      'SELECT id FROM submissions WHERE exam_id = $1 AND student_id = $2',
      [exam.id, student.id]
    );
    if (submissionCheck.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'You have already submitted this exam' });
    }

    // Upsert participant
    await pool.query(
      `INSERT INTO exam_participants (exam_id, student_id, student_name, status)
       VALUES ($1, $2, $3, 'waiting')
       ON CONFLICT (exam_id, student_id) DO NOTHING`,
      [exam.id, student.id, student.name]
    );

    // Issue short-lived JWT so student can make authenticated API calls during exam
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: student.id, email: student.email, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );

    res.json({
      success: true,
      message: 'Joined exam successfully',
      data: {
        user: { id: student.id, name: student.name, email: student.email, role: 'student', roll_number: student.roll_number },
        token,
        exam
      }
    });

  } catch (error) {
    console.error('[joinByRoom] error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  createExam,
  getExams,
  getExamById,
  updateExam,
  deleteExam,
  submitExam,
  joinExam,
  joinByRoom,
  getExamParticipants,
  startExam,
  getExamStatus,
  getMyActiveExams,
  getMyResults,
  getMyResultDetails,
  recordViolation,
  forceSubmitParticipant,
  toggleParticipantFreeze
};
