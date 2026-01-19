# Nafiz's Integration Guide - UI to Backend

**Status:** Backend authentication APIs are ready  
**Your task:** Connect the login UI to backend and implement role-based routing

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
