# Backend and Electron Handoff Guide (Dewan Scope)

This guide captures the current backend + Electron ownership layer and operational checks.

## 1. Ownership Areas

Primary files:

- `main.js` (Electron main process lockdown and violation pipeline)
- `preload.js` (IPC bridge contracts)
- `backend/server.js` (API bootstrap)
- `backend/controllers/*.js`
- `backend/routes/*.js`
- `backend/models/schema.js`
- `backend/middleware/auth.js`

## 2. Current Security and Lockdown Flow

During exam mode (`start-exam` IPC):

1. Electron enables hard fullscreen + kiosk + always-on-top.
2. Focus enforcement loop runs every 500ms.
3. Shortcut and devtools blocking is active.
4. Blur/fullscreen exit/window move/resize attempts generate violations.
5. Forbidden process scan runs every 1s.
6. Violations are sent to renderer through `violation` IPC channel.
7. Renderer forwards live violations to backend:
   - `POST /api/exams/:id/violations`

On submit (`submit-exam` IPC):

1. Exam mode is disabled cleanly.
2. Session log JSON is written to user Documents.
3. Violation payload is returned to renderer for backend submission.

## 3. Backend Core Behavior

- Schema auto-initialization and additive migration on startup.
- Role and ownership checks for protected actions.
- Exam lifecycle synchronization with timeout-based completion updates.
- Participant state controls:
  - `force_submit_requested`
  - `is_frozen`
  - live violation metadata columns
- Scoring model:
  - auto score (MCQ) + manual score (written/coding)
- Student result summary and detailed breakdown endpoints implemented.

## 4. Critical API Contracts

High-risk contracts to keep stable:

1. Submission answer format (snake_case):
   - `question_id`
   - `selected_answer`
   - `written_answer`
   - `language`
2. Live participant controls:
   - `POST /api/exams/:id/participants/:participantId/force-submit`
   - `POST /api/exams/:id/participants/:participantId/toggle-freeze`
3. Evaluation routes:
   - `GET /api/exams/:examId/evaluation/submissions/:submissionId`
   - `PUT /api/exams/:examId/evaluation/submissions/:submissionId/score`
4. Student results:
   - `GET /api/exams/my-results`
   - `GET /api/exams/my-results/:submissionId`

## 5. Runtime Dependencies for Code Execution

`run-code` requires host tools:

- JavaScript: `node`
- Python: `python`/`python3`/`py -3`
- C++: `g++` or `clang++`

If missing, backend returns stderr-like execution error text while keeping API success shape.

## 6. Safe Change Rules

1. Do not weaken ownership checks on exam resources.
2. Keep additive DB migrations backward-safe.
3. Preserve IPC event names used by renderer:
   - `start-exam`
   - `submit-exam`
   - `violation`
   - `force-submit`
4. Keep exam mode disable path reliable to avoid lock persistence.
5. Keep evaluation scoring backward-compatible with existing submissions.

## 7. Quick Operational Checklist

Before release:

1. Start backend and verify `/api/health`.
2. Verify schema init logs no migration errors.
3. Run full teacher-student scenario:
   - create -> join -> start -> submit -> evaluate
4. Verify freeze and force-submit behavior.
5. Verify violation ingestion updates `exam_participants`.
6. Verify student result details endpoint returns answer-level marks/comments.
