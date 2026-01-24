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

/**
 * Create a new exam (Teacher only)
 * POST /api/exams
 */
const createExam = async (req, res) => {
  const { title, description, duration } = req.body;
  const teacherId = req.user.userId;

  // Validation
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
    // Generate unique room code
    const roomCode = await generateUniqueRoomCode();
    
    const result = await pool.query(
      `INSERT INTO exams (title, description, duration, created_by, room_code, status) 
       VALUES ($1, $2, $3, $4, $5, 'created') 
       RETURNING id, title, description, duration, created_by, room_code, status, created_at`,
      [title, description || '', duration, teacherId, roomCode]
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
 * Teachers: Get their own exams
 * Students: Get all available exams
 */
const getExams = async (req, res) => {
  const { userId, role } = req.user;

  try {
    let query;
    let params;

    if (role === 'teacher') {
      // Teachers see only their exams
      query = `
        SELECT e.*, u.name as teacher_name,
        (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as question_count
        FROM exams e
        JOIN users u ON e.created_by = u.id
        WHERE e.created_by = $1
        ORDER BY e.created_at DESC
      `;
      params = [userId];
    } else {
      // Students see all exams with question count
      query = `
        SELECT e.*, u.name as teacher_name,
        (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as question_count
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
  const { role } = req.user;

  try {
    // Get exam details
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

    // Get questions
    let questionsQuery;
    if (role === 'teacher' || role === 'admin') {
      // Teachers and admins see correct answers
      questionsQuery = `
        SELECT id, exam_id, question_text, options, correct_answer, marks, created_at
        FROM questions
        WHERE exam_id = $1
        ORDER BY id ASC
      `;
    } else {
      // Students don't see correct answers
      questionsQuery = `
        SELECT id, exam_id, question_text, options, marks
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
          questions: questionsResult.rows
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
  const { title, description, duration } = req.body;
  const teacherId = req.user.userId;

  try {
    // Check if exam exists and belongs to teacher
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
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND created_by = $5
       RETURNING *`,
      [title, description, duration, examId, teacherId]
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
    // Check if already submitted
    const checkResult = await pool.query(
      'SELECT id FROM submissions WHERE exam_id = $1 AND student_id = $2',
      [examId, studentId]
    );

    if (checkResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'You have already submitted this exam'
      });
    }

    // Calculate score
    const questionsResult = await pool.query(
      'SELECT id, correct_answer, marks FROM questions WHERE exam_id = $1',
      [examId]
    );

    const questions = questionsResult.rows;
    let totalScore = 0;

    answers.forEach(answer => {
      const question = questions.find(q => q.id === answer.questionId);
      if (question && answer.selectedAnswer === question.correct_answer) {
        totalScore += question.marks;
      }
    });

    // Insert submission
    const result = await pool.query(
      `INSERT INTO submissions (exam_id, student_id, answers, violations, score) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, exam_id, student_id, score, submitted_at`,
      [examId, studentId, JSON.stringify(answers), JSON.stringify(violations || []), totalScore]
    );

    res.status(201).json({
      success: true,
      message: 'Exam submitted successfully',
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
  const { roomCode } = req.body;
  const studentId = req.user.userId;

  if (!roomCode) {
    return res.status(400).json({
      success: false,
      message: 'Room code is required'
    });
  }

  try {
    // Find exam by room code
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

    // Check if exam already started or completed
    if (exam.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'This exam has already ended'
      });
    }

    // Check if student already joined
    const participantCheck = await pool.query(
      'SELECT id FROM exam_participants WHERE exam_id = $1 AND student_id = $2',
      [exam.id, studentId]
    );

    if (participantCheck.rows.length > 0) {
      // Already joined, return exam info
      return res.status(200).json({
        success: true,
        message: 'Already joined this exam',
        data: { exam }
      });
    }

    // Add student to participants
    await pool.query(
      'INSERT INTO exam_participants (exam_id, student_id, status) VALUES ($1, $2, $3)',
      [exam.id, studentId, 'waiting']
    );

    // Update exam status to waiting if it was created
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
    // Verify exam belongs to teacher
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

    // Get participants
    const result = await pool.query(
      `SELECT ep.*, u.name, u.email, u.role
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
    // Verify exam belongs to teacher
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

    // Check if already started
    if (exam.status === 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'Exam already started'
      });
    }

    // Check if at least one student joined
    const participantCount = await pool.query(
      'SELECT COUNT(*) FROM exam_participants WHERE exam_id = $1',
      [examId]
    );

    if (parseInt(participantCount.rows[0].count) === 0) {
      return res.status(400).json({
        success: false,
        message: 'No students have joined yet'
      });
    }

    // Start exam
    const startedAt = new Date();
    await pool.query(
      'UPDATE exams SET status = $1, started_at = $2 WHERE id = $3',
      ['in_progress', startedAt, examId]
    );

    // Update participants status to taking
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
    // Get exam details
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

    // Verify access (teacher owns it or student joined)
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

    // Get participant count
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
        participants_count: parseInt(participantCount.rows[0].count)
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
    const result = await pool.query(
      `SELECT e.*, u.name as teacher_name, ep.status as participation_status, ep.joined_at
       FROM exam_participants ep
       JOIN exams e ON ep.exam_id = e.id
       JOIN users u ON e.created_by = u.id
       WHERE ep.student_id = $1 AND e.status IN ('waiting', 'in_progress')
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

module.exports = {
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
};
