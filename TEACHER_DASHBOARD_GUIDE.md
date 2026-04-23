# Teacher Dashboard Guide (Current)

This guide explains the current Teacher workflow and the related API contracts.

## 1. Main Views

Teacher dashboard includes:

1. Exams List
2. Manage Exam
3. Question Manager
4. Evaluation Desk
5. Proctoring View

## 2. Exams List

Purpose:
- View all exams created by the teacher.
- Open an exam in `Manage Exam`.
- Create a new exam.

Key actions:
- `Create New Exam`
- `Manage Exam`
- Refresh exam list

## 3. Manage Exam

Purpose:
- Configure exam details and control the live room.

Editable fields:
- Title
- Description
- Exam type (`lab_quiz` or `lab_test`)
- Duration
- Question presentation:
  - `all_at_once`
  - `one_by_one`
- Randomize question order (per student deterministic shuffle)
- Require webcam proctoring

Live room panel:
- Room code display and copy
- Participant list with join time and status
- Start Exam
- Participant controls:
  - Freeze/Unfreeze
  - Force Submit
- Live violation indicators:
  - `violation_count`
  - latest violation severity/type/time

## 4. Question Manager

Purpose:
- Add, edit, and delete questions for the selected exam.

Supported types:
- MCQ
- Written
- Coding

Note:
- For `lab_test`, question type is constrained to coding in current UI flow.

Coding question fields:
- Question text
- Sample input
- Sample output
- Starter code
- Reference answer (teacher-side)
- Marks

## 5. Evaluation Desk

Purpose:
- Evaluate submissions after student attempts.

Flow:
1. Open participant submission list.
2. Select `Open Answer Sheet`.
3. Review all answers and violations.
4. For written/coding items, enter:
   - awarded marks
   - evaluation comment
5. Click `Save Evaluation`.

Scoring model:
- MCQ auto-scored on submit.
- Written/coding are manual.
- Final score = auto score + manual score.

## 6. Proctoring View

Purpose:
- Monitor webcam proctoring signals during exam.

Available data:
- Student proctoring status (`ok`, `warning`, `violation`)
- Face count and latest snapshot metadata
- Event history per student

## 7. Teacher API Map

| Action | Method | Route |
|---|---|---|
| Create exam | POST | `/api/exams` |
| List own exams | GET | `/api/exams` |
| Update exam | PUT | `/api/exams/:id` |
| Delete exam | DELETE | `/api/exams/:id` |
| Add question | POST | `/api/exams/:examId/questions` |
| Update question | PUT | `/api/exams/questions/:id` |
| Delete question | DELETE | `/api/exams/questions/:id` |
| Get participants | GET | `/api/exams/:id/participants` |
| Start exam | POST | `/api/exams/:id/start` |
| Toggle freeze | POST | `/api/exams/:id/participants/:participantId/toggle-freeze` |
| Force submit | POST | `/api/exams/:id/participants/:participantId/force-submit` |
| Evaluation participants | GET | `/api/exams/:examId/evaluation/participants` |
| Answer sheet | GET | `/api/exams/:examId/evaluation/submissions/:submissionId` |
| Save evaluation | PUT | `/api/exams/:examId/evaluation/submissions/:submissionId/score` |
| Proctoring students | GET | `/api/proctoring/:examId/students` |
| Proctoring events | GET | `/api/proctoring/:examId/events/:studentId` |
| AI chat | POST | `/api/ai/chat` |
| AI question generation | POST | `/api/ai/generate-questions` |

## 8. Common Issues

- Cannot start exam:
  - At least one participant must have joined.
- Cannot delete exam:
  - Only exam owner can delete.
- Participant control fails:
  - Ensure current exam is selected and teacher token is valid.
- Evaluation not updating:
  - Verify `Save Evaluation` request response and submission ownership.
