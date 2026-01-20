const pool = require('../config/database');

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
    const result = await pool.query(
      `INSERT INTO exams (title, description, duration, created_by) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, title, description, duration, created_by, created_at`,
      [title, description || '', duration, teacherId]
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

module.exports = {
  createExam,
  getExams,
  getExamById,
  updateExam,
  deleteExam,
  submitExam
};
