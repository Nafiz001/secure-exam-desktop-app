# Webcam Proctoring: Current State and Roadmap

This document tracks what is already implemented and what remains for future phases.

## 1. Current Implemented State

### Backend

- Exam-level webcam setting:
  - `exams.webcam_required`
- Proctoring event ingestion:
  - `POST /api/proctoring/:examId/event`
- Snapshot ingestion:
  - `POST /api/proctoring/:examId/snapshot`
- Teacher monitoring APIs:
  - `GET /api/proctoring/:examId/students`
  - `GET /api/proctoring/:examId/events/:studentId`
- Tables in schema:
  - `proctoring_events`
  - `proctoring_snapshots`

### Student Renderer

- Camera access flow in exam context.
- Face detection pipeline using browser-side model(s).
- Status classification and event reporting.
- Periodic snapshot uploads.

### Teacher Renderer

- Proctoring view with student status summary.
- Student event list drill-down.
- Snapshot-based monitoring in dashboard.

## 2. Current Operational Model

- Detection runs in student renderer.
- Student pushes proctoring events/snapshots to backend.
- Teacher polls dashboard endpoints at interval.
- Intended behavior:
  - near-live monitoring with low infrastructure complexity
  - no dedicated streaming server required

## 3. Known Constraints

1. Polling architecture can become heavy at large scale.
2. Snapshot approach is not continuous video monitoring.
3. False positives are possible for look-away style heuristics.
4. Data retention policy must be explicitly managed by institution.

## 4. Next Improvements (Prioritized)

### P1 - Reliability and Quality

- Add stronger client retry strategy for event/snapshot posts.
- Add server-side validation guards for malformed payloads.
- Add explicit max payload controls and better compression strategy.

### P2 - Detection Quality

- Improve head-pose classification thresholds by calibration.
- Add low-confidence suppression to reduce noisy warnings.
- Add optional object detection for phone/book signals.

### P3 - Scalability

- Move teacher update path from polling to websocket/SSE.
- Add pagination/windowing for historical event logs.
- Add index/performance tuning for high exam concurrency.

### P4 - Governance and Audit

- Add configurable retention policy per exam/institution.
- Add explicit consent/audit fields for camera-required exams.
- Add exportable proctoring audit report for dispute handling.

## 5. Suggested Test Cases for Proctoring

1. Camera denied when webcam required -> student cannot proceed.
2. Single face stable -> status remains `ok`.
3. No face -> violation/warning event appears.
4. Multiple faces -> violation event appears.
5. Teacher dashboard reflects latest status and timestamp.
6. Event history endpoint returns ordered timeline.
7. Snapshot updates and is visible in teacher monitor.
