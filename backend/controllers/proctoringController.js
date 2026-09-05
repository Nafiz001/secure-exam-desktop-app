const pool = require('../config/database');

/**
 * POST /api/proctoring/:examId/event
 * Student reports a face-detection violation event.
 * Body: { event_type: 'no_face' | 'multiple_faces' | 'looking_away', details?: string }
 *
 * The unified violation pipeline: every proctoring event also bumps the
 * exam_participants violation_count and updates last_violation_* so the
 * teacher sees face-detection issues in the same place as browser/keyboard
 * violations.
 */
const SEVERITY_BY_EVENT = {
  multiple_faces: 'high',
  no_face: 'medium',
  looking_away: 'low',
  looking_down: 'low',
  // Desktop-app events (window focus / blocked shortcuts) reported by the
  // Electron shell, so the teacher sees them live alongside webcam events
  // instead of only after the student submits.
  window_blur: 'high',
  fullscreen_exit: 'high',
  alt_f4_blocked: 'high',
  f11_blocked: 'medium',
};

const HUMAN_LABEL_BY_EVENT = {
  multiple_faces: 'Multiple faces detected',
  no_face: 'No face detected',
  looking_away: 'Looking away from screen',
  looking_down: 'Looking down',
  window_blur: 'Switched away from the exam window',
  fullscreen_exit: 'Exited fullscreen',
  alt_f4_blocked: 'Tried to close the app (Alt+F4)',
  f11_blocked: 'Pressed F11',
};

const reportEvent = async (req, res) => {
  const examId = Number(req.params.examId);
  const studentId = req.user.userId;
  const { event_type, details } = req.body;

  if (!Object.prototype.hasOwnProperty.call(SEVERITY_BY_EVENT, event_type)) {
    return res.status(400).json({ success: false, message: 'Invalid event_type' });
  }

  const severity = SEVERITY_BY_EVENT[event_type] || 'medium';
  const humanType = HUMAN_LABEL_BY_EVENT[event_type] || event_type;

  try {
    await pool.query(
      `INSERT INTO proctoring_events (exam_id, student_id, event_type, details)
       VALUES ($1, $2, $3, $4)`,
      [examId, studentId, event_type, details || null]
    );

    // Mirror into the unified per-participant violation summary so the
    // teacher dashboard's single counter reflects ALL violations. The
    // teacher decides what to do about a flagged student (e.g. Stop Exam) —
    // this never auto-submits on the student's behalf.
    await pool.query(
      `UPDATE exam_participants
       SET
         violation_count = COALESCE(violation_count, 0) + 1,
         last_violation_type = $1,
         last_violation_severity = $2,
         last_violation_at = CURRENT_TIMESTAMP
       WHERE exam_id = $3 AND student_id = $4`,
      [humanType.slice(0, 100), severity, examId, studentId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Proctoring reportEvent error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/proctoring/:examId/snapshot
 * Student uploads a webcam snapshot + current face status.
 * Body: { snapshot_base64: string, face_count: number, status: 'ok'|'warning'|'violation' }
 */
const uploadSnapshot = async (req, res) => {
  const examId = Number(req.params.examId);
  const studentId = req.user.userId;
  const { snapshot_base64, face_count, status } = req.body;

  const allowedStatus = ['ok', 'warning', 'violation'];
  const normalizedStatus = allowedStatus.includes(status) ? status : 'ok';
  const normalizedCount = Math.max(0, Number(face_count) || 0);

  // Limit snapshot size (~300KB base64 max — roughly 225KB image)
  if (snapshot_base64 && snapshot_base64.length > 400000) {
    return res.status(400).json({ success: false, message: 'Snapshot too large' });
  }

  try {
    await pool.query(
      `INSERT INTO proctoring_snapshots (exam_id, student_id, snapshot_base64, face_count, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (exam_id, student_id)
       DO UPDATE SET
         snapshot_base64 = EXCLUDED.snapshot_base64,
         face_count = EXCLUDED.face_count,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [examId, studentId, snapshot_base64 || null, normalizedCount, normalizedStatus]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Proctoring uploadSnapshot error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/proctoring/:examId/students
 * Teacher fetches all students' current proctoring status + latest snapshot.
 */
const getStudentsStatus = async (req, res) => {
  const examId = Number(req.params.examId);
  const teacherId = req.user.userId;

  try {
    // Verify teacher owns this exam
    const examCheck = await pool.query(
      'SELECT id FROM exams WHERE id = $1 AND created_by = $2',
      [examId, teacherId]
    );
    if (examCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found or access denied' });
    }

    const result = await pool.query(
      `SELECT
         ep.student_id,
         ep.student_name,
         COALESCE(ps.face_count, 0) AS face_count,
         COALESCE(ps.status, 'unknown') AS proctoring_status,
         ps.snapshot_base64,
         ps.updated_at AS snapshot_at,
         (SELECT COUNT(*) FROM proctoring_events pe
          WHERE pe.exam_id = $1 AND pe.student_id = ep.student_id) AS total_events,
         (SELECT COUNT(*) FROM proctoring_events pe
          WHERE pe.exam_id = $1 AND pe.student_id = ep.student_id
            AND pe.event_type = 'no_face') AS no_face_count,
         (SELECT COUNT(*) FROM proctoring_events pe
          WHERE pe.exam_id = $1 AND pe.student_id = ep.student_id
            AND pe.event_type = 'multiple_faces') AS multiple_faces_count,
         (SELECT COUNT(*) FROM proctoring_events pe
          WHERE pe.exam_id = $1 AND pe.student_id = ep.student_id
            AND pe.event_type = 'looking_away') AS looking_away_count,
         (SELECT COUNT(*) FROM proctoring_events pe
          WHERE pe.exam_id = $1 AND pe.student_id = ep.student_id
            AND pe.event_type = 'looking_down') AS looking_down_count
       FROM exam_participants ep
       LEFT JOIN proctoring_snapshots ps
         ON ps.exam_id = ep.exam_id AND ps.student_id = ep.student_id
       WHERE ep.exam_id = $1
       ORDER BY ep.student_name ASC`,
      [examId]
    );

    res.json({ success: true, data: { students: result.rows } });
  } catch (error) {
    console.error('Proctoring getStudentsStatus error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/proctoring/:examId/events/:studentId
 * Teacher fetches the full event log for one student.
 */
const getStudentEvents = async (req, res) => {
  const examId = Number(req.params.examId);
  const studentId = Number(req.params.studentId);
  const teacherId = req.user.userId;

  try {
    const examCheck = await pool.query(
      'SELECT id FROM exams WHERE id = $1 AND created_by = $2',
      [examId, teacherId]
    );
    if (examCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found or access denied' });
    }

    const result = await pool.query(
      `SELECT id, event_type, details, created_at
       FROM proctoring_events
       WHERE exam_id = $1 AND student_id = $2
       ORDER BY created_at DESC
       LIMIT 200`,
      [examId, studentId]
    );

    res.json({ success: true, data: { events: result.rows } });
  } catch (error) {
    console.error('Proctoring getStudentEvents error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { reportEvent, uploadSnapshot, getStudentsStatus, getStudentEvents };
