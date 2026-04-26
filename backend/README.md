# Invigilo Backend API

Express + PostgreSQL backend for the Invigilo secure exam desktop application.

## Stack

- Node.js (CommonJS)
- Express
- PostgreSQL (`pg`)
- JWT authentication
- bcrypt password hashing
- Optional AI provider: Groq (`groq-sdk`)

## Setup

1. Install dependencies:

```bash
cd backend
npm install
```

2. Create environment file:

```bash
copy .env.example .env
```

3. Edit `.env`:

| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | Backend HTTP port (default `5000`) |
| `NODE_ENV` | Yes | `development` or `production` |
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_PORT` | Yes | PostgreSQL port |
| `DB_NAME` | Yes | Database name |
| `DB_USER` | Yes | Database user |
| `DB_PASSWORD` | Yes | Database password |
| `JWT_SECRET` | Yes | Token signing secret |
| `JWT_EXPIRES_IN` | Yes | Token TTL (example: `24h`) |
| `GROQ_API_KEY` | Optional | Required only for `/api/ai/*` endpoints |

4. Start server:

```bash
npm start
```

Development mode:

```bash
npm run dev
```

## Database Initialization

On startup, `models/schema.js`:

- Creates core tables if missing.
- Applies safe additive migrations (`ALTER TABLE ... IF NOT EXISTS`).
- Creates indexes.
- Seeds a default admin if missing:
  - `admin@kuet.ac.bd` / `admin1234`

## Utility Scripts

- Reset default admin account:

```bash
node reset-admin.js
```

- Legacy sample account script (optional):

```bash
node create-users.js
```

## API Route Map

### Health

| Method | Route | Access |
|---|---|---|
| GET | `/api/health` | Public |

### Auth

| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Authenticated |

`/api/auth/login` supports:
- Email + password (all roles)
- Roll number + password (student role)

### Admin

| Method | Route | Access |
|---|---|---|
| GET | `/api/admin/stats` | Admin |
| GET | `/api/admin/users?role=student|teacher` | Admin |
| POST | `/api/admin/create-teacher` | Admin |
| POST | `/api/admin/create-student` | Admin |
| POST | `/api/admin/upload-students` | Admin |
| PUT | `/api/admin/users/:id/status` | Admin |

### Exams

| Method | Route | Access |
|---|---|---|
| POST | `/api/exams` | Teacher |
| GET | `/api/exams` | Authenticated |
| GET | `/api/exams/my-active` | Student |
| GET | `/api/exams/my-results` | Student |
| GET | `/api/exams/my-results/:submissionId` | Student |
| GET | `/api/exams/:id` | Authenticated |
| PUT | `/api/exams/:id` | Teacher (owner) |
| DELETE | `/api/exams/:id` | Teacher (owner) |
| POST | `/api/exams/join-by-room` | Public (student direct entry) |
| POST | `/api/exams/join` | Student |
| GET | `/api/exams/:id/participants` | Teacher (owner) |
| POST | `/api/exams/:id/participants/:participantId/force-submit` | Teacher (owner) |
| POST | `/api/exams/:id/participants/:participantId/toggle-freeze` | Teacher (owner) |
| POST | `/api/exams/:id/start` | Teacher (owner) |
| GET | `/api/exams/:id/status` | Teacher/Student with access |
| POST | `/api/exams/:examId/questions` | Teacher (owner) |
| PUT | `/api/exams/questions/:id` | Teacher (owner) |
| DELETE | `/api/exams/questions/:id` | Teacher (owner) |
| POST | `/api/exams/:id/submit` | Student |
| POST | `/api/exams/:id/run-code` | Student |
| POST | `/api/exams/:id/violations` | Student |
| GET | `/api/exams/:examId/submissions` | Teacher (owner) |
| GET | `/api/exams/:examId/evaluation/participants` | Teacher (owner) |
| GET | `/api/exams/:examId/evaluation/submissions/:submissionId` | Teacher (owner) |
| PUT | `/api/exams/:examId/evaluation/submissions/:submissionId/score` | Teacher (owner) |

### Proctoring

| Method | Route | Access |
|---|---|---|
| POST | `/api/proctoring/:examId/event` | Student |
| POST | `/api/proctoring/:examId/snapshot` | Student |
| GET | `/api/proctoring/:examId/students` | Teacher |
| GET | `/api/proctoring/:examId/events/:studentId` | Teacher |

### AI (Teacher Assistant)

| Method | Route | Access |
|---|---|---|
| POST | `/api/ai/chat` | Teacher |
| POST | `/api/ai/generate-questions` | Teacher |

## Core Data Model (Current)

- `users`: account profile, role, status, optional roll number.
- `exams`: metadata, room code, status, webcam setting, flow mode, randomization flag.
- `questions`: mcq/written/coding question bank.
- `submissions`: answers, violations, auto/manual/total score, evaluation status.
- `exam_participants`: waiting/taking/completed state, live violation summary, freeze/force-submit flags.
- `proctoring_events`: event log from student camera pipeline.
- `proctoring_snapshots`: latest student snapshot/status per exam.

## Scoring and Evaluation Logic

- MCQ: auto-scored on submission.
- Written/Coding: marked as manual-evaluation items.
- Teacher updates manual marks/comments through evaluation endpoints.
- Final score = `auto_score + manual_score`.

## Code Execution Notes

`POST /api/exams/:id/run-code` supports:

- JavaScript (`node`)
- Python (`python`, `python3`, or `py -3`)
- C++ (`g++` or `clang++`)

Execution is timeout-bounded and performed in temporary directories.

## Security Notes

- JWT middleware enforces authenticated access.
- Role checks run at route level.
- Ownership checks enforce teacher resource boundaries.
- Query parameters use parameterized SQL.
- Student accounts can be activated/deactivated by admin.
