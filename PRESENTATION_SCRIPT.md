# Invigilo — 6 Minute Presentation Script

**Total time:** 6 minutes — 3 minutes per speaker
**Speakers:** Md. Nafiz Ahmed (Roll 2107001) and Dewan Salman Rahman Zisan (Roll 2107015)
**Supervisor:** Waliul Islam Sumon, Lecturer, CSE, KUET

---

## Speaker 1 — Md. Nafiz Ahmed (3 minutes)

**Covers:** Slides 1 → 8 (Title, Outline, Introduction, Problem Statement, Objectives, Related Works, System Architecture, Methodology)

---

### Slide 1 — Title (≈ 15 s)

Good morning sir. I am Md. Nafiz Ahmed, Roll 2107001, and with me is Dewan Salman Rahman Zisan, Roll 2107015. Under the supervision of Waliul Islam Sumon sir, today we are presenting our CSE 3200 System Project, **Invigilo — Design and Development of a Secure Desktop Examination Platform**.

### Slide 2 — Outline (≈ 10 s)

Our talk has ten sections, beginning with the motivation behind the work, moving through architecture and methodology, and ending with our results, conclusion and future work.

### Slide 3 — Introduction (≈ 25 s)

Online examinations in Bangladeshi universities today rely almost entirely on browser-based tools. A browser tab cannot stop a student from switching tabs, sharing the screen, or running background apps. MCQ, written, and coding questions usually need three separate platforms, teachers cannot freeze a single suspicious student, and cloud proctoring sends video to third-party servers, which raises privacy concerns. **Invigilo** is our answer — a self-hosted desktop platform built on Electron, React, Node.js and PostgreSQL, with role-based access, live proctoring, and integrated code execution.

### Slide 4 — Problem Statement (≈ 25 s)

We identified six concrete gaps in the existing tools: no real window lockdown, no live teacher control, fragmented question types across three platforms, no proctoring signals like camera or process scanning, weak identity binding where the roll is checked only once, and inconsistent code execution environments because every student uses their own compiler.

### Slide 5 — Objectives (≈ 25 s)

Our goal was to deliver a complete exam environment in one self-hosted desktop application, with five concrete objectives: a three-role architecture for Admin, Teacher and Student; desktop lockdown using Electron fullscreen and always-on-top; violation detection covering shortcuts, focus loss, multi-display and process scanning; mixed question types in one exam; and per-student live teacher control — freeze, unfreeze and force-submit.

### Slide 6 — Related Works (≈ 25 s)

We compared four approaches across six criteria. LMS Quiz, Form-based tools and Socrative all fall short on per-student freeze, built-in code execution, desktop lockdown and forbidden process scanning. **Invigilo is the only one that supports all six.** Crucially, it is also fully self-hostable by the institution, which directly addresses the privacy concern.

### Slide 7 — System Architecture (≈ 30 s)

We follow a three-tier architecture. The **Electron client** combines a hardened main process for desktop lockdown with a React renderer for the UI — the renderer also embeds Monaco Editor for coding and BlazeFace for face detection. The **Express backend** exposes JWT-protected REST modules for Auth, Exam, Proctor and Code Run. The **PostgreSQL** layer persists all state across seven core tables — users, exams, submissions and proctor data. The two upper tiers talk over REST and JSON.

### Slide 8 — Methodology (≈ 25 s)

We followed an iterative agile cycle — requirements, design, implement, test, review, document — repeated across sprints. Our stack is Electron 39 for the desktop, React 19 with Vite 7 and Tailwind for the frontend, Node.js with Express and PostgreSQL 16 for the backend, JWT with bcryptjs for authentication, Monaco for code editing, and BlazeFace on TensorFlow.js for face detection.

> **Hand off:** "Now Zisan will walk you through the key features, the implementation snapshot, and our results."

---

## Speaker 2 — Dewan Salman Rahman Zisan (3 minutes)

**Covers:** Slides 9 → 18 (User Roles, Desktop Security, Exam System, Database Schema, Student Workflow, Implementation, Conclusion, Future Work, References, Thank You)

---

### Slide 9 — Three User Roles (≈ 25 s)

Thank you. The system has three roles, each with its own dashboard and protected endpoints. The **Admin** manages teacher and student accounts, supports bulk CSV upload, and views platform-wide statistics. The **Teacher** creates exams, authors questions, shares a six-character room code, monitors participants live, can freeze or force-submit per student, and runs the manual evaluation desk. The **Student** logs in or joins via room code, waits in the lobby, answers MCQ, written or coding questions, runs code in the editor, and views detailed results after evaluation.

### Slide 10 — Desktop Security & Lockdown (≈ 25 s)

The Electron main process enforces an exam-mode environment that no browser tab can. The window is held fullscreen and always-on-top. Shortcuts like Alt+F4, F11, minimise and close are blocked. Loss of focus is logged instantly and the window is refocused. Forbidden processes — Task Manager, screen-share apps — are flagged. Additional displays are detected and reported. Every event is tagged with a severity for audit.

### Slide 11 — Exam System (≈ 20 s)

Students join through a six-character alphanumeric room code, easy to read aloud in a lab. One submission record holds MCQ, written, and coding answers together. The multi-language code runner supports JavaScript, Python and C++ with strict timeouts on the backend. Teachers retain live control — per-student freeze, unfreeze, force-submit, and webcam-based detection — throughout the session.

### Slide 12 — Database Schema (≈ 20 s)

Seven core PostgreSQL tables persist all state for audit and replay — Users, Exams, Questions, Exam Participants, Submissions, Proctoring Events and Proctoring Snapshots. This separation lets us reconstruct any session after the fact for evaluation or appeal.

### Slide 13 — Student Exam Workflow (≈ 20 s)

The student journey is six steps — login or room code, waiting room polling every three seconds, exam-mode lock, answering MCQ, written or coding via Monaco, submission either manual, by timeout or force-submit, and finally per-question feedback after teacher evaluation.

### Slide 14 — Implementation Snapshot — *Our Results* (≈ 35 s)

This is our verified result, on Windows 11 with Node 20, PostgreSQL 16 and Electron 39.2.7. The system exposes **39 REST endpoints** across **7 modules**, persists in **7 relational tables**, the renderer production build completes in roughly **12.7 seconds**, and **all 12 manual integration tests passed end-to-end** — across 60 git commits. The runtime parameters on the right show our timing budget — three-second polling for status and snapshots, two-second polling for student controls, eight-second code execution and twelve-second C++ compile timeouts, and a maximum of three violations before auto-submit.

### Slide 15 — Conclusion (≈ 20 s)

Invigilo demonstrates that a self-hosted, role-aware, mixed-format examination platform with integrated proctoring is feasible for university-level digital assessment in Bangladesh — Electron client, Express backend, PostgreSQL store, three roles, three question types, live invigilation with full audit trail, all 12 integration tests passed.

### Slide 16 — Future Work (≈ 15 s)

Going forward we plan an automated CI pipeline, websocket coordination for sub-second freeze at scale, cross-platform process scanners, single sign-on, integration with the campus local network, and Bengali localisation.

### Slides 17–18 — References & Thank You (≈ 10 s)

Our work draws on documented standards for Electron, React, BlazeFace and Safe Exam Browser, listed in detail in the report. **Thank you. We are happy to take any questions.**

---

## Speaker Timing Summary

| Speaker | Slides | Target | Buffer |
|---|---|---|---|
| Nafiz | 1 → 8 | 2 min 50 s | 10 s |
| Zisan | 9 → 18 | 2 min 50 s | 10 s |
| **Total** | **18** | **5 min 40 s** | **20 s for transitions** |

## Delivery Tips

- Keep eye contact with the supervisor and panel during transitions, not the slide.
- On Slide 7 (Architecture), use your hand to point — Electron, then Express, then PostgreSQL.
- On Slide 14, **emphasise the four headline numbers** — 39, 7, 12.7 s, 12/12 — these are your strongest evidence.
- On the hand-off between speakers (after Slide 8), pause one second so the audience adjusts.
- Keep voice pace at ~120 words per minute — the script is sized for this.
