# Nafiz's Integration Guide - UI to Backend

**Status:** Room Code System + Student Name Feature Complete  
**Latest Update:** February 19, 2026 - Exam Submission Issue FIXED ✅  
**Your task:** Pull latest changes, restart backend, test submission flow

---

## 🎉 LATEST FIX (February 19, 2026)

### ✅ Exam Submission Issue - RESOLVED

**Problem:** 
- Students clicking "Submit Exam" → Submission not saving to database
- Auto-submit at timer 0:00 → Also failing
- Teachers seeing empty submissions list

**Root Cause:**
Property name mismatch between frontend and backend:
- Frontend sends: `question_id`, `selected_answer` (snake_case)
- Backend expected: `questionId`, `selectedAnswer` (camelCase)

**Solution:**
Fixed `backend/controllers/examController.js` to use correct property names:
```javascript
// Changed from answer.questionId to answer.question_id
// Changed from answer.selectedAnswer to answer.selected_answer
```

**Status:** ✅ FIXED - Backend code updated with detailed logging

**Next Steps:**
1. Pull latest changes: `git pull origin develop`
2. Restart backend: `cd backend && npm start`
3. Test full submission flow (create exam → student takes → submit → verify)
4. See detailed testing guide in `DEWAN_GUIDE.md`

---

## 🆕 PREVIOUS UPDATES (February 5, 2026)

### What Was Done Today

✅ **Student Name Input Feature:**
- Students now enter their name before joining exam
- Name is stored in database and displayed to teachers
- Replaces "undefined" issue in participant list

✅ **UI Fixes:**
- Fixed "Create Exam" button not working (input focus issue)
- Fixed form inputs not accepting text after screen transitions
- Auto-focus with proper timing on form fields

✅ **Fullscreen Exit Fix:**
- App now properly exits fullscreen mode after exam submission
- Window returns to normal state automatically

✅ **Database Changes:**
- New `student_name` column in `exam_participants` table
- Migration script created: `add_student_name_to_participants.js`

### What You Need to Do Now

1. **Pull Latest Changes:**
   ```bash
   git pull origin develop
   ```

2. **Run New Migration:**
   ```bash
   cd backend
   node migrations/add_student_name_to_participants.js
   ```
   
   This adds `student_name` column to `exam_participants` table.

3. **Test the Changes:**
   - **Test 1:** Login as teacher, create exam (verify form inputs work)
   - **Test 2:** Login as student, enter name + room code to join
   - **Test 3:** Verify teacher sees student name in waiting list
   - **Test 4:** Start exam and verify fullscreen exits after submission
   - **Test 5:** Verify submission saves to database with correct score ✅ FIXED

4. **Previous Issue (NOW FIXED):**
   ✅ **Exam submissions working properly as of February 19, 2026:**
   - Student clicks "Submit Exam" → Now properly saves to database
   - Timer reaches 0:00 (auto-submit) → Now works correctly
   - Teacher's "View Submissions" now shows all submissions
   - Score calculation fixed (property name mismatch resolved)

---

## 🚨 IMPORTANT - Previous Updates

### Critical Steps (Do These First!)

1. **Run Database Migrations (in order):**
   ```bash
   cd backend
   node migrations/add_room_code.js
   node migrations/add_student_name_to_participants.js
   ```

2. **Test Accounts Available:**
   - **Teacher:** dewan.teacher@kuet.ac.bd / teacher123
   - **Student:** dewan.student@kuet.ac.bd / student123
   - **Admin:** dewan.admin@kuet.ac.bd / admin123

3. **Breaking Change:**
   - Student UI now shows dashboard first (join exam screen)
   - Students must enter name before joining
   - Direct exam screen moved to after successful join

---

## 🎯 Room Code Exam System

### Workflow Overview

**Teacher Flow:**
1. Teacher creates exam → System generates unique 6-character room code (e.g., GCL5JL)
2. Teacher sees "Room Code" card with copy button in dashboard
3. Teacher shares code with students
4. Teacher views list of joined students (live updates every 3 seconds) with their names
5. Teacher clicks "Start Exam" button when ready
6. Exam status changes to `in_progress` and timer starts

**Student Flow:**
1. Student logs in → Sees "Join Exam" dashboard
2. Student enters **name** and room code → Clicks "Join Exam"
3. Student enters waiting room showing: room code, participant count, status
4. When teacher starts exam → Student auto-redirects to exam screen (fullscreen mode)
5. Timer starts counting down (MM:SS format)
6. Student answers questions and submits OR auto-submits at 0:00
7. App exits fullscreen mode automatically
8. Student sees score after submission

### API Endpoints (Updated)

```http
# Join exam with room code (NOW REQUIRES NAME)
POST /api/exams/join
Content-Type: application/json
Authorization: Bearer <token>
{
  "roomCode": "GCL5JL",
  "studentName": "John Doe"
}

# Get exam participants (teacher only) - NOW RETURNS STUDENT NAMES
GET /api/exams/:examId/participants
Authorization: Bearer <token>

# Start exam (teacher only)
POST /api/exams/:examId/start
Authorization: Bearer <token>

# Get exam status (real-time polling)
GET /api/exams/:examId/status
Authorization: Bearer <token>

# Get my active exams (student only)
GET /api/exams/my-active
Authorization: Bearer <token>
```

### Frontend Changes Made

**New Components:**
- Student dashboard with **name input** and room code input form
- Waiting room screen with live participant count
- Teacher room code display card
- Teacher waiting students list (live updates) showing **student names**
- Complete exam taking interface
- Live countdown timer with auto-submit
- Questions display with radio button answers
- **Automatic fullscreen exit** after submission

**Technical Details:**
- Polling intervals: 3 seconds for participants and status
- Room codes: 6 characters (excludes confusing chars: 0/O, 1/I/L)
- Timer format: MM:SS countdown
- Auto-submit: Triggers without confirmation when timer reaches 0:00
- Manual submit: Shows confirmation prompt
- **Student name:** Required field, stored in exam_participants table

---

## ✅ Recently Fixed: Exam Submission Issue (February 19, 2026)

### Problem (RESOLVED)
Exam submissions were not being saved to the database properly.

**Symptoms:**
- Student clicks "Submit Exam" button → Appeared to submit but didn't save
- When timer reaches 0:00 → Auto-submit alert showed but submission failed
- Teacher's "View Submissions" panel showed no submissions

**Root Cause:**
Property name mismatch in `backend/controllers/examController.js`:
- Frontend sends: `question_id`, `selected_answer` (snake_case)
- Backend expected: `questionId`, `selectedAnswer` (camelCase)

**Fix Applied:**
Updated backend to use correct property names:
```javascript
// Line ~327 in examController.js
const question = questions.find(q => q.id === answer.question_id);
if (question && answer.selected_answer === question.correct_answer) {
  totalScore += question.marks;
}
```

**Status:** ✅ FIXED - See `DEWAN_GUIDE.md` for detailed testing instructions

**To Use the Fix:**
1. Pull latest code: `git pull origin develop`
2. Restart backend: `cd backend && npm start`
3. Test submission flow to verify

---

## 📋 What Dewan Completed

✅ Backend Express.js server  
✅ PostgreSQL database schema (users, exams, questions, submissions)  
✅ Authentication APIs (register, login, getCurrentUser)  
✅ JWT token generation and verification  
✅ Role-based authorization middleware  
✅ Password hashing with bcrypt

---

## 🚀 Getting Started

### Step 1: Pull Latest Code

```bash
git checkout develop
git pull origin develop
git merge feature/day-backend-auth-setup
# Or wait for Dewan to merge the PR, then:
git pull origin develop
```

### Step 2: Setup Backend Locally

#### Option A: Use Shared Database (Recommended - Wait for Dewan)
Dewan will share Supabase credentials with you. Skip PostgreSQL installation.

#### Option B: Setup Local PostgreSQL
1. Install PostgreSQL: https://www.postgresql.org/download/windows/
2. Create database:
   ```sql
   CREATE DATABASE invigilo_db;
   ```
3. Configure `.env` file:
   ```bash
   cd backend
   copy .env.example .env
   # Edit .env and set your PostgreSQL password
   ```

### Step 3: Install Dependencies & Test

```bash
cd backend
npm install
npm start
```

You should see:
```
✅ Connected to PostgreSQL database
╔════════════════════════════════════════╗
║   Invigilo Backend API Server          ║
║   Status: Running                      ║
║   Port: 5000                           ║
╚════════════════════════════════════════╝
```

### Step 4: Test APIs

```bash
# Health check
curl http://localhost:5000/api/health

# Register test user
curl -X POST http://localhost:5000/api/auth/register -H "Content-Type: application/json" -d "{\"name\":\"Nafiz\",\"email\":\"nafiz@test.com\",\"password\":\"test123\",\"role\":\"student\"}"

# Login
curl -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"nafiz@test.com\",\"password\":\"test123\"}"
```

---

## 📡 Backend API Reference

### Base URL
```
http://localhost:5000/api
```

### Authentication Endpoints

#### 1. Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepass123",
  "role": "student"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "role": "student"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 2. Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepass123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "role": "student"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 3. Get Current User (Protected)
```http
GET /api/auth/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "role": "student",
      "created_at": "2026-01-20T10:30:00.000Z"
    }
  }
}
```

---

## 🎨 Your Tasks (Nafiz)

### Task 1: Update Login Form to Call Backend API

**File:** `index.html` (Login screen)

**Current:** Login form does nothing  
**Target:** Call `/api/auth/login` on form submit

**Example Implementation:**

```html
<script>
// Add to existing script section
async function handleLogin(event) {
  event.preventDefault();
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (data.success) {
      // Store token and user info
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('user', JSON.stringify(data.data.user));
      
      // Start exam or show dashboard based on role
      startExam();
    } else {
      alert('Login failed: ' + data.message);
    }
  } catch (error) {
    alert('Connection error. Is backend running?');
  }
}

// Attach to login form
document.getElementById('loginForm').addEventListener('submit', handleLogin);
</script>
```

### Task 2: Implement Role-Based UI Routing

After successful login, route users based on their role:

```javascript
function routeBasedOnRole(user) {
  switch(user.role) {
    case 'student':
      startExam(); // Existing function
      break;
    case 'teacher':
      showTeacherDashboard(); // TODO: Create this
      break;
    case 'admin':
      showAdminPanel(); // TODO: Create this
      break;
  }
}
```

### Task 3: Add Loading & Error States

Show user-friendly messages:
- Loading spinner during API call
- Error message if backend is offline
- Invalid credentials message
- Network error handling

### Task 4: Token Management

Store JWT token for future API calls:
```javascript
// Store on login
localStorage.setItem('token', token);

// Use in future API calls
const response = await fetch('http://localhost:5000/api/exams', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
});

// Clear on logout
localStorage.removeItem('token');
localStorage.removeItem('user');
```

### Task 5: Environment Configuration

Support local and production URLs:
```javascript
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5000/api'
  : 'https://your-production-url.com/api';
```

---

## 🔌 IPC Communication (Optional Enhancement)

If you need to pass user data to `main.js`:

**In preload.js:**
```javascript
contextBridge.exposeInMainWorld("electronAPI", {
  // Existing
  onViolation: (callback) => ipcRenderer.on("violation", callback),
  onForceSubmit: (callback) => ipcRenderer.on("force-submit", callback),
  startExam: () => ipcRenderer.send("start-exam"),
  
  // New: Pass user data to main process
  setUserData: (userData) => ipcRenderer.send("set-user-data", userData)
});
```

**In main.js:**
```javascript
ipcMain.on("set-user-data", (event, userData) => {
  console.log("User logged in:", userData);
  // Store user data for session logging
});
```

---

## 🐛 Troubleshooting

### Backend not running
```bash
cd backend
npm start
```

### CORS errors
Already configured in backend. Make sure you're using `http://localhost:5000`

### "fetch is not defined"
`fetch` is available in modern browsers. Use in renderer process (index.html), not in main.js.

### Token expired
Tokens expire after 24 hours. Handle 401 errors and redirect to login:
```javascript
if (response.status === 401) {
  alert('Session expired. Please login again.');
  // Redirect to login
}
```

---

## 📂 File Structure Reference

```
secure-exam-desktop-app/
├── main.js              # Dewan's - Don't modify
├── preload.js           # Shared - Coordinate if changes needed
├── index.html           # Nafiz's - Update login form
├── backend/             # Dewan's - Already done
│   ├── server.js
│   ├── routes/auth.js
│   └── controllers/authController.js
```

---

## ✅ Acceptance Criteria

Before marking your task complete:

- [ ] Login form calls `/api/auth/login`
- [ ] Token stored in `localStorage`
- [ ] User redirected to exam screen on success
- [ ] Error messages displayed on failure
- [ ] Loading state shown during API call
- [ ] Works with backend running on `localhost:5000`
- [ ] No console errors
- [ ] Tested with different user roles

---

## 🤝 Coordination with Dewan

**Need from Dewan:**
- [ ] Supabase database credentials (if using shared DB)
- [ ] Exam APIs (when you're ready to fetch exam data)
- [ ] Submission API (when implementing "Submit Exam" button)

**Questions?**  
Ask in project group chat or coordinate with Dewan for backend-related issues.

---

## 🎯 Next Steps After This

1. **Exam List API:** Fetch available exams for student
2. **Exam Data API:** Fetch questions for selected exam
3. **Submit Exam API:** Send answers + violations to backend
4. **Teacher Dashboard:** Create/view exams (future)
5. **Admin Panel:** Manage users (future)

---

**Good luck, Nafiz! 🚀**
