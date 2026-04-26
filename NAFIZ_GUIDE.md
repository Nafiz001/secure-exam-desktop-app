# Frontend Handoff Guide (Nafiz Scope)

This document summarizes the current frontend-facing architecture, integration points, and safe change rules.

## 1. Frontend Ownership

Primary files:

- `renderer/src/App.jsx`
- `renderer/src/pages/LoginPage.jsx`
- `renderer/src/features/student/StudentDashboard.jsx`
- `renderer/src/features/teacher/TeacherDashboard.jsx`
- `renderer/src/features/admin/AdminDashboard.jsx`
- `renderer/src/features/student/ProctoringCamera.jsx`
- `renderer/src/api.js`

## 2. Current UI Flows

### Login

- Two tabs:
  - `Sign In` (email/password or student roll/password)
  - `Enter Exam` (room code + roll direct entry)
- Role mismatch handling exists in login flow.

### Student

- Dashboard shows active exams and result history.
- Join exam by room code + student name.
- Waiting room uses auto status polling.
- Exam view supports:
  - one-by-one or all-at-once mode
  - randomization indicator
  - coding run/reset workflow
- Block/freeze overlay and force-submit overlay are supported.
- Result details show per-question marks/comments.

### Teacher

- Exams list and Manage Exam workflow.
- Question manager for MCQ/written/coding.
- Live room with participant controls:
  - freeze/unfreeze
  - force submit
- Live violation summary in participant list.
- Evaluation desk with manual scoring for written/coding.
- Proctoring monitor view with events and snapshots.

### Admin

- Stats panel
- Teacher creation
- Student creation
- CSV student upload
- Activate/deactivate users

## 3. API Integration Contract

Frontend uses `apiRequest` from `renderer/src/api.js` with JWT token where required.

Critical routes currently used:

- Auth: `/auth/login`, `/auth/me`
- Exams:
  - `/exams`
  - `/exams/join`
  - `/exams/join-by-room`
  - `/exams/:id/status`
  - `/exams/:id/submit`
  - `/exams/:id/run-code`
  - `/exams/:id/violations`
  - `/exams/my-active`
  - `/exams/my-results`
  - `/exams/my-results/:submissionId`
- Teacher evaluation:
  - `/exams/:examId/evaluation/participants`
  - `/exams/:examId/evaluation/submissions/:submissionId`
  - `/exams/:examId/evaluation/submissions/:submissionId/score`
- Admin: `/admin/*`
- Proctoring: `/proctoring/*`

## 4. Electron Bridge Usage

Only use APIs exposed from `preload.js`:

- `window.electronAPI.startExam(examData)`
- `window.electronAPI.submitExam(payload)`
- `window.electronAPI.onViolation(callback)`
- `window.electronAPI.onForceSubmit(callback)`
- `window.electronAPI.setUserData(user)`

Do not use Node/Electron modules directly inside React components.

## 5. Change Safety Rules

1. Preserve API field names exactly as backend expects.
2. Keep role-based route/UI protections in place.
3. Do not remove freeze/force-submit visual feedback states.
4. Keep result details compatible with manual-evaluation fields:
   - `awarded_marks`
   - `evaluation_comment`
5. If adding fields to forms, update both:
   - create flow
   - edit flow
6. For exam mode changes, coordinate with `main.js` and `preload.js`.

## 6. Recommended Frontend Validation Checklist

Before merge:

1. Teacher can create exam and open manage view.
2. Student join and waiting room transition works.
3. One-by-one flow locks `Next` until answer provided.
4. Coding run and reset works.
5. Freeze/unfreeze and force-submit UX works.
6. Evaluation save updates totals.
7. Student result detail renders marks/comments.
