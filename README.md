# Invigilo - Secure Exam Desktop Application

A secure desktop application for conducting online exams with real-time monitoring, room code management, and automated proctoring features.

---

## 🚀 Features

### Authentication & Authorization
- JWT-based authentication system
- Role-based access control (Admin, Teacher, Student)
- Secure password hashing with bcrypt
- Session management with 24-hour token expiration

### Room Code Exam System
- **Unique Room Codes:** Auto-generated 6-character alphanumeric codes for each exam
- **Real-time Waiting Room:** Students join exams via room code and wait for teacher to start
- **Live Participant Tracking:** Teachers see joined students with 3-second polling updates
- **Exam Status Management:** Created → Waiting → In Progress → Completed lifecycle
- **Live Timer:** MM:SS countdown with automatic submission at time end

### Exam Management
- Create exams with multiple-choice questions
- Set exam duration and passing marks
- Assign exams to specific classes
- View exam submissions and scores
- Room code generation and distribution

### Student Features
- Join exams using room codes
- Take exams with live timer
- View questions with multiple choice options
- Auto-submit on timer expiration
- See scores immediately after submission

### Teacher Features
- Create and manage exams
- Share room codes with students
- View joined participants in real-time
- Start exams when ready
- Monitor exam status and submissions

### Security Features (Planned)
- Screen activity monitoring
- Browser restrictions during exam
- Violation detection and logging
- Automatic exam submission on violations

---

## 🛠️ Tech Stack

### Frontend
- **Electron.js** - Desktop application framework
- **HTML/CSS** - UI structure and styling
- **Tailwind CSS** - Utility-first CSS framework
- **JavaScript** - Client-side logic

### Backend
- **Node.js** - Server runtime
- **Express.js** - Web framework
- **PostgreSQL** - Primary database (Supabase)
- **JWT** - Authentication tokens
- **bcrypt** - Password hashing

---

## 📦 Installation

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Git

### Clone Repository
```bash
git clone https://github.com/Nafiz001/secure-exam-desktop-app.git
cd secure-exam-desktop-app
```

### Backend Setup

1. Navigate to backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   # Create .env file with:
   DATABASE_URL=postgresql://user:password@host:port/database
   JWT_SECRET=your-secret-key
   PORT=5000
   ```

4. Run database migration:
   ```bash
   node migrations/add_room_code.js
   ```

5. Start backend server:
   ```bash
   npm start
   ```

### Frontend (Electron) Setup

1. Navigate to root directory:
   ```bash
   cd ..
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start Electron app:
   ```bash
   npm start
   ```

---

## 🧪 Testing

### Test Accounts

Use these pre-configured accounts for testing:

**Admin Account:**
- Email: `dewan.admin@kuet.ac.bd`
- Password: `admin123`

**Teacher Account:**
- Email: `dewan.teacher@kuet.ac.bd`
- Password: `teacher123`

**Student Account:**
- Email: `dewan.student@kuet.ac.bd`
- Password: `student123`

### Test Workflow

1. **Login as Teacher:**
   - Create a new exam
   - Note the auto-generated room code (e.g., GCL5JL)
   - Wait for students to join
   
2. **Login as Student (different window/device):**
   - Enter room code on dashboard
   - Click "Join Exam"
   - Wait in waiting room
   
3. **Start Exam (Teacher):**
   - View joined students list
   - Click "Start Exam" button
   
4. **Take Exam (Student):**
   - Auto-redirected to exam screen
   - Timer starts counting down
   - Answer questions
   - Submit before timer ends or wait for auto-submit

---

## 📁 Project Structure

```
secure-exam-desktop-app/
├── backend/
│   ├── controllers/         # Business logic
│   │   ├── authController.js
│   │   ├── examController.js
│   │   └── submissionController.js
│   ├── middleware/          # Express middleware
│   │   └── auth.js
│   ├── models/              # Database schemas
│   │   └── schema.js
│   ├── routes/              # API routes
│   │   ├── auth.js
│   │   ├── exams.js
│   │   └── submissions.js
│   ├── migrations/          # Database migrations
│   │   └── add_room_code.js
│   ├── config/
│   │   └── db.js           # Database connection
│   ├── server.js           # Express app entry
│   └── package.json
├── main.js                  # Electron main process
├── preload.js              # Electron preload script
├── renderer/               # React frontend (Vite)
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       └── pages/LoginPage.jsx
├── package.json            # Electron app config
└── README.md
```

---

## 🔌 API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication

#### Register User
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

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepass123"
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

### Room Code System

#### Join Exam (Student)
```http
POST /api/exams/join
Content-Type: application/json
Authorization: Bearer <token>

{
  "roomCode": "GCL5JL"
}
```

#### Get Exam Participants (Teacher)
```http
GET /api/exams/:examId/participants
Authorization: Bearer <token>
```

#### Start Exam (Teacher)
```http
POST /api/exams/:examId/start
Authorization: Bearer <token>
```

#### Get Exam Status
```http
GET /api/exams/:examId/status
Authorization: Bearer <token>
```

#### Get My Active Exams (Student)
```http
GET /api/exams/my-active
Authorization: Bearer <token>
```

### Exam Management

#### Create Exam (Teacher)
```http
POST /api/exams
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Midterm Exam",
  "description": "CSE 101 Midterm",
  "duration_minutes": 60,
  "passing_marks": 40,
  "class_id": 1
}
```

#### Add Question (Teacher)
```http
POST /api/exams/:examId/questions
Authorization: Bearer <token>
Content-Type: application/json

{
  "question_text": "What is 2+2?",
  "options": ["3", "4", "5", "6"],
  "correct_option": 1,
  "marks": 5
}
```

#### Get Exam with Questions (Student)
```http
GET /api/exams/:examId
Authorization: Bearer <token>
```

#### Submit Exam (Student)
```http
POST /api/exams/:examId/submit
Authorization: Bearer <token>
Content-Type: application/json

{
  "answers": [
    { "question_id": 1, "selected_option": 1 },
    { "question_id": 2, "selected_option": 2 }
  ]
}
```

---

## 🎯 Room Code System Workflow

### Exam Lifecycle

```
1. CREATED
   ↓ (Teacher creates exam)
   ↓ (System generates room code)
   
2. WAITING
   ↓ (Students join via room code)
   ↓ (Teacher sees participant list)
   
3. IN_PROGRESS
   ↓ (Teacher clicks "Start Exam")
   ↓ (Timer starts for all students)
   
4. COMPLETED
   ↓ (All students submit OR timer expires)
```

### Teacher Actions
1. Create exam → Get room code
2. Share room code with students
3. Monitor joined students (live updates)
4. Start exam when ready
5. View submissions

### Student Actions
1. Login → See dashboard
2. Enter room code → Join exam
3. Wait in waiting room
4. Exam starts → Take exam
5. Submit before timer ends

---

## 🔒 Database Schema

### Users Table
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Exams Table
```sql
CREATE TABLE exams (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  passing_marks INTEGER NOT NULL,
  class_id INTEGER,
  created_by INTEGER REFERENCES users(id),
  room_code VARCHAR(10) UNIQUE,
  status VARCHAR(20) DEFAULT 'created',
  started_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Exam Participants Table
```sql
CREATE TABLE exam_participants (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'waiting'
);
```

---

## 🚧 Development Status

### ✅ Completed
- [x] Backend authentication system
- [x] JWT token management
- [x] Room code generation and validation
- [x] Exam creation and management
- [x] Student join exam via room code
- [x] Waiting room with live updates
- [x] Teacher start exam functionality
- [x] Live countdown timer
- [x] Auto-submit at timer end
- [x] Exam submission and scoring
- [x] Frontend UI for all flows

### 🚧 In Progress
- [ ] Screen monitoring system
- [ ] Violation detection
- [ ] Admin panel for user management
- [ ] Exam analytics and reports

### 📝 Planned
- [ ] Advanced proctoring features
- [ ] Video recording during exam
- [ ] Browser lockdown mode
- [ ] Bulk student import
- [ ] Excel/CSV export for results

---

## 👥 Team

- **Dewan** - Backend Development
- **Nafiz** - Frontend Development

---

## 📄 License

This project is proprietary and confidential.

---

## 🤝 Contributing

This is a private academic project. For questions or issues, contact the development team.

---

## 📞 Support

For technical support or questions:
- Create an issue in the repository
- Contact the development team directly

---

**Last Updated:** January 2025  
**Version:** 1.0.0 (Room Code System)
