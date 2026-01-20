const pool = require('../config/database');

/**
 * Add question to exam (Teacher only - own exams)
 * POST /api/exams/:examId/questions
 */
const addQuestion = async (req, res) => {
  const examId = req.params.examId;
  const { question_text, options, correct_answer, marks } = req.body;
  const teacherId = req.user.userId;

  // Validation
  if (!question_text || !options || !correct_answer || !marks) {
    return res.status(400).json({
      success: false,
      message: 'Question text, options, correct answer, and marks are required'
    });
  }

  if (!Array.isArray(options) || options.length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Options must be an array with at least 2 choices'
    });
  }

  if (marks <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Marks must be greater than 0'
    });
  }

  try {
    // Verify exam exists and belongs to teacher
    const examCheck = await pool.query(
      'SELECT id FROM exams WHERE id = $1 AND created_by = $2',
      [examId, teacherId]
    );

    if (examCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have permission to add questions'
      });
    }

    // Insert question
    const result = await pool.query(
      `INSERT INTO questions (exam_id, question_text, options, correct_answer, marks) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, exam_id, question_text, options, correct_answer, marks, created_at`,
      [examId, question_text, JSON.stringify(options), correct_answer, marks]
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
 * PUT /api/questions/:id
 */
const updateQuestion = async (req, res) => {
  const questionId = req.params.id;
  const { question_text, options, correct_answer, marks } = req.body;
  const teacherId = req.user.userId;

  try {
    // Verify question belongs to teacher's exam
    const checkResult = await pool.query(
      `SELECT q.* FROM questions q 
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

    // Update question
    const result = await pool.query(
      `UPDATE questions 
       SET question_text = COALESCE($1, question_text),
           options = COALESCE($2, options),
           correct_answer = COALESCE($3, correct_answer),
           marks = COALESCE($4, marks)
       WHERE id = $5
       RETURNING *`,
      [
        question_text,
        options ? JSON.stringify(options) : null,
        correct_answer,
        marks,
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
 * DELETE /api/questions/:id
 */
const deleteQuestion = async (req, res) => {
  const questionId = req.params.id;
  const teacherId = req.user.userId;

  try {
    // Delete question if it belongs to teacher's exam
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
 * Get submissions for an exam (Teacher only - own exams)
 * GET /api/exams/:examId/submissions
 */
const getExamSubmissions = async (req, res) => {
  const examId = req.params.examId;
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
        message: 'Exam not found or you do not have permission to view submissions'
      });
    }

    // Get all submissions with student details
    const result = await pool.query(
      `SELECT s.*, u.name as student_name, u.email as student_email
       FROM submissions s
       JOIN users u ON s.student_id = u.id
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

module.exports = {
  addQuestion,
  updateQuestion,
  deleteQuestion,
  getExamSubmissions
};
