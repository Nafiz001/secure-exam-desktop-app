# Integration Testing Guide (Current Version)

This checklist validates the end-to-end behavior of the current Invigilo system.
Use it before demos, submissions, or releases.

## 1. Test Environment

- Backend running on `http://localhost:5000`
- PostgreSQL connected
- Electron app launched from project root via `npm start`
- At least one account per role:
  - Admin
  - Teacher
  - Student

## 2. Smoke Checks

1. `GET /api/health` returns success.
2. Login works for Admin, Teacher, and Student.
3. Direct student entry via room code + roll works from Login page `Enter Exam`.

## 3. Core End-to-End Scenario

### A. Admin Setup

1. Login as Admin.
2. Create a teacher account.
3. Create one or more student accounts (single or CSV).
4. Confirm account activation status controls work.

### B. Teacher Exam Setup

1. Login as Teacher.
2. Create exam with:
   - Title and duration
   - `question_flow_mode` (`all_at_once` or `one_by_one`)
   - `randomize_question_order` enabled
   - optional webcam requirement
3. Open Manage Exam and verify settings are saved.
4. Add questions:
   - MCQ
   - Written
   - Coding
5. Copy room code from live room panel.

### C. Student Join and Attempt

1. Login as Student or use `Enter Exam`.
2. Join by room code and name.
3. Confirm waiting room auto-check updates status and participant count.
4. Teacher starts exam.
5. Confirm student enters exam screen and timer starts.
6. Answer questions:
   - MCQ selection
   - Written text
   - Coding with run action
7. Submit exam.

### D. Teacher Monitoring and Evaluation

1. Verify participant appears in live list.
2. Trigger test violations (blur/fullscreen leave shortcut attempt) and confirm count updates.
3. Test `Freeze` and `Unfreeze` on student.
4. Test `Force Submit` on active student (separate run recommended).
5. Open Evaluation Desk:
   - Open answer sheet
   - Confirm coding answer keeps multiline formatting
   - Add manual marks/comments
   - Save evaluation

### E. Student Result Verification

1. Open `My Results`.
2. Confirm submission appears with evaluation status.
3. Open `View Details`.
4. Verify question-level marks and comments.

## 4. Detailed Test Cases

| ID | Scenario | Expected Result |
|---|---|---|
| IT-01 | Teacher creates exam | Exam saved and visible in list |
| IT-02 | Waiting room auto polling | Status updates without manual check button |
| IT-03 | Start exam | Exam moves to `in_progress`; students begin |
| IT-04 | Randomized order enabled | Student sees randomized order indicator |
| IT-05 | One-by-one flow | Next remains locked until current answer is provided |
| IT-06 | Record violation | Teacher participant violation count increases |
| IT-07 | Freeze participant | Student overlay shown; inputs read-only |
| IT-08 | Unfreeze participant | Student interaction restored |
| IT-09 | Force submit | Student gets force-submit overlay and submission completes |
| IT-10 | Manual evaluation save | Submission manual score and status update |
| IT-11 | Student result details | Per-question marks/comments visible |
| IT-12 | Delete exam ownership rule | Non-owner delete rejected |

## 5. Optional API-Level Checks

Use a REST client or curl with JWT tokens.

- Auth:
  - `POST /api/auth/login`
  - `GET /api/auth/me`
- Exams:
  - `POST /api/exams`
  - `POST /api/exams/join`
  - `POST /api/exams/:id/start`
  - `POST /api/exams/:id/submit`
  - `GET /api/exams/my-results`
- Participant controls:
  - `POST /api/exams/:id/participants/:participantId/toggle-freeze`
  - `POST /api/exams/:id/participants/:participantId/force-submit`
- Evaluation:
  - `GET /api/exams/:examId/evaluation/participants`
  - `GET /api/exams/:examId/evaluation/submissions/:submissionId`
  - `PUT /api/exams/:examId/evaluation/submissions/:submissionId/score`

## 6. DB Verification Queries (Optional)

```sql
-- Recent submissions
SELECT id, exam_id, student_id, auto_score, manual_score, score, evaluation_status, submitted_at
FROM submissions
ORDER BY submitted_at DESC
LIMIT 20;

-- Participant live state
SELECT exam_id, student_id, status, violation_count, is_frozen, force_submit_requested, last_violation_type, last_violation_at
FROM exam_participants
ORDER BY joined_at DESC
LIMIT 20;
```

## 7. Release Exit Criteria

- All smoke checks pass.
- All critical scenarios (IT-01 to IT-12) pass.
- No blocking console errors in Electron/Backend logs.
- Renderer build succeeds (`npm run build:renderer`).
