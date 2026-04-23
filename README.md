# Invigilo - Secure Exam Desktop Application

Invigilo is an Electron + React + Node.js desktop platform for controlled university exams.
It supports Admin, Teacher, and Student workflows with desktop lockdown, live participant control,
question randomization, coding exams, and proctoring telemetry.

## Current Highlights

- Role-based access: Admin, Teacher, Student.
- Login by email/password, and student direct entry by room code + roll number.
- Teacher exam controls:
  - Question flow mode: `all_at_once` or `one_by_one`.
  - Randomize question order per student (deterministic).
  - Webcam requirement toggle.
  - Live room controls: freeze/unfreeze student, force submit student.
- Student exam experience:
  - Waiting room with automatic status polling.
  - Coding editor (Monaco) with run support for JavaScript, Python, and C++.
  - My Results summary and per-question detailed result view.
- Evaluation flow:
  - Auto scoring for MCQ.
  - Manual scoring/comments for written and coding questions.
- Desktop security:
  - Kiosk/fullscreen lock in exam mode.
  - Always-on-top enforcement.
  - Focus refocus loop.
  - Shortcut/process violation logging pipeline.
- Webcam proctoring:
  - Student event and snapshot reporting.
  - Teacher monitoring dashboard.

## Architecture

- Desktop container: Electron (`main.js`, `preload.js`)
- Renderer: React + Vite (`renderer/src`)
- Backend API: Express (`backend/server.js`)
- Database: PostgreSQL (`backend/models/schema.js`)

## Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL 13+
- For coding run support:
  - Node.js (already required)
  - Python (python/python3/py)
  - C++ compiler (g++ or clang++)

## Quick Start

1. Clone and install dependencies:

```bash
git clone https://github.com/Nafiz001/secure-exam-desktop-app.git
cd secure-exam-desktop-app
npm install
```

2. Configure backend environment:

```bash
copy backend\.env.example backend\.env
```

Then edit `backend/.env` with your database and JWT values.

3. Start app (builds renderer, launches Electron, auto-starts backend process):

```bash
npm start
```

4. Verify backend health:

```bash
curl http://localhost:5000/api/health
```

## Running Components Separately

- Backend only:

```bash
cd backend
npm start
```

- Backend dev mode:

```bash
cd backend
npm run dev
```

- Renderer dev server (UI only):

```bash
npm run dev:renderer
```

- Build renderer:

```bash
npm run build:renderer
```

- Package Windows build:

```bash
npm run pack:win
```

## Default Account and User Setup

- On first backend startup, schema initialization seeds:
  - Email: `admin@kuet.ac.bd`
  - Password: `admin1234`
- You can reset admin from `backend`:

```bash
node reset-admin.js
```

- Create teacher/student accounts from the Admin dashboard.

## Exam Lifecycle

`created -> waiting -> in_progress -> completed`

- Student join moves exam to `waiting` when first participant joins.
- Teacher starts exam to move all joined participants to `taking`.
- Submission or timeout completes participant attempt.

## Feature Matrix

| Area | Admin | Teacher | Student |
|---|---|---|---|
| Authentication | Yes | Yes | Yes |
| User management | Yes | No | No |
| Create/manage exams | No | Yes | No |
| Join by room code | No | No | Yes |
| Live participant monitoring | No | Yes | No |
| Freeze/unfreeze participant | No | Yes | No |
| Force submit participant | No | Yes | No |
| Proctoring dashboard | No | Yes | Camera/event source |
| Take exam | No | No | Yes |
| My results + detailed breakdown | No | No | Yes |
| Manual evaluation | No | Yes | No |

## API Groups (High Level)

- `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST/PUT` admin routes under `/api/admin/*`
- Exam routes under `/api/exams/*` for CRUD, join, start, submit, violations, evaluation, results
- Proctoring routes under `/api/proctoring/*`
- AI teacher assistant routes under `/api/ai/*`

See [backend/README.md](backend/README.md) for endpoint details.

## Security Notes

Implemented controls significantly improve exam discipline, but no desktop app can guarantee
absolute prevention against privileged OS-level bypasses.

Invigilo uses layered controls:

- Electron exam mode hard lock (fullscreen, kiosk, topmost, focus enforcement)
- Violation capture and reporting to backend
- Teacher-side intervention controls (freeze, force submit)
- Proctoring signal ingestion and monitoring

## Project Structure

```text
secure-exam-desktop-app/
  backend/
    config/
    controllers/
    middleware/
    migrations/
    models/
    routes/
    server.js
  renderer/
    src/
      components/
      features/
      pages/
  main.js
  preload.js
  README.md
```

## Documentation Index

- [backend/README.md](backend/README.md) - backend setup and API map
- [TEST_INTEGRATION.md](TEST_INTEGRATION.md) - integration test checklist
- [TEACHER_DASHBOARD_GUIDE.md](TEACHER_DASHBOARD_GUIDE.md) - teacher workflow guide
- [DEWAN_GUIDE.md](DEWAN_GUIDE.md) - backend/electron engineering handoff
- [NAFIZ_GUIDE.md](NAFIZ_GUIDE.md) - frontend engineering handoff
- [WEBCAM_PROCTORING_ROADMAP.md](WEBCAM_PROCTORING_ROADMAP.md) - proctoring status and roadmap
- [systemreport/systemreport.md](systemreport/systemreport.md) - academic system report

## Troubleshooting

- App opens but backend API calls fail:
  - Check `backend/.env` values and PostgreSQL connectivity.
  - Verify `http://localhost:5000/api/health`.
- Coding run fails for Python/C++:
  - Ensure Python and compiler are installed and available in PATH.
- Student cannot login by roll:
  - Roll login is student-only and requires active account status.
- Teacher cannot delete exam:
  - Only exam owner can delete their exam.

## License

This repository is an academic project. Use and distribution follow project-owner policy.
