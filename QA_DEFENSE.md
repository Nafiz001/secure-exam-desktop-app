# Invigilo — Defense Q&A Bank

Anticipated questions for every section of the slide deck, with grounded answers drawn from the slides and the final report. Numbers and timings are taken from the verified build on Windows 11 / Node 20 / PostgreSQL 16 / Electron 39.2.7.

---

## A. Introduction & Motivation (Slides 3 — 4)

**Q1. Why build another exam tool when Google Forms or LMS quizzes already exist?**
A. Existing tools run inside a regular browser tab — they cannot stop tab switching, screen sharing, or background apps. They also cannot freeze or force-submit a single suspicious student. Finally, MCQ, written, and coding questions today need three separate platforms. Invigilo solves all three problems in a single self-hosted desktop application.

**Q2. Why specifically a desktop app and not a web app?**
A. Only a native desktop process can hold a window in fullscreen, block OS shortcuts like Alt+F4 and F11, scan for forbidden processes, detect multiple displays, and refocus the window on focus loss. A browser is sandboxed away from those signals.

**Q3. Why "self-hosted" — what's wrong with cloud proctoring?**
A. Cloud proctoring services store webcam video and screen captures on third-party servers. For a Bangladeshi public university this raises real privacy and data-sovereignty concerns. A self-hosted deployment keeps the data inside the institution's own network.

**Q4. What was the actual gap you found in tools currently used at KUET / similar universities?**
A. We identified six gaps — no window lockdown, no live teacher control, fragmented question types, missing proctoring signals (camera, processes, active window), weak identity binding (roll checked once at login then never re-verified), and inconsistent code execution environments because every student uses their own compiler.

---

## B. Objectives (Slide 5)

**Q5. List your concrete objectives.**
A. Five objectives — (1) a three-role architecture for Admin, Teacher, Student with protected endpoints; (2) desktop lockdown using Electron fullscreen + always-on-top; (3) violation detection covering shortcuts, focus loss, multi-display, processes; (4) mixed question types — MCQ, written, coding — in one exam; (5) live teacher control — per-student freeze, unfreeze, force-submit.

**Q6. Were all objectives achieved?**
A. Yes. The report contains an Objective–CLO mapping table — every original objective has corresponding evidence in the build, with status "Achieved" and is verified by at least one of the twelve integration test cases.

---

## C. Related Works (Slide 6)

**Q7. How is Invigilo different from Safe Exam Browser?**
A. Safe Exam Browser is a hardened browser kiosk — it locks the window but it does not own the question authoring, the live teacher control, or the integrated code runner. Invigilo bundles all of those, plus the freeze and force-submit per student, plus a built-in evaluation desk.

**Q8. Why didn't you build it on top of Safe Exam Browser?**
A. SEB is a content viewer — the exam logic, role split, and code execution would still need a separate backend, separate UI, and separate proctoring layer. Building on Electron gave us one process for everything and full control over the IPC boundary between the lockdown layer and the renderer.

**Q9. How does Invigilo compare against Socrative or LMS quizzes feature by feature?**
A. On six criteria — role split, per-student freeze and force submit, built-in code execution, desktop fullscreen lock, forbidden process scanning, and self-hosting — LMS, Form tools and Socrative provide partial or no support, while Invigilo provides full support on all six.

---

## D. System Architecture (Slide 7)

**Q10. Walk us through the architecture.**
A. Three tiers. The Electron client has a main process that enforces the lockdown and a React renderer for the UI — the renderer embeds Monaco Editor and BlazeFace. Communication between main and renderer goes through a preload IPC bridge. The Express backend exposes JWT-protected REST modules for Auth, Exam, Proctor and Code Run. PostgreSQL persists everything in seven core tables.

**Q11. Why three tiers and not two?**
A. The lockdown layer must run as a native process — only the main process can hold fullscreen and scan processes. The UI must be re-renderable and themable — React. The data must be queryable, normalised, and survive a restart — PostgreSQL. Each tier exists because the other two cannot do that job.

**Q12. Why REST and not WebSocket?**
A. REST kept the system simple to debug and test in a college lab setting. We do acknowledge that, for sub-second freeze propagation at scale, websockets are the natural next step — it is listed as future work.

---

## E. Methodology & Stack (Slide 8)

**Q13. Why Electron 39?**
A. Electron gives us a native window, OS-level shortcut handling, fullscreen control, multi-display detection, and a Node.js process side-by-side with a Chromium renderer — that is exactly the union of capabilities a lockdown exam app needs.

**Q14. Why React 19 + Vite 7?**
A. Vite gives sub-second hot reload during development and produced a clean production build in about 11.45 seconds. React 19 was the latest stable line during development.

**Q15. Why Tailwind CSS?**
A. Utility-first styling avoids a separate CSS bundle and keeps the dashboard layouts consistent across Admin, Teacher and Student views.

**Q16. Why JWT + bcryptjs and not sessions?**
A. JWT lets the desktop client carry the credential without a server-side session table — it fits a multi-machine lab where one laptop runs the backend and others run the desktop client. bcryptjs hashes passwords on the server before storage. JWT is RFC 7519, bcrypt is the standard adaptive password hash.

**Q17. Why BlazeFace and not a heavier model?**
A. BlazeFace is sub-millisecond on a CPU and runs on TensorFlow.js inside the renderer — meaning a webcam snapshot can be classified locally without shipping the image to a server. It is fast enough that the three-second snapshot interval is comfortable.

**Q18. Why PostgreSQL 16?**
A. We needed transactional integrity for submissions, foreign-key relationships across users, exams, questions, participants, submissions, proctor events and snapshots, and standard SQL. PostgreSQL gives us all three without licensing cost.

---

## F. Three User Roles (Slide 9)

**Q19. What can the Admin do that a Teacher cannot?**
A. The Admin manages teacher and student accounts, performs bulk CSV student upload, activates and deactivates users, and views platform-wide statistics. Teachers cannot create other teachers or modify the user pool.

**Q20. How does CSV bulk upload work?**
A. The admin pastes a CSV fragment into the bulk import tab — the backend validates each row, creates accounts, and reports skipped rows. A 20-student class can be onboarded in seconds.

**Q21. Can a teacher edit another teacher's exam?**
A. No — the delete and modify endpoints are guarded by an ownership check. TC-10 in the integration suite confirms that a non-owner request is rejected with a permission error.

---

## G. Desktop Security & Lockdown (Slide 10)

**Q22. What exactly happens when the student loses focus?**
A. The Electron focus enforcer runs every 0.5 seconds. If focus is lost, the event is logged with severity, the window is refocused, and the violation count for the participant is incremented on the backend. After three violations the system auto-submits.

**Q23. Which shortcuts are blocked?**
A. Alt+F4, F11, minimise and close are intercepted by the main process. The OS Win key cannot be intercepted by a user-space app — that limitation is listed in the report.

**Q24. How does forbidden process scanning work?**
A. The main process scans the running process list once per second and matches against a list of forbidden names — Task Manager, common screen-share applications. Matches generate a violation with severity and a process name in the audit trail.

**Q25. What if a student has Administrator rights and just kills your process?**
A. We acknowledge this in the limitations — privileged OS bypasses cannot be prevented by any user-space application. Mitigation is procedural — students log into a standard, non-Administrator account on the lab machine.

**Q26. How do you detect a second monitor?**
A. Electron's `screen` API enumerates connected displays at exam start and on display change. A second display triggers a violation event reported to the teacher panel.

---

## H. Exam System & Room Code (Slide 11)

**Q27. Why six-character room codes?**
A. Six characters give roughly two billion combinations — enough to avoid collisions for a department — while remaining short enough to read aloud in a lab without errors.

**Q28. What languages does the code runner support and what are the timeouts?**
A. JavaScript, Python and C++. Code execution timeout is 8 seconds. C++ compilation is allowed up to 12 seconds. Both run on the backend host as isolated child processes.

**Q29. Is the code runner sandboxed?**
A. It is process-isolated, with strict timeouts. We acknowledge in the limitations that container-based isolation (Docker with CPU, memory, FS quotas) would be safer — that is listed under future work.

**Q30. How do MCQ, written and coding answers share a single submission?**
A. The submissions table holds answers as a structured JSON column keyed by question ID. The auto-score and manual-score fields are separate so that the auto-graded MCQ score and the teacher-evaluated written/coding scores recombine into a total.

---

## I. Database Schema (Slide 12)

**Q31. Why seven tables?**
A. Each table normalises one concern — Users, Exams, Questions, Exam Participants, Submissions, Proctoring Events, Proctoring Snapshots. The split lets us reconstruct a session after the fact, separate violation events from webcam frames, and keep the submission record clean.

**Q32. Why is `webcam_required` a per-exam flag?**
A. Some lab exams (e.g. coding-only) may not need webcam invigilation. Per-exam control lets the teacher decide.

**Q33. Where are webcam snapshots stored?**
A. As base64 strings in the Proctoring Snapshots table, keyed by exam, student, and timestamp, with a face count from BlazeFace. The report flags that a formal retention policy and consent flow should be added before production deployment.

**Q34. What is `violation_count` used for?**
A. It is the running total per participant. When it reaches three, the system auto-submits the exam — this is the threshold shown on Slide 14.

---

## J. Student Workflow (Slide 13)

**Q35. How does the waiting room know when the exam starts?**
A. It polls the backend every 3 seconds. As soon as the teacher transitions the exam to "in progress", the next poll picks it up and the renderer transitions to the exam screen — this is verified by TC-02 and TC-03.

**Q36. What happens if a student's submit click fails?**
A. The submission is also driven by a timeout — when the timer expires or the teacher force-submits, the answers persisted so far are recorded. Manual submit is preferred but not the only path.

---

## K. Implementation Snapshot — Results (Slide 14)

**Q37. Read off the headline numbers.**
A. 39 REST endpoints, 7 modules, 7 relational tables, 60 commits, renderer production build in ~12.7 s wall clock (Vite reported ~11.45 s), 17 features verified, all 12 manual integration tests passed.

**Q38. How were the integration tests run?**
A. Manually, on a two-laptop setup over a wireless local area network — laptop one ran the backend, database and teacher dashboard; laptop two ran the student desktop client. We acknowledge this is a manual run, not an automated suite — automated CI is listed under future work.

**Q39. Why these specific polling intervals — 3 s, 2 s, 0.5 s?**
A. The 3-second status poll keeps the waiting room and teacher panel near-real-time without flooding the API. The 2-second student exam control poll ensures freeze or force-submit propagates within roughly two seconds. The 0.5-second focus enforcer is short enough to refocus before a student can interact with another window.

**Q40. How long does it take from a teacher pressing "freeze" to the student seeing the overlay?**
A. Worst case under two seconds — bounded by the student exam control poll interval. TC-05 verifies this end-to-end.

**Q41. What does "12.7 seconds build time" actually measure?**
A. Wall-clock execution of `npm run build:renderer`. Vite's internal build phase reports about 11.45 s, the surrounding overhead brings the wall clock to roughly 12.7 s. Exit code is zero, no warnings above info severity.

**Q42. How many lines of code does the project contain?**
A. The six core frontend files total about 4,991 lines, the seven core backend controllers about 3,139 lines.

---

## L. Conclusion & Limitations (Slide 15)

**Q43. Summarise your conclusion in one sentence.**
A. Invigilo proves that a self-hosted, role-aware, mixed-format examination platform with integrated proctoring is feasible for university-level digital assessment in Bangladesh.

**Q44. What are the most important limitations of this work?**
A. No automated test suite (only manual integration runs), polling-based coordination instead of websockets, process-isolated rather than container-isolated code runner, Windows-centric forbidden process list, and no defence against an adversary with local Administrator rights. There is also no formal retention/consent policy yet.

**Q45. What is the proctoring false-positive rate?**
A. We did not run a quantitative false-positive measurement — we observed qualitatively that BlazeFace can occasionally classify a head turn as looking away. The teacher's panel surfaces the snapshot so they can use judgement. This is explicitly listed in the limitations.

---

## M. Future Work (Slide 16)

**Q46. What is the single most impactful next step?**
A. Replacing HTTP polling with WebSockets so freeze and force-submit propagate in well under one second even at department-wide scale. The next most impactful is containerising the code runner.

**Q47. Why Bengali localisation?**
A. To widen accessibility to students and teachers across departments and to align with the public-university context. The current renderer strings are English-only.

**Q48. Will you support macOS and Linux?**
A. Yes — the Electron renderer already runs cross-platform; what changes per platform is the forbidden-process name list and a few main-process shortcut handlers. That generalisation is listed as future work.

---

## N. References & Wider Context (Slide 17)

**Q49. What are your most important references?**
A. Four anchor the design — Electron documentation [1] for the desktop layer, BlazeFace by Bazarevsky et al. arXiv:1907.05047 [8] for face detection, Safe Exam Browser [10] as the comparable lockdown system, and Abrahams et al. *Online Proctoring Practices in Higher Education* (Computers & Education, 2023) [14] for the motivation evidence. JSON Web Token RFC 7519 [6] underpins our auth.

**Q50. How does this address Bangladesh's Digital Security Act, 2018?**
A. Self-hosting keeps the personal data — names, rolls, webcam snapshots — inside the institution. The Act's data-sovereignty obligations are easier to meet when the data never leaves the campus network. The report notes that a written retention policy and signed consent flow remain to be added before any production deployment.

---

## O. Project Process & Roles

**Q51. How was the work distributed between you two?**
A. Both of us collaborated on architecture and integration. Roles split across the role-based dashboards, the proctoring pipeline, the code-runner integration, the database schema and the report — the full RACI matrix and Gantt chart are in the report's Project Planning section.

**Q52. How long did the project take?**
A. The work was carried out across the CSE 3200 semester following an iterative agile cycle — requirements, design, implement, test, review, document — repeated across sprints, totalling 60 git commits.

**Q53. Did the project involve any complex engineering activity beyond standard CRUD?**
A. Yes. The lockdown layer, the multi-language sandboxed code runner, the BlazeFace pipeline, and the live teacher control plane are each distinct engineering problems. The report has a dedicated chapter mapping these against the complex engineering problem and activity attributes.

---

## P. "Stress test" Questions

**Q54. What if the network goes down mid-exam?**
A. The desktop client retains the last-loaded questions and the local answer state. On reconnect the next poll re-syncs. Submissions are accepted whenever connectivity returns; if the timer expires offline, the buffered answers are pushed when network restores.

**Q55. What if two teachers create the same room code?**
A. The room code is generated server-side and a uniqueness check on the exams table prevents collisions before the code is returned to the teacher.

**Q56. Why did you cap violations at 3?**
A. Three gives a student room for an accidental focus loss or a momentary alt-tab without immediately ejecting them, while still bounding deliberate cheating. The number is configurable in the runtime parameters.

**Q57. How do you prevent a student from logging in twice from two laptops?**
A. The exam-participant record is keyed per (exam_id, student_id). A second join attempt for the same student on the same exam updates the existing participant rather than creating a parallel session. The teacher panel would still see only one row per student.

**Q58. Can a student see another student's webcam?**
A. No. Snapshots are only visible to the teacher who owns the exam, on the proctoring panel. Student-side endpoints do not expose the snapshots table.

**Q59. What if the code runner is exploited to read host files?**
A. Code runs as a child process under the backend's user, with strict execution and compile timeouts (8 s and 12 s). We explicitly mark in the limitations that container isolation would be safer and is the recommended next step.

**Q60. How would you scale this to a department-wide deployment?**
A. Move teacher controls onto WebSockets, containerise the code runner, generalise the process scanner across platforms, integrate single sign-on with the institutional identity provider, and add a formal retention/consent policy — exactly the future-work list on Slide 16.
