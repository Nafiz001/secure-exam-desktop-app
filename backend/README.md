# Invigilo Backend API

Backend server for Invigilo Secure Exam Desktop System.

## Tech Stack
- Node.js + Express.js
- PostgreSQL
- JWT Authentication
- bcrypt Password Hashing

## Setup Instructions

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment Variables
Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

Edit `.env` and set your database credentials and JWT secret.

### 3. Setup PostgreSQL Database
Create a database named `invigilo_db`:
```sql
CREATE DATABASE invigilo_db;
```

The schema will be automatically initialized on first run.

### 4. Run the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

Server will run on `http://localhost:5000`

## API Endpoints

### Authentication

#### Register User
```
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword",
  "role": "student"
}
```

#### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword"
}
```

#### Get Current User
```
GET /api/auth/me
Authorization: Bearer <token>
```

### Health Check
```
GET /api/health
```

## Database Schema

### Users
- id (SERIAL PRIMARY KEY)
- name (VARCHAR)
- email (VARCHAR UNIQUE)
- password_hash (VARCHAR)
- role (VARCHAR: student | teacher | admin)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

### Exams
- id (SERIAL PRIMARY KEY)
- title (VARCHAR)
- description (TEXT)
- duration (INTEGER)
- created_by (INTEGER FK → users.id)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

### Questions
- id (SERIAL PRIMARY KEY)
- exam_id (INTEGER FK → exams.id)
- question_text (TEXT)
- options (JSONB)
- correct_answer (VARCHAR)
- marks (INTEGER)
- created_at (TIMESTAMP)

### Submissions
- id (SERIAL PRIMARY KEY)
- exam_id (INTEGER FK → exams.id)
- student_id (INTEGER FK → users.id)
- answers (JSONB)
- violations (JSONB)
- submitted_at (TIMESTAMP)
- score (INTEGER)

## Security Features
- Password hashing with bcrypt
- JWT-based authentication
- Role-based authorization middleware
- Input validation
- SQL injection prevention (parameterized queries)

## Project Structure
```
backend/
├── config/
│   └── database.js          # PostgreSQL connection pool
├── controllers/
│   └── authController.js    # Authentication logic
├── middleware/
│   └── auth.js              # JWT verification & role authorization
├── models/
│   └── schema.js            # Database schema initialization
├── routes/
│   └── auth.js              # Authentication routes
├── .env.example             # Environment variables template
├── .gitignore
├── package.json
├── README.md
└── server.js                # Entry point
```

## Author
Dewan - Backend & System Engineer
