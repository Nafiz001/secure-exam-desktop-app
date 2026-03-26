# Teacher Dashboard Implementation Guide

## Overview
This guide covers the new exam management APIs for the teacher dashboard. Teachers can create exams, add questions, view submissions, and students can join and submit exams.

---

## Backend APIs (Completed by Dewan)

### Exam Management APIs

#### 1. Create Exam
**Endpoint:** `POST /api/exams`  
**Authorization:** Teacher only  
**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "title": "Midterm Exam - Data Structures",
  "description": "Covers topics: Arrays, Linked Lists, Stacks, Queues",
  "duration": 60
}
```

**Response:**
```json
{
  "success": true,
  "message": "Exam created successfully",
  "data": {
    "exam": {
      "id": 1,
      "title": "Midterm Exam - Data Structures",
      "description": "Covers topics: Arrays, Linked Lists, Stacks, Queues",
      "duration": 60,
      "created_by": 2,
      "created_at": "2024-01-15T10:00:00.000Z"
    }
  }
}
```

---

#### 2. Get All Exams
**Endpoint:** `GET /api/exams`  
**Authorization:** Required (Teacher or Student)  
**Headers:** `Authorization: Bearer <token>`

**Behavior:**
- **Teachers:** Get only their own exams with question count
- **Students:** Get all available exams with question count

**Response:**
```json
{
  "success": true,
  "data": {
    "exams": [
      {
        "id": 1,
        "title": "Midterm Exam - Data Structures",
        "description": "Covers topics: Arrays, Linked Lists, Stacks, Queues",
        "duration": 60,
        "created_by": 2,
        "teacher_name": "Dr. John Smith",
        "question_count": 10,
        "created_at": "2024-01-15T10:00:00.000Z"
      }
    ]
  }
}
```

---

#### 3. Get Single Exam with Questions
**Endpoint:** `GET /api/exams/:id`  
**Authorization:** Required  
**Headers:** `Authorization: Bearer <token>`

**Behavior:**
- **Teachers/Admins:** See questions with correct answers
- **Students:** See questions WITHOUT correct answers

**Response (Teacher view):**
```json
{
  "success": true,
  "data": {
    "exam": {
      "id": 1,
      "title": "Midterm Exam - Data Structures",
      "duration": 60,
      "teacher_name": "Dr. John Smith",
      "questions": [
        {
          "id": 1,
          "exam_id": 1,
          "question_text": "What is the time complexity of inserting at the head of a linked list?",
          "options": ["O(1)", "O(n)", "O(log n)", "O(n^2)"],
          "correct_answer": 0,
          "marks": 2
        }
      ]
    }
  }
}
```

**Response (Student view - no correct_answer):**
```json
{
  "success": true,
  "data": {
    "exam": {
      "id": 1,
      "title": "Midterm Exam - Data Structures",
      "duration": 60,
      "teacher_name": "Dr. John Smith",
      "questions": [
        {
          "id": 1,
          "exam_id": 1,
          "question_text": "What is the time complexity of inserting at the head of a linked list?",
          "options": ["O(1)", "O(n)", "O(log n)", "O(n^2)"],
          "marks": 2
        }
      ]
    }
  }
}
```

---

#### 4. Update Exam
**Endpoint:** `PUT /api/exams/:id`  
**Authorization:** Teacher only (own exams)  
**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "title": "Updated Exam Title",
  "description": "Updated description",
  "duration": 90
}
```

---

#### 5. Delete Exam
**Endpoint:** `DELETE /api/exams/:id`  
**Authorization:** Teacher only (own exams)  
**Headers:** `Authorization: Bearer <token>`

---

### Question Management APIs

#### 1. Add Question to Exam
**Endpoint:** `POST /api/exams/:examId/questions`  
**Authorization:** Teacher only (own exams)  
**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "question_text": "What is the time complexity of binary search?",
  "options": ["O(1)", "O(log n)", "O(n)", "O(n^2)"],
  "correct_answer": 1,
  "marks": 2
}
```

**Response:**
```json
{
  "success": true,
  "message": "Question added successfully",
  "data": {
    "question": {
      "id": 5,
      "exam_id": 1,
      "question_text": "What is the time complexity of binary search?",
      "options": ["O(1)", "O(log n)", "O(n)", "O(n^2)"],
      "correct_answer": 1,
      "marks": 2,
      "created_at": "2024-01-15T11:00:00.000Z"
    }
  }
}
```

---

#### 2. Update Question
**Endpoint:** `PUT /api/exams/questions/:id`  
**Authorization:** Teacher only (own exams)  
**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "question_text": "Updated question text?",
  "marks": 3
}
```

---

#### 3. Delete Question
**Endpoint:** `DELETE /api/exams/questions/:id`  
**Authorization:** Teacher only (own exams)  
**Headers:** `Authorization: Bearer <token>`

---

### Submission APIs

#### 1. Submit Exam (Student)
**Endpoint:** `POST /api/exams/:id/submit`  
**Authorization:** Student only  
**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "answers": [
    {
      "questionId": 1,
      "selectedAnswer": 0
    },
    {
      "questionId": 2,
      "selectedAnswer": 2
    }
  ],
  "violations": [
    {
      "type": "WINDOW_BLUR",
      "severity": "medium",
      "timestamp": "2024-01-15T11:30:00.000Z"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Exam submitted successfully",
  "data": {
    "submission": {
      "id": 1,
      "exam_id": 1,
      "student_id": 5,
      "score": 8,
      "submitted_at": "2024-01-15T12:00:00.000Z"
    }
  }
}
```

---

#### 2. Get Exam Submissions (Teacher)
**Endpoint:** `GET /api/exams/:examId/submissions`  
**Authorization:** Teacher only (own exams)  
**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "submissions": [
      {
        "id": 1,
        "exam_id": 1,
        "student_id": 5,
        "student_name": "Alice Johnson",
        "student_email": "alice@kuet.ac.bd",
        "score": 8,
        "answers": [...],
        "violations": [...],
        "submitted_at": "2024-01-15T12:00:00.000Z"
      }
    ]
  }
}
```

---

## Frontend Implementation Tasks (Nafiz)

### 1. Teacher Dashboard Page
Create a new teacher dashboard view with:
- List of all exams created by the teacher
- Button to create new exam
- Each exam card shows:
  - Title, description, duration
  - Question count
  - Edit/Delete buttons
  - "View Submissions" button

**Example UI Code:**
```javascript
async function loadTeacherExams() {
  const token = localStorage.getItem('token');
  
  const response = await fetch('http://localhost:5000/api/exams', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const result = await response.json();
  
  if (result.success) {
    displayExams(result.data.exams);
  }
}

function displayExams(exams) {
  const container = document.getElementById('exams-container');
  container.innerHTML = exams.map(exam => `
    <div class="exam-card">
      <h3>${exam.title}</h3>
      <p>${exam.description}</p>
      <p>Duration: ${exam.duration} minutes</p>
      <p>Questions: ${exam.question_count}</p>
      <button onclick="editExam(${exam.id})">Edit</button>
      <button onclick="deleteExam(${exam.id})">Delete</button>
      <button onclick="viewSubmissions(${exam.id})">View Submissions</button>
    </div>
  `).join('');
}
```

---

### 2. Create Exam Form
Add a form for teachers to create exams:

```javascript
async function createExam(event) {
  event.preventDefault();
  
  const token = localStorage.getItem('token');
  const formData = {
    title: document.getElementById('exam-title').value,
    description: document.getElementById('exam-description').value,
    duration: parseInt(document.getElementById('exam-duration').value)
  };
  
  const response = await fetch('http://localhost:5000/api/exams', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(formData)
  });
  
  const result = await response.json();
  
  if (result.success) {
    alert('Exam created successfully!');
    loadTeacherExams(); // Reload exam list
  } else {
    alert('Error: ' + result.message);
  }
}
```

---

### 3. Add Questions to Exam
Create a page to add/edit questions for an exam:

```javascript
async function addQuestion(examId) {
  const token = localStorage.getItem('token');
  const questionData = {
    question_text: document.getElementById('question-text').value,
    options: [
      document.getElementById('option1').value,
      document.getElementById('option2').value,
      document.getElementById('option3').value,
      document.getElementById('option4').value
    ],
    correct_answer: parseInt(document.getElementById('correct-answer').value),
    marks: parseInt(document.getElementById('marks').value)
  };
  
  const response = await fetch(`http://localhost:5000/api/exams/${examId}/questions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(questionData)
  });
  
  const result = await response.json();
  
  if (result.success) {
    alert('Question added successfully!');
    loadExamQuestions(examId); // Reload questions
  }
}
```

---

### 4. Student Exam Taking Page
Create a page where students can:
1. Browse available exams
2. Click "Start Exam" button
3. Enter secure exam mode
4. Answer questions
5. Submit exam with violations

**Start Exam:**
```javascript
async function startExam(examId) {
  const token = localStorage.getItem('token');
  
  // Fetch exam details with questions
  const response = await fetch(`http://localhost:5000/api/exams/${examId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const result = await response.json();
  
  if (result.success) {
    const examData = result.data.exam;
    
    // Start secure exam mode in Electron
    window.electronAPI.startExam(examData);
    
    // Display questions
    displayExamQuestions(examData.questions);
  }
}
```

**Submit Exam:**
```javascript
async function submitExam(examId, answers) {
  const token = localStorage.getItem('token');
  
  // Get violations from main process
  const violationData = await window.electronAPI.submitExam({
    examId,
    answers
  });
  
  // Submit to backend
  const response = await fetch(`http://localhost:5000/api/exams/${examId}/submit`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      answers,
      violations: violationData.violations
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    alert(`Exam submitted! Your score: ${result.data.submission.score}`);
  }
}
```

---

### 5. View Submissions (Teacher)
Create a page to show all submissions for an exam:

```javascript
async function viewSubmissions(examId) {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`http://localhost:5000/api/exams/${examId}/submissions`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const result = await response.json();
  
  if (result.success) {
    displaySubmissions(result.data.submissions);
  }
}

function displaySubmissions(submissions) {
  const container = document.getElementById('submissions-container');
  container.innerHTML = submissions.map(sub => `
    <div class="submission-card">
      <h4>${sub.student_name}</h4>
      <p>Email: ${sub.student_email}</p>
      <p>Score: ${sub.score}</p>
      <p>Violations: ${sub.violations.length}</p>
      <p>Submitted: ${new Date(sub.submitted_at).toLocaleString()}</p>
      <button onclick="viewDetails(${sub.id})">View Details</button>
    </div>
  `).join('');
}
```

---

## Updated Electron Integration

### preload.js (Updated)
```javascript
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onViolation: (callback) => ipcRenderer.on("violation", callback),
  onForceSubmit: (callback) => ipcRenderer.on("force-submit", callback),
  startExam: (examData) => ipcRenderer.send("start-exam", examData),
  submitExam: (submissionData) => ipcRenderer.invoke("submit-exam", submissionData),
  setUserData: (userData) => ipcRenderer.send("set-user-data", userData)
});
```

### main.js (Updated)
- `startExam` now accepts exam data parameter
- `submitExam` now returns violation data to renderer
- Violations are logged and returned with submission

---

## Testing Guide

### Test Teacher Flow:
1. Login as teacher: `dewan.teacher@kuet.ac.bd` / `teacher123`
2. Create a new exam
3. Add 5 questions to the exam
4. View the exam list
5. View submissions (should be empty initially)

### Test Student Flow:
1. Login as student: `dewan.student@kuet.ac.bd` / `student123`
2. Browse available exams
3. Click "Start Exam" on an exam
4. Answer questions in secure mode
5. Submit exam
6. Check score

### Test with PowerShell:
```powershell
# Create exam as teacher
$token = "your_teacher_token_here"
$body = @{
  title = "Test Exam"
  description = "Testing exam creation"
  duration = 30
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/exams" `
  -Method POST `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body $body

# Add question
$examId = 1  # Use the ID from previous response
$questionBody = @{
  question_text = "What is 2+2?"
  options = @("3", "4", "5", "6")
  correct_answer = 1
  marks = 2
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/exams/$examId/questions" `
  -Method POST `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body $questionBody
```

---

## Summary

### Backend (Dewan) - ✅ Completed
- Exam CRUD APIs
- Question management APIs
- Submission API with automatic scoring
- Submission viewing for teachers
- Role-based authorization
- Updated main.js for violation tracking
- Updated preload.js for exam submission

### Frontend (Nafiz) - 📋 To Do
- Teacher dashboard page
- Create exam form
- Add/edit questions interface
- Student exam browser
- Exam taking interface with secure mode
- Submission results view
- Teacher submission viewer with violation details

---

## Next Steps
1. Nafiz implements teacher dashboard UI
2. Nafiz implements exam creation and question management UI
3. Nafiz implements student exam taking flow
4. Test end-to-end flow
5. Add admin panel (future enhancement)
