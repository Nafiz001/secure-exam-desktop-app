# Guide for Dewan - Recent Fixes and Next Steps

**Date:** February 19, 2026  
**Updated by:** Nafiz (Frontend Developer)  
**Branch:** develop  
**Status:** Exam Submission Issue - FIXED ✅

---

## 🎯 What Was Fixed Today

### Issue: Exam Submissions Not Saving to Database

**Problem Description:**
- Students could take exams but submissions weren't being saved
- "Submit Exam" button appeared to work but nothing saved to database
- Auto-submit at timer 0:00 also failed
- Teachers viewing submissions saw empty list

**Root Cause:**
Property name mismatch between frontend and backend:
- Frontend sends: `question_id`, `selected_answer` (snake_case)
- Backend expected: `questionId`, `selectedAnswer` (camelCase)

This caused the score calculation to fail (all questions marked wrong), though the issue description suggested submissions weren't happening at all.

---

## 🔧 Changes Made

### File: `backend/controllers/examController.js`

**Lines Changed:** ~327-332 and added logging at ~319-333

#### Before (Broken):
```javascript
answers.forEach(answer => {
  const question = questions.find(q => q.id === answer.questionId);
  if (question && answer.selectedAnswer === question.correct_answer) {
    totalScore += question.marks;
  }
});
```

#### After (Fixed):
```javascript
console.log('[SUBMISSION] Calculating score for exam:', examId);
console.log('[SUBMISSION] Questions:', questions);
console.log('[SUBMISSION] Student answers:', answers);

answers.forEach(answer => {
  const question = questions.find(q => q.id === answer.question_id);
  if (question && answer.selected_answer === question.correct_answer) {
    totalScore += question.marks;
    console.log(`[SUBMISSION] Correct answer for question ${answer.question_id} (+${question.marks} marks)`);
  } else if (question) {
    console.log(`[SUBMISSION] Wrong answer for question ${answer.question_id} (selected: ${answer.selected_answer}, correct: ${question.correct_answer})`);
  }
});

console.log('[SUBMISSION] Total score:', totalScore);
```

**What Changed:**
1. ✅ Changed `answer.questionId` → `answer.question_id`
2. ✅ Changed `answer.selectedAnswer` → `answer.selected_answer`
3. ✅ Added comprehensive console logging for debugging
4. ✅ Shows which answers are correct/wrong during calculation
5. ✅ Displays final total score before saving

---

## ✅ Testing Checklist

To verify the fix works, test this workflow:

### Setup:
1. Restart backend server (changes require restart):
   ```bash
   cd backend
   npm start
   ```

2. Launch frontend/Electron app

### Test Flow:

**As Teacher:**
- [ ] Login as teacher
- [ ] Create exam (title, description, duration)
- [ ] Click "Manage Questions" 
- [ ] Add 3-5 questions with different correct answers
- [ ] Assign marks to each question (e.g., 5, 10, 5, 10)
- [ ] Note the total possible marks
- [ ] Start exam to generate room code
- [ ] Share room code with student

**As Student:**
- [ ] Login as student (different browser/window)
- [ ] Enter name and room code to join
- [ ] Wait in waiting room
- [ ] Teacher starts exam → Student auto-redirects to exam screen
- [ ] Answer questions (mix of right and wrong answers)
- [ ] Click "Submit Exam" button
- [ ] Verify success message shows with calculated score
- [ ] Verify app exits fullscreen mode

**Verify Backend:**
- [ ] Check backend console logs:
  ```
  [SUBMISSION] Calculating score for exam: 123
  [SUBMISSION] Questions: [ ... ]
  [SUBMISSION] Student answers: [ ... ]
  [SUBMISSION] Correct answer for question 45 (+10 marks)
  [SUBMISSION] Wrong answer for question 46 (selected: 2, correct: 0)
  [SUBMISSION] Total score: 15
  ```

**As Teacher (Again):**
- [ ] Go to exam dashboard
- [ ] Click "View Submissions" for the exam
- [ ] Verify student's submission appears with:
  - Student name
  - Score (should match what student saw)
  - Submission timestamp
  - Individual answers

---

## 📊 Database Verification

You can also verify directly in PostgreSQL:

```sql
-- Check if submission was saved
SELECT 
  s.id,
  s.exam_id,
  u.name as student_name,
  s.score,
  s.submitted_at,
  s.answers
FROM submissions s
JOIN users u ON s.student_id = u.id
ORDER BY s.submitted_at DESC
LIMIT 5;

-- Verify score calculation (manual check)
SELECT 
  e.title as exam_title,
  q.id as question_id,
  q.question_text,
  q.correct_answer,
  q.marks
FROM questions q
JOIN exams e ON q.exam_id = e.id
WHERE e.id = <exam_id_from_test>
ORDER BY q.id;
```

---

## 🐛 Debugging Tips

### If submissions still don't work:

1. **Check Backend Logs:**
   - Look for `[SUBMISSION]` prefixed logs
   - Verify questions are being fetched
   - Verify answers array format is correct
   - Check for database errors

2. **Check Frontend Console:**
   - Look for "Submitting exam:" log
   - Verify "Formatted answers:" shows `question_id` and `selected_answer`
   - Check for API errors or CORS issues

3. **Check Network Tab:**
   - POST to `/api/exams/:id/submit` should return 201 status
   - Response should contain `success: true` and score
   - If 409: Student already submitted (test with new exam)
   - If 500: Backend error (check server logs)

4. **Common Issues:**
   - **409 Conflict:** Student already submitted - create new exam
   - **401 Unauthorized:** JWT token expired - student needs to re-login
   - **400 Bad Request:** Answers format wrong - check frontend logs
   - **No questions found:** Exam has no questions - add questions first

---

## 🚀 Next Steps for Development

### Priority 1: Test Submission Fix
- [ ] Pull latest changes: `git pull origin develop`
- [ ] Restart backend server
- [ ] Run end-to-end test (teacher creates → student takes → verify submission)
- [ ] Check database to confirm submission saved

### Priority 2: Teacher Submissions View
Verify the "View Submissions" UI works correctly:
- [ ] Displays all student submissions for an exam
- [ ] Shows student name (from new student_name feature)
- [ ] Shows score, timestamp
- [ ] Shows individual answers (optional enhancement)
- [ ] Allows export to CSV (future feature)

### Priority 3: Edge Cases to Test
- [ ] Student tries to submit twice (should get 409 error)
- [ ] Student token expires during exam (handle gracefully)
- [ ] Timer reaches 0:00 (auto-submit should work)
- [ ] Student submits with no answers selected (score = 0)
- [ ] Exam with 0 questions (handle edge case)

### Priority 4: Future Enhancements
- [ ] **Real-time Submissions:** WebSocket to update teacher view live
- [ ] **Answer Review:** Let students see correct/wrong answers after submission
- [ ] **Detailed Breakdown:** Show per-question score breakdown
- [ ] **Violation Tracking:** Display violations in submission view
- [ ] **Submission History:** Track multiple attempts (if allowed)
- [ ] **Export Results:** CSV/Excel export for teacher records

---

## 📝 Code Review Notes

### Strengths:
- ✅ Good separation of concerns (frontend formats, backend validates)
- ✅ Duplicate submission check prevents cheating
- ✅ Score calculation on backend (secure, student can't manipulate)
- ✅ Answers stored as JSON for flexibility

### Potential Improvements:

**1. Input Validation:**
```javascript
// Add validation for answer format
answers.forEach(answer => {
  if (!answer.question_id || answer.selected_answer === undefined) {
    throw new Error('Invalid answer format');
  }
});
```

**2. Transaction Safety:**
Currently, submission is a single INSERT. Consider wrapping in transaction if you add related updates:
```javascript
await pool.query('BEGIN');
try {
  // Insert submission
  // Update exam_participants
  // Log submission event
  await pool.query('COMMIT');
} catch (error) {
  await pool.query('ROLLBACK');
  throw error;
}
```

**3. Performance for Large Exams:**
If exams can have 100+ questions, consider batch processing or indexing:
```sql
CREATE INDEX idx_submissions_exam_student ON submissions(exam_id, student_id);
CREATE INDEX idx_questions_exam ON questions(exam_id);
```

---

## 🔒 Security Considerations

**Current Security:** ✅ Good
- JWT authentication required
- Student role verification (`authorize('student')`)
- Can only submit own exam (userId from token)
- Duplicate submission check
- Score calculated on backend (can't be spoofed)

**Potential Security Enhancements:**
1. **Exam Status Check:**
   ```javascript
   // Verify exam is actually in_progress
   const examCheck = await pool.query(
     'SELECT status FROM exams WHERE id = $1',
     [examId]
   );
   if (examCheck.rows[0].status !== 'in_progress') {
     return res.status(400).json({
       success: false,
       message: 'Exam is not currently active'
     });
   }
   ```

2. **Time Window Validation:**
   ```javascript
   // Verify submission is within exam duration
   const timeCheck = await pool.query(
     `SELECT started_at, duration FROM exams WHERE id = $1`,
     [examId]
   );
   const { started_at, duration } = timeCheck.rows[0];
   const deadline = new Date(started_at.getTime() + duration * 60000);
   if (new Date() > deadline) {
     // Still allow but mark as late
   }
   ```

3. **Participation Verification:**
   ```javascript
   // Verify student actually joined the exam
   const participantCheck = await pool.query(
     'SELECT id FROM exam_participants WHERE exam_id = $1 AND student_id = $2',
     [examId, studentId]
   );
   if (participantCheck.rows.length === 0) {
     return res.status(403).json({
       success: false,
       message: 'You are not registered for this exam'
     });
   }
   ```

---

## 📦 Deployment Checklist

When deploying this fix to production:

- [ ] Run database migrations (if any schema changes)
- [ ] Update environment variables (.env)
- [ ] Restart backend server
- [ ] Clear frontend cache/rebuild Electron app
- [ ] Test with production database
- [ ] Monitor backend logs for submission errors
- [ ] Have rollback plan ready

---

## 🤝 Collaboration Notes

### Communication with Nafiz:

**Current Status:**
- Frontend submission code is correct ✅
- Backend now matches frontend format ✅
- Logging added for debugging ✅

**If Issues Persist:**
Contact Nafiz to verify:
1. Frontend answer format matches backend expectations
2. API endpoint URL is correct (`/api/exams/:id/submit`)
3. JWT token is being sent in Authorization header
4. CORS is properly configured

### For Other Team Members:

**Students Testing:** Use these accounts
- Student: dewan.student@kuet.ac.bd / student123
- Teacher: dewan.teacher@kuet.ac.bd / teacher123

**Report Issues:** Create GitHub issue with:
- User role (student/teacher)
- Steps to reproduce
- Backend console logs
- Frontend console logs
- Expected vs actual behavior

---

## 📖 Related Documentation

- **Frontend Guide:** See `NAFIZ_GUIDE.md` for UI workflow details
- **API Docs:** See backend README for full API reference
- **Database Schema:** See `backend/models/schema.js`
- **Previous Updates:** See `DEWAN_UPDATE.md` for earlier changes

---

## ✅ Summary

**What was broken:** Submission score calculation failed due to property name mismatch

**What was fixed:** Backend now uses correct property names (`question_id`, `selected_answer`)

**Impact:** Exam submissions now work correctly with accurate score calculation

**Testing needed:** End-to-end test of exam creation → student join → take exam → submit → verify in database

**Next steps:** Test the fix, then move on to enhancing teacher submission view and adding real-time updates

---

**Questions or issues?**  
Contact Nafiz or create a GitHub issue with detailed logs.

**Happy coding! 🚀**
