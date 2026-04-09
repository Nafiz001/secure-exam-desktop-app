# Webcam Proctoring — Full Implementation Roadmap

---

## Pre-built Models

**Recommended: `face-api.js`** (or maintained fork `@vladmandic/face-api`)
- Runs entirely in the browser/Electron renderer — no server-side ML needed
- Detects: face presence, face count, facial landmarks, head orientation estimate
- Model weights are ~6MB total, bundled with the app
- Handles all core use cases out of the box

**For head pose (looking away detection): `@tensorflow-models/face-landmarks-detection`** with MediaPipe backend
- Gives 3D landmark positions, from which yaw/pitch angles can be calculated
- Heavier (~15MB) but very accurate

**Recommendation**: Start with `face-api.js` alone — it covers 80% of what you need.

---

## What Violations to Detect

| Event | Detection Method |
|---|---|
| No face in frame | `detectAllFaces()` returns empty array |
| Multiple faces | `detectAllFaces()` returns 2+ results |
| Looking sideways | Nose X position vs face bounding box center (landmark-based) |
| Face too small / far away | Bounding box area below threshold |
| Tab switch / screen leave | Electron `blur` event on `BrowserWindow` |

---

## Architecture Overview

```
Teacher sets webcam_required=true on exam
         ↓
Student starts exam → app checks webcam_required
         ↓
Camera permission requested → stream starts
         ↓
face-api.js runs detection loop every 2–3 sec
         ↓
Violations → POST /api/proctoring/:examId/event  (student side)
Snapshots  → POST /api/proctoring/:examId/snapshot (base64, every 8 sec)
         ↓
Teacher panel polls GET /api/proctoring/:examId/students
Shows colored status badge per student + click to see snapshot
```

---

## Phase 1 — Database Schema

```sql
-- Add to exams table
ALTER TABLE exams ADD COLUMN webcam_required BOOLEAN DEFAULT FALSE;

-- Proctoring events log
CREATE TABLE proctoring_events (
  id SERIAL PRIMARY KEY,
  exam_id INT REFERENCES exams(id),
  student_id INT REFERENCES users(id),
  event_type VARCHAR(50),   -- 'no_face', 'multiple_faces', 'looking_away'
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Latest webcam snapshot per student (upsert on student+exam)
CREATE TABLE proctoring_snapshots (
  exam_id INT,
  student_id INT,
  snapshot_base64 TEXT,
  face_count INT,
  status VARCHAR(20),       -- 'ok', 'warning', 'violation'
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (exam_id, student_id)
);
```

---

## Phase 2 — Backend API Endpoints

Add a new file `backend/routes/proctoring.js`:

| Method | Route | Who | Purpose |
|---|---|---|---|
| POST | `/api/proctoring/:examId/event` | Student | Report a violation event |
| POST | `/api/proctoring/:examId/snapshot` | Student | Upload webcam snapshot + status |
| GET | `/api/proctoring/:examId/students` | Teacher | Get all students' current status + latest snapshot |
| GET | `/api/proctoring/:examId/events/:studentId` | Teacher | Get full event log for a student |

Also extend `PUT /api/exams/:id` to accept `webcam_required`.

---

## Phase 3 — Teacher UI Changes

**In Exam Creation/Edit form:**
- Add toggle: "Require webcam for this exam" → saves `webcam_required`

**In Exam Management panel — new "Proctoring" tab (alongside Questions/Evaluation):**
- Table of participants: Name | Status | Face Count | Last seen | Actions
- Status badge: green (ok), yellow (warning/looking away), red (violation/no face)
- Click row → modal with:
  - Latest webcam snapshot image
  - Timeline of violation events

Teacher view polls `/api/proctoring/:examId/students` every 10 seconds.

---

## Phase 4 — Student UI Changes

**On exam start (in `renderer/src/features/student/StudentDashboard.jsx`):**

```
if (exam.webcam_required) {
  1. Call getUserMedia({ video: true })
  2. If denied → show error: "Camera required. Cannot start exam."
  3. If granted → show small camera preview (bottom-right corner, 160x120px)
  4. Load face-api.js models
  5. Start detection loop (setInterval every 2500ms)
}
```

**Detection loop logic:**
```javascript
const detections = await faceapi.detectAllFaces(videoEl, new faceapi.TinyFaceDetectorOptions());

if (detections.length === 0)           // → report "no_face"
else if (detections.length > 1)        // → report "multiple_faces"
else if (headTurnedAway(detections[0])) // → report "looking_away"
else                                   // → status = "ok"

// Send snapshot every 8 seconds regardless
sendSnapshot(videoEl, status, detections.length);
```

**Head turn heuristic (no extra model needed):**
- Get face landmarks for the detected face
- Compare nose tip X to face bounding box center X
- If `|noseTipX - faceCenterX| / faceWidth > 0.25` → looking away

**Snapshot sending:**
- Draw video frame to `<canvas>`, get `canvas.toDataURL("image/jpeg", 0.5)` (compressed)
- POST to backend every 8 seconds

---

## Phase 5 — Packaging Model Files

`face-api.js` model weights must be available at runtime. Place in:

```
renderer/public/models/
  tiny_face_detector_model-weights_manifest.json
  tiny_face_detector_model-shard1
  face_landmark_68_tiny_model-weights_manifest.json
  face_landmark_68_tiny_model-shard1
```

Download from the `face-api.js` GitHub repo's `weights/` folder. These ship inside the app via Electron's `renderer/dist`.

Load in code with:
```javascript
await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
await faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models');
```

---

## Phase 6 — Electron Camera Permissions

In `main.js`, allow camera access:
```javascript
session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
  if (permission === 'media') callback(true);
  else callback(false);
});
```

---

## Implementation Order

| # | Task | Effort |
|---|---|---|
| 1 | DB migration + `webcam_required` in exam form | 0.5 day |
| 2 | Backend proctoring routes (event + snapshot POST, students GET) | 1 day |
| 3 | Student camera access + preview UI | 1 day |
| 4 | face-api.js integration + detection loop | 1.5 days |
| 5 | Student → backend event/snapshot reporting | 0.5 day |
| 6 | Teacher proctoring tab with status badges | 1 day |
| 7 | Teacher snapshot modal + event log | 1 day |

**Total: ~6.5 days of focused work**

---

## Libraries to Install

```bash
# In renderer (Vite/React side)
npm install face-api.js

# No backend ML libraries needed — all detection runs client-side in Electron renderer
```

---

## Key Design Decision: No WebRTC

Live P2P streaming via WebRTC is complex to set up in Electron (requires STUN/TURN servers). The **snapshot polling approach** (student pushes JPEG every 8 seconds, teacher polls every 10 seconds) gives near-live visibility with ~10s latency — sufficient for proctoring and requires zero extra infrastructure.

---

## Upgrade Suggestions (Post-Implementation)

These are improvements you can layer on top of the current implementation, ordered roughly from easiest to hardest.

---

### 1. Switch Detection Engine to MediaPipe (Easy)

**Current:** `@vladmandic/face-api` with `TinyFaceDetector` — ~2.5s polling interval needed.

**Upgrade:** `@mediapipe/face_detection` — Google's optimized pipeline, ~3x faster, runs at near real-time (30fps capable).

**How:**
```bash
npm install @mediapipe/face_detection @mediapipe/camera_utils
```
Replace `faceapi.detectAllFaces(...)` calls in `ProctoringCamera.jsx` with the MediaPipe `FaceDetection` API. The landmark-based look-away heuristic stays the same.

**Why upgrade:** Reduces detection latency from 2500ms polling to near-continuous, catching brief cheating attempts that the current interval might miss.

---

### 2. Accurate Head Pose via 3D Landmarks (Medium)

**Current:** Nose-tip X offset heuristic — approximate, can false-positive on people with asymmetric faces.

**Upgrade:** `@tensorflow-models/face-landmarks-detection` with MediaPipe backend gives 468 3D facial landmarks, from which true yaw/pitch/roll angles can be computed via solvePnP.

**How:**
```bash
npm install @tensorflow/tfjs-core @tensorflow/tfjs-backend-webgl @tensorflow-models/face-landmarks-detection
```

Compute angles from key landmark positions (nose bridge, eye corners, chin) and threshold on yaw angle > 25° for looking away.

**Why upgrade:** Eliminates false positives, catches vertical head tilts (looking down at phone), and gives numeric angle data for the event log.

---

### 3. Phone / Object Detection (Medium)

**Current:** Only detects faces — misses a student holding a phone under the desk or using a physical cheat sheet.

**Upgrade:** Add COCO-SSD (`@tensorflow-models/coco-ssd`) running in parallel with face detection. If a `cell phone` or `book` class is detected with confidence > 0.6, fire a `foreign_object` event.

**How:**
```bash
npm install @tensorflow-models/coco-ssd @tensorflow/tfjs
```

Run detection on a lower-resolution canvas (160×120) every 5s to keep CPU usage low. Add `foreign_object` as a new allowed `event_type` in `proctoringController.js`.

**Why upgrade:** Covers physical cheating aids that face detection cannot see.

---

### 4. Store Snapshots as Files, Not Base64 in DB (Medium)

**Current:** Snapshots are stored as base64 TEXT in the `proctoring_snapshots` table — fine for small numbers of students but the column can grow to several MB per student.

**Upgrade:** Save the JPEG to disk (or an S3-compatible bucket like Supabase Storage) and store only a URL in the DB column.

**Backend change in `proctoringController.js`:**
```javascript
// Write buffer to disk
const filename = `${examId}_${studentId}_${Date.now()}.jpg`;
const buffer = Buffer.from(snapshot_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
fs.writeFileSync(path.join(SNAPSHOT_DIR, filename), buffer);
// Store only the path
await pool.query('... SET snapshot_url = $3 ...', [examId, studentId, `/snapshots/${filename}`]);
```

Serve the folder via `express.static`. Teacher panel `<img src>` points to the URL instead of inline base64.

**Why upgrade:** Keeps DB rows small, enables efficient bulk export of exam session footage.

---

### 5. Real-Time Teacher Alerts via WebSocket (Medium)

**Current:** Teacher panel polls every 10 seconds — up to 10s delay before a violation appears.

**Upgrade:** Add Socket.io so the student's violation event is pushed instantly to the teacher.

**How:**
```bash
cd backend && npm install socket.io
```

In `server.js`, attach Socket.io to the HTTP server. In `proctoringController.js → reportEvent`, emit `io.to(examId).emit('violation', { studentId, eventType })` after the DB insert. Teacher panel connects via `socket.on('violation', ...)` and highlights the student row immediately.

**Why upgrade:** Teacher can intervene (freeze/force-submit) within seconds of a violation instead of waiting for the next poll cycle.

---

### 6. WebRTC Live Feed (Hard)

**Current:** 8-second snapshot interval — a static JPEG, not video.

**Upgrade:** True live video stream from student to teacher using WebRTC peer-to-peer. Each student's camera stream is relayed through a signaling server and optionally a TURN relay.

**Stack:**
- Signaling: Socket.io (reuse upgrade #5)
- STUN: Google's public `stun:stun.l.google.com:19302` (free, no setup)
- TURN (if NAT traversal needed): Self-hosted [Coturn](https://github.com/coturn/coturn) or Twilio TURN (paid)

**Flow:**
1. Teacher opens proctoring view → browser creates `RTCPeerConnection` offer per student
2. Offer/answer exchanged via Socket.io signaling
3. Student's camera `MediaStream` added as track → streams to teacher

**Why upgrade:** Gives live video visibility with <1s latency, allowing the teacher to see exactly what the student is doing right now.

---

### Summary Table

| # | Upgrade | Difficulty | Impact |
|---|---|---|---|
| 1 | Switch to MediaPipe detection | Easy | Faster, near-real-time detection |
| 2 | 3D head pose via face landmarks | Medium | Accurate looking-away angles, no false positives |
| 3 | Phone / object detection (COCO-SSD) | Medium | Detects physical cheat sheets and phones |
| 4 | Store snapshots as files not base64 | Medium | Scales to many students, smaller DB rows |
| 5 | Real-time alerts via WebSocket | Medium | Teacher notified instantly on violation |
| 6 | WebRTC live video feed | Hard | True live stream instead of 8s snapshots |
