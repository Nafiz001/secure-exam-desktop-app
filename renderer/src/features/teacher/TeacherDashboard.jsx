import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, apiUpload, resolveUploadUrl } from "../../api";
import { useModal } from "../../components/modals/ModalProvider";

function normalizeOptionsForEditing(rawOptions) {
  const base = Array.isArray(rawOptions) && rawOptions.length > 0 ? rawOptions : ["", "", "", ""];
  return [0, 1, 2, 3].map((i) => {
    const opt = base[i];
    if (opt && typeof opt === "object") return opt.text || "";
    return opt || "";
  });
}

function normalizeQuestionType(rawType) {
  const normalized = String(rawType || "mcq").toLowerCase();
  if (normalized === "written") return "written";
  if (normalized === "coding") return "coding";
  return "mcq";
}

function getEffectiveExamStatus(status, startedAt, durationMinutes) {
  if (String(status || "").toLowerCase() !== "in_progress") {
    return status || "created";
  }

  if (!startedAt) {
    return status || "created";
  }

  const startedAtMs = new Date(startedAt).getTime();
  const durationMs = Number(durationMinutes || 0) * 60 * 1000;
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(durationMs)) {
    return status || "created";
  }

  return Date.now() >= startedAtMs + durationMs ? "completed" : "in_progress";
}

function normalizeViolations(violationsValue) {
  if (!violationsValue) return [];
  if (Array.isArray(violationsValue)) return violationsValue;
  if (typeof violationsValue === "string") {
    try {
      const parsed = JSON.parse(violationsValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
}

function formatDateTime(dateValue) {
  if (!dateValue) return "N/A";
  const dt = new Date(dateValue);
  return dt.toLocaleString();
}

function getStatusToneClass(status) {
  const normalized = String(status || "created").toLowerCase();
  if (normalized === "in_progress") return "teacher-chip-live";
  if (normalized === "completed") return "teacher-chip-done";
  if (normalized === "waiting") return "teacher-chip-wait";
  return "teacher-chip-created";
}

function getExamTypeToneClass(examType) {
  const normalized = String(examType || "lab_quiz").toLowerCase();
  if (normalized === "lab_test") return "teacher-meta-chip-test";
  return "teacher-meta-chip-quiz";
}

export default function TeacherDashboard({ token }) {
  const { showAlert, showConfirm } = useModal();
  const [view, setView] = useState("list");
  const [exams, setExams] = useState([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [savingExam, setSavingExam] = useState(false);
  const [currentExamId, setCurrentExamId] = useState(null);
  const [currentExamTitle, setCurrentExamTitle] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formExamType, setFormExamType] = useState("lab_quiz");
  const [formDuration, setFormDuration] = useState("60");
  const [roomCode, setRoomCode] = useState("");
  const [examStatus, setExamStatus] = useState("created");
  const [examStartedAt, setExamStartedAt] = useState(null);
  const [currentExamType, setCurrentExamType] = useState("lab_quiz");
  const [participants, setParticipants] = useState([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionFormVisible, setQuestionFormVisible] = useState(false);
  const [currentQuestionId, setCurrentQuestionId] = useState(null);
  const [questionText, setQuestionText] = useState("");
  const [questionType, setQuestionType] = useState("mcq");
  const [questionOptions, setQuestionOptions] = useState(normalizeOptionsForEditing());
  const [questionImage, setQuestionImage] = useState(null);
  const [uploadingQuestionImage, setUploadingQuestionImage] = useState(false);
  const [questionCorrectAnswer, setQuestionCorrectAnswer] = useState("");
  const [questionReferenceAnswer, setQuestionReferenceAnswer] = useState("");
  const [questionSampleInput, setQuestionSampleInput] = useState("");
  const [questionSampleOutput, setQuestionSampleOutput] = useState("");
  const [questionStarterCode, setQuestionStarterCode] = useState("");
  const [questionMarks, setQuestionMarks] = useState("2");
  const [savingQuestion, setSavingQuestion] = useState(false);

  const [evaluationParticipants, setEvaluationParticipants] = useState([]);
  const [loadingEvaluationParticipants, setLoadingEvaluationParticipants] = useState(false);
  const [selectedSubmissionSheet, setSelectedSubmissionSheet] = useState(null);
  const [loadingSubmissionSheet, setLoadingSubmissionSheet] = useState(false);
  const [savingEvaluation, setSavingEvaluation] = useState(false);
  const [writtenMarksDraft, setWrittenMarksDraft] = useState({});
  const [writtenCommentDraft, setWrittenCommentDraft] = useState({});

  const clearParticipantPolling = useCallback(() => {}, []);

  const loadExams = useCallback(async () => {
    setLoadingExams(true);
    try {
      const result = await apiRequest("/exams", {}, token);
      setExams(result.data.exams || []);
    } catch (err) {
      await showAlert({
        title: "Error",
        message: err.message || "Failed to load exams."
      });
    } finally {
      setLoadingExams(false);
    }
  }, [showAlert, token]);

  const loadParticipants = useCallback(
    async (examId) => {
      if (!examId) return;
      setLoadingParticipants(true);
      try {
        const result = await apiRequest(`/exams/${examId}/participants`, {}, token);
        setParticipants(result.data.participants || []);
      } catch (err) {
        await showAlert({
          title: "Error",
          message: err.message || "Failed to load participants."
        });
      } finally {
        setLoadingParticipants(false);
      }
    },
    [showAlert, token]
  );

  const startParticipantPolling = useCallback(
    (examId) => {
      // Manual refresh only: load once when opening/editing or explicitly requested.
      loadParticipants(examId);
    },
    [loadParticipants]
  );

  const loadQuestionsForExam = useCallback(
    async (examId) => {
      setLoadingQuestions(true);
      try {
        const result = await apiRequest(`/exams/${examId}`, {}, token);
        const exam = result.data.exam;
        setQuestions(exam.questions || []);
      } catch (err) {
        await showAlert({
          title: "Error",
          message: err.message || "Failed to load questions."
        });
      } finally {
        setLoadingQuestions(false);
      }
    },
    [showAlert, token]
  );

  const loadEvaluationParticipants = useCallback(
    async (examId) => {
      setLoadingEvaluationParticipants(true);
      try {
        const result = await apiRequest(`/exams/${examId}/evaluation/participants`, {}, token);
        setEvaluationParticipants(result.data.participants || []);
      } catch (err) {
        await showAlert({
          title: "Error",
          message: err.message || "Failed to load evaluation participants."
        });
      } finally {
        setLoadingEvaluationParticipants(false);
      }
    },
    [showAlert, token]
  );

  const resetQuestionForm = useCallback(() => {
    setCurrentQuestionId(null);
    setQuestionText("");
    setQuestionType("mcq");
    setQuestionOptions(normalizeOptionsForEditing());
    setQuestionImage(null);
    setQuestionCorrectAnswer("");
    setQuestionReferenceAnswer("");
    setQuestionSampleInput("");
    setQuestionSampleOutput("");
    setQuestionStarterCode("");
    setQuestionMarks("2");
    setQuestionFormVisible(false);
  }, []);

  const loadSubmissionSheet = useCallback(
    async (submissionId) => {
      if (!currentExamId || !submissionId) return;
      setLoadingSubmissionSheet(true);
      try {
        const result = await apiRequest(
          `/exams/${currentExamId}/evaluation/submissions/${submissionId}`,
          {},
          token
        );
        const submission = result.data.submission;
        setSelectedSubmissionSheet(submission);

        const nextMarks = {};
        const nextComments = {};
        (submission.answer_sheet || []).forEach((answerItem) => {
          if (normalizeQuestionType(answerItem.question_type) === "written") {
            nextMarks[answerItem.question_id] = String(answerItem.awarded_marks ?? 0);
            nextComments[answerItem.question_id] = answerItem.evaluation_comment || "";
          }
        });
        setWrittenMarksDraft(nextMarks);
        setWrittenCommentDraft(nextComments);
      } catch (err) {
        await showAlert({
          title: "Error",
          message: err.message || "Failed to load answer sheet."
        });
      } finally {
        setLoadingSubmissionSheet(false);
      }
    },
    [currentExamId, showAlert, token]
  );

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  useEffect(() => {
    return () => {
      clearParticipantPolling();
    };
  }, [clearParticipantPolling]);

  async function openCreateForm() {
    clearParticipantPolling();
    setCurrentExamId(null);
    setCurrentExamTitle("");
    setFormTitle("");
    setFormDescription("");
    setFormExamType("lab_quiz");
    setFormDuration("60");
    setRoomCode("");
    setExamStatus("created");
    setExamStartedAt(null);
    setCurrentExamType("lab_quiz");
    setParticipants([]);
    setView("form");
  }

  async function openEditForm(examId) {
    clearParticipantPolling();
    try {
      const result = await apiRequest(`/exams/${examId}`, {}, token);
      const exam = result.data.exam;
      setCurrentExamId(exam.id);
      setCurrentExamTitle(exam.title || "");
      setFormTitle(exam.title || "");
      setFormDescription(exam.description || "");
      setFormExamType(exam.exam_type || "lab_quiz");
      setFormDuration(String(exam.duration || 60));
      setRoomCode(exam.room_code || "");
      setExamStatus(exam.status || "created");
      setExamStartedAt(exam.started_at || null);
      setCurrentExamType(exam.exam_type || "lab_quiz");
      setView("form");

      if (exam.room_code) {
        startParticipantPolling(exam.id);
      } else {
        setParticipants([]);
      }
    } catch (err) {
      await showAlert({
        title: "Error",
        message: err.message || "Failed to load exam details."
      });
    }
  }

  async function handleDeleteExam(examId, title) {
    const confirmed = await showConfirm({
      title: "Delete Exam",
      message: `Delete "${title}"? This action cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel"
    });
    if (!confirmed) return;

    try {
      await apiRequest(`/exams/${examId}`, { method: "DELETE" }, token);
      await loadExams();
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to delete exam." });
    }
  }

  async function handleSaveExam(event) {
    event.preventDefault();
    const title = formTitle.trim();
    const duration = Number(formDuration);
    const examType = String(formExamType || "lab_quiz").toLowerCase() === "lab_test" ? "lab_test" : "lab_quiz";
    if (!title) {
      await showAlert({ title: "Validation", message: "Exam title is required." });
      return;
    }
    if (!duration || duration <= 0) {
      await showAlert({ title: "Validation", message: "Exam duration must be greater than 0." });
      return;
    }

    const isNewExam = !currentExamId;
    setSavingExam(true);
    try {
      const endpoint = currentExamId ? `/exams/${currentExamId}` : "/exams";
      const method = currentExamId ? "PUT" : "POST";
      const result = await apiRequest(
        endpoint,
        { method, body: JSON.stringify({ title, description: formDescription, exam_type: examType, duration }) },
        token
      );
      const exam = result.data.exam;
      setCurrentExamId(exam.id);
      setCurrentExamTitle(exam.title || title);
      setRoomCode(exam.room_code || roomCode);
      setExamStatus(exam.status || examStatus);
      setExamStartedAt(exam.started_at || examStartedAt);
      setCurrentExamType(exam.exam_type || examType);
      setFormExamType(exam.exam_type || examType);
      await loadExams();

      if (isNewExam) {
        await openQuestionManager(exam.id, exam.title || title);
      } else {
        setView("form");
        if (exam.id) startParticipantPolling(exam.id);
      }
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to save exam." });
    } finally {
      setSavingExam(false);
    }
  }

  async function handleStartExamNow() {
    if (!currentExamId) return;
    const confirmed = await showConfirm({
      title: "Start Exam",
      message: "Are you sure you want to start the exam? All joined students will begin immediately.",
      confirmText: "Start",
      cancelText: "Cancel"
    });
    if (!confirmed) return;

    try {
      const result = await apiRequest(`/exams/${currentExamId}/start`, { method: "POST" }, token);
      setExamStatus("in_progress");
      setExamStartedAt(result?.data?.exam?.started_at || new Date().toISOString());
      await loadExams();
      await showAlert({ title: "Success", message: "Exam started successfully." });
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to start exam." });
    }
  }

  async function copyRoomCodeToClipboard() {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      await showAlert({ title: "Success", message: "Room code copied." });
    } catch (error) {
      await showAlert({ title: "Error", message: "Could not copy room code." });
    }
  }

  async function openQuestionManager(examId, examTitle) {
    clearParticipantPolling();
    resetQuestionForm();
    setCurrentExamId(examId);
    setCurrentExamTitle(examTitle);
    const selectedExam = exams.find((exam) => exam.id === examId);
    setCurrentExamType(selectedExam?.exam_type || "lab_quiz");
    setView("questions");
    await loadQuestionsForExam(examId);
  }

  async function openSubmissionsView(examId, examTitle) {
    clearParticipantPolling();
    setCurrentExamId(examId);
    setCurrentExamTitle(examTitle);
    setSelectedSubmissionSheet(null);
    setWrittenMarksDraft({});
    setWrittenCommentDraft({});
    setView("submissions");
    await loadEvaluationParticipants(examId);
  }

  function openAddQuestionForm() {
    resetQuestionForm();
    if (currentExamType === "lab_test") {
      setQuestionType("coding");
    }
    setQuestionFormVisible(true);
  }

  function openEditQuestionForm(question) {
    const qType = normalizeQuestionType(question.question_type);
    setCurrentQuestionId(question.id);
    setQuestionText(question.question_text || "");
    setQuestionType(qType);
    setQuestionOptions(normalizeOptionsForEditing(question.options));
    setQuestionImage(question.image_url || null);
    setQuestionCorrectAnswer(
      question.correct_answer === undefined || question.correct_answer === null
        ? ""
        : String(question.correct_answer)
    );
    setQuestionReferenceAnswer(question.reference_answer || "");
    setQuestionSampleInput(question.sample_input || "");
    setQuestionSampleOutput(question.sample_output || "");
    setQuestionStarterCode(question.starter_code || "");
    setQuestionMarks(String(question.marks || 2));
    setQuestionFormVisible(true);
  }

  function handleOptionChange(index, value) {
    setQuestionOptions((prev) => prev.map((opt, i) => (i === index ? value : opt)));
  }

  async function handleQuestionImageUpload(file) {
    if (!file) return;

    setUploadingQuestionImage(true);
    try {
      const result = await apiUpload("/uploads/question-image", file, token);
      setQuestionImage(result.data.url);
    } catch (err) {
      await showAlert({ title: "Upload Failed", message: err.message || "Failed to upload image." });
    } finally {
      setUploadingQuestionImage(false);
    }
  }

  function handleRemoveQuestionImage() {
    setQuestionImage(null);
  }

  async function handleSaveQuestion(event) {
    event.preventDefault();
    if (!currentExamId) return;

    const trimmedQuestionText = questionText.trim();
    const marks = Number(questionMarks);

    if (!trimmedQuestionText) {
      await showAlert({ title: "Validation", message: "Question text is required." });
      return;
    }
    if (!marks || marks <= 0) {
      await showAlert({ title: "Validation", message: "Marks must be greater than 0." });
      return;
    }

    let trimmedOptions = null;
    if (questionType === "mcq") {
      trimmedOptions = questionOptions.map((opt) => opt.trim());
      if (trimmedOptions.some((opt) => !opt)) {
        await showAlert({ title: "Validation", message: "All four MCQ options are required." });
        return;
      }
      const correctAnswer = Number(questionCorrectAnswer);
      if (Number.isNaN(correctAnswer) || correctAnswer < 0 || correctAnswer > 3) {
        await showAlert({ title: "Validation", message: "Please select a valid correct answer." });
        return;
      }
    }

    setSavingQuestion(true);
    try {
      const isEdit = Boolean(currentQuestionId);
      const endpoint = isEdit
        ? `/exams/questions/${currentQuestionId}`
        : `/exams/${currentExamId}/questions`;
      const method = isEdit ? "PUT" : "POST";

      const payload =
        questionType === "written"
          ? {
              question_text: trimmedQuestionText,
              question_type: "written",
              reference_answer: questionReferenceAnswer.trim(),
              marks,
              image_url: questionImage
            }
          : questionType === "coding"
            ? {
                question_text: trimmedQuestionText,
                question_type: "coding",
                sample_input: questionSampleInput,
                sample_output: questionSampleOutput,
                starter_code: questionStarterCode,
                marks,
                image_url: questionImage
              }
          : {
              question_text: trimmedQuestionText,
              question_type: "mcq",
              options: trimmedOptions,
              correct_answer: Number(questionCorrectAnswer),
              marks,
              image_url: questionImage
            };

      await apiRequest(
        endpoint,
        {
          method,
          body: JSON.stringify(payload)
        },
        token
      );

      resetQuestionForm();
      await loadQuestionsForExam(currentExamId);
      await loadExams();
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to save question." });
    } finally {
      setSavingQuestion(false);
    }
  }

  async function handleDeleteQuestion(questionId) {
    const confirmed = await showConfirm({
      title: "Delete Question",
      message: "Delete this question?",
      confirmText: "Delete",
      cancelText: "Cancel"
    });
    if (!confirmed) return;

    try {
      await apiRequest(`/exams/questions/${questionId}`, { method: "DELETE" }, token);
      if (currentQuestionId === questionId) resetQuestionForm();
      await loadQuestionsForExam(currentExamId);
      await loadExams();
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to delete question." });
    }
  }

  function handleWrittenMarkDraftChange(questionId, value, maxMarks) {
    const numeric = value === "" ? "" : Number(value);
    if (numeric === "") {
      setWrittenMarksDraft((prev) => ({ ...prev, [questionId]: "" }));
      return;
    }
    if (Number.isNaN(numeric)) return;
    const clamped = Math.max(0, Math.min(numeric, Number(maxMarks) || 0));
    setWrittenMarksDraft((prev) => ({ ...prev, [questionId]: String(clamped) }));
  }

  function handleWrittenCommentDraftChange(questionId, value) {
    setWrittenCommentDraft((prev) => ({ ...prev, [questionId]: value }));
  }

  async function saveWrittenEvaluation() {
    if (!selectedSubmissionSheet || !currentExamId) return;

    const writtenItems = (selectedSubmissionSheet.answer_sheet || []).filter(
      (item) => normalizeQuestionType(item.question_type) === "written"
    );

    const evaluations = writtenItems.map((item) => ({
      question_id: item.question_id,
      awarded_marks: Number(writtenMarksDraft[item.question_id] ?? 0),
      evaluation_comment: writtenCommentDraft[item.question_id] || ""
    }));

    setSavingEvaluation(true);
    try {
      await apiRequest(
        `/exams/${currentExamId}/evaluation/submissions/${selectedSubmissionSheet.id}/score`,
        { method: "PUT", body: JSON.stringify({ evaluations }) },
        token
      );

      await showAlert({ title: "Saved", message: "Written evaluation saved successfully." });
      await loadSubmissionSheet(selectedSubmissionSheet.id);
      await loadEvaluationParticipants(currentExamId);
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to save written evaluation." });
    } finally {
      setSavingEvaluation(false);
    }
  }

  function renderExamListView() {
    const totalExams = exams.length;
    const activeExams = exams.filter(
      (exam) => getEffectiveExamStatus(exam.status, exam.started_at, exam.duration) === "in_progress"
    ).length;
    const quizCount = exams.filter((exam) => String(exam.exam_type || "").toLowerCase() === "lab_quiz").length;
    const testCount = exams.filter((exam) => String(exam.exam_type || "").toLowerCase() === "lab_test").length;

    return (
      <section className="card teacher-panel teacher-panel-hero">
        <div className="teacher-panel-glow" aria-hidden="true" />
        <div className="card-head">
          <div>
            <p className="teacher-kicker">Teaching Workspace</p>
            <h2 className="teacher-title">Teacher Dashboard</h2>
            <p className="teacher-mode-line">Command Center | Assessments</p>
          </div>
          <div className="actions-row teacher-toolbar">
            <button className="secondary" onClick={loadExams} disabled={loadingExams}>
              Refresh
            </button>
            <button onClick={openCreateForm}>Create New Exam</button>
          </div>
        </div>
        <p className="muted teacher-subtitle">Create, launch, and evaluate exams from one unified control center.</p>

        <div className="teacher-stats-grid">
          <article className="teacher-stat-card">
            <p>Total Exams</p>
            <strong>{totalExams}</strong>
          </article>
          <article className="teacher-stat-card">
            <p>In Progress</p>
            <strong>{activeExams}</strong>
          </article>
          <article className="teacher-stat-card">
            <p>Lab Quizzes</p>
            <strong>{quizCount}</strong>
          </article>
          <article className="teacher-stat-card">
            <p>Lab Tests</p>
            <strong>{testCount}</strong>
          </article>
        </div>

        <div className="teacher-quick-actions" aria-hidden="true">
          <span>Create</span>
          <span>Question Bank</span>
          <span>Evaluation Desk</span>
          <span>Live Room</span>
        </div>

        {loadingExams ? <p>Loading exams...</p> : null}
        {!loadingExams && exams.length === 0 ? <p className="muted">No exams found.</p> : null}

        <ul className="list teacher-list">
          {exams.map((exam) => {
            const effectiveStatus = getEffectiveExamStatus(exam.status, exam.started_at, exam.duration);
            return (
            <li key={exam.id} className="teacher-list-item">
              <div className="teacher-list-head">
                <strong>{exam.title}</strong>
                <span className={`teacher-chip ${getStatusToneClass(effectiveStatus)}`}>
                  {String(effectiveStatus || "created").replace("_", " ")}
                </span>
              </div>
              <div className="teacher-meta-row">
                <span className="teacher-meta-chip">{exam.duration} mins</span>
                <span className="teacher-meta-chip">Questions {exam.question_count || 0}</span>
                <span className="teacher-meta-chip">Written {exam.written_question_count || 0}</span>
                <span className="teacher-meta-chip">Coding {exam.coding_question_count || 0}</span>
                <span className={`teacher-meta-chip ${getExamTypeToneClass(exam.exam_type)}`}>
                  Type {exam.exam_type || "lab_quiz"}
                </span>
                <span className="teacher-meta-chip">Room {exam.room_code || "n/a"}</span>
              </div>
              <div className="actions-row teacher-actions">
                <button className="secondary btn-inline" onClick={() => openEditForm(exam.id)}>
                  Edit
                </button>
                <button className="secondary btn-inline" onClick={() => openQuestionManager(exam.id, exam.title)}>
                  Questions
                </button>
                <button className="secondary btn-inline" onClick={() => openSubmissionsView(exam.id, exam.title)}>
                  Evaluation
                </button>
                <button className="btn-inline" onClick={() => handleDeleteExam(exam.id, exam.title)}>
                  Delete
                </button>
              </div>
            </li>
            );
          })}
        </ul>
      </section>
    );
  }

  function renderExamFormView() {
    const effectiveExamStatus = getEffectiveExamStatus(examStatus, examStartedAt, formDuration);

    return (
      <div className="content-stack teacher-stack">
        <section className="card teacher-panel">
          <div className="teacher-section-strip">
            <span className="teacher-section-tag">Exam Setup</span>
            <span className="teacher-section-note">Configure exam details and scheduling.</span>
          </div>
          <div className="card-head">
            <h2 className="teacher-title">{currentExamId ? "Edit Exam" : "Create Exam"}</h2>
            <button
              className="secondary"
              onClick={() => {
                clearParticipantPolling();
                setView("list");
                loadExams();
              }}
            >
              Back to Exams
            </button>
          </div>

          <form className="form-stack" onSubmit={handleSaveExam}>
            <label>
              <span>Exam Title</span>
              <input value={formTitle} onChange={(event) => setFormTitle(event.target.value)} required />
            </label>

            <label>
              <span>Description</span>
              <input value={formDescription} onChange={(event) => setFormDescription(event.target.value)} />
            </label>

            <label>
              <span>Exam Type</span>
              <select value={formExamType} onChange={(event) => setFormExamType(event.target.value)}>
                <option value="lab_quiz">Lab Quiz</option>
                <option value="lab_test">Lab Test</option>
              </select>
            </label>

            <label>
              <span>Duration (minutes)</span>
              <input
                type="number"
                min={1}
                max={300}
                value={formDuration}
                onChange={(event) => setFormDuration(event.target.value)}
                required
              />
            </label>

            <button type="submit" disabled={savingExam}>
              {savingExam ? "Saving..." : "Save Exam"}
            </button>
          </form>
        </section>

        {currentExamId ? (
          <section className="card teacher-panel">
            <div className="teacher-section-strip">
              <span className="teacher-section-tag">Live Room</span>
              <span className="teacher-section-note">Share code, track participants, and launch.</span>
            </div>
            <div className="card-head">
              <h3 className="teacher-title">Room & Participants</h3>
              <div className="actions-row">
                <button className="secondary" onClick={() => loadParticipants(currentExamId)}>
                  Refresh Participants
                </button>
                <button className="secondary" onClick={() => openQuestionManager(currentExamId, currentExamTitle)}>
                  Manage Questions
                </button>
              </div>
            </div>

            <div className="room-code-row top-spaced teacher-room-row">
              <span className="muted">Room Code:</span>
              <span className="room-code">{roomCode || "N/A"}</span>
              <button className="secondary" onClick={copyRoomCodeToClipboard} disabled={!roomCode}>
                Copy Code
              </button>
              <span className="badge">Status: {effectiveExamStatus || "created"}</span>
              <span className="badge">Type: {currentExamType || "lab_quiz"}</span>
              <button
                onClick={handleStartExamNow}
                disabled={!roomCode || effectiveExamStatus === "in_progress" || effectiveExamStatus === "completed"}
              >
                {effectiveExamStatus === "in_progress" ? "Exam In Progress" : "Start Exam"}
              </button>
            </div>

            {loadingParticipants ? <p className="muted top-spaced">Loading participants...</p> : null}
            {!loadingParticipants && participants.length === 0 ? (
              <p className="muted top-spaced">No students joined yet.</p>
            ) : null}

            {!loadingParticipants && participants.length > 0 ? (
              <ul className="list top-spaced teacher-list">
                {participants.map((participant) => (
                  <li key={participant.id} className="teacher-list-item">
                    <strong>{participant.student_name}</strong>
                    <span>{participant.student_email}</span>
                    <span>
                      Joined: {formatDateTime(participant.joined_at)} | Status: {participant.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>
    );
  }

  function renderQuestionManagerView() {
    return (
      <div className="content-stack teacher-stack">
        <section className="card teacher-panel">
          <div className="teacher-section-strip">
            <span className="teacher-section-tag">Question Studio</span>
            <span className="teacher-section-note">Author and maintain your question set.</span>
          </div>
          <div className="card-head">
            <h2 className="teacher-title">Questions: {currentExamTitle}</h2>
            <div className="actions-row">
              <button className="secondary" onClick={() => currentExamId && loadQuestionsForExam(currentExamId)}>
                Refresh
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setView("list");
                  loadExams();
                }}
              >
                Back to Exams
              </button>
            </div>
          </div>

          <div className="actions-row top-spaced">
            <button onClick={openAddQuestionForm}>Add Question</button>
          </div>

          {loadingQuestions ? <p className="muted top-spaced">Loading questions...</p> : null}
          {!loadingQuestions && questions.length === 0 ? (
            <p className="muted top-spaced">No questions found. Add your first question.</p>
          ) : null}

          {!loadingQuestions && questions.length > 0 ? (
            <ul className="list top-spaced teacher-list">
              {questions.map((question, index) => {
                const qType = normalizeQuestionType(question.question_type);
                return (
                  <li key={question.id} className="teacher-list-item">
                    <strong>
                      {index + 1}. {question.question_text}
                    </strong>
                    {question.image_url ? (
                      <img
                        className="question-inline-image"
                        src={resolveUploadUrl(question.image_url)}
                        alt={`Question ${index + 1}`}
                      />
                    ) : null}
                    <span>
                      Type: {qType === "written" ? "Written" : qType === "coding" ? "Coding" : "MCQ"} | Marks: {question.marks}
                    </span>
                    {qType === "mcq" ? (
                      <span>
                        Options: {(question.options || []).join(" | ")} | Correct:{" "}
                        {question.correct_answer !== undefined && question.correct_answer !== null
                          ? Number(question.correct_answer) + 1
                          : "N/A"}
                      </span>
                    ) : qType === "coding" ? (
                      <span>
                        Sample Input: {question.sample_input || "(none)"} | Sample Output: {question.sample_output || "(none)"}
                      </span>
                    ) : (
                      <span>Reference: {question.reference_answer || "No reference answer provided."}</span>
                    )}
                    <div className="actions-row teacher-actions">
                      <button className="secondary btn-inline" onClick={() => openEditQuestionForm(question)}>
                        Edit
                      </button>
                      <button className="btn-inline" onClick={() => handleDeleteQuestion(question.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        {questionFormVisible ? (
          <section className="card teacher-panel">
            <div className="teacher-section-strip">
              <span className="teacher-section-tag">Editor</span>
              <span className="teacher-section-note">Compose question content and grading data.</span>
            </div>
            <h3 className="teacher-title">{currentQuestionId ? "Edit Question" : "Add Question"}</h3>
            <form className="form-stack" onSubmit={handleSaveQuestion}>
              <label>
                <span>Question Type</span>
                <select
                  value={questionType}
                  onChange={(event) => {
                    const nextType = currentExamType === "lab_test"
                      ? "coding"
                      : normalizeQuestionType(event.target.value);
                    setQuestionType(nextType);
                    if (nextType === "written") {
                      setQuestionCorrectAnswer("");
                      setQuestionSampleInput("");
                      setQuestionSampleOutput("");
                      setQuestionStarterCode("");
                    } else if (nextType === "coding") {
                      setQuestionCorrectAnswer("");
                      setQuestionReferenceAnswer("");
                    } else {
                      setQuestionReferenceAnswer("");
                      setQuestionSampleInput("");
                      setQuestionSampleOutput("");
                      setQuestionStarterCode("");
                    }
                  }}
                  disabled={currentExamType === "lab_test"}
                >
                  <option value="mcq">MCQ</option>
                  <option value="written">Written (Descriptive)</option>
                  <option value="coding">Coding</option>
                </select>
              </label>

              <label>
                <span>Question Text</span>
                <input
                  type="text"
                  value={questionText}
                  onChange={(event) => setQuestionText(event.target.value)}
                  required
                />
              </label>

              {questionImage ? (
                <div className="option-image-preview">
                  <img src={resolveUploadUrl(questionImage)} alt="Question preview" />
                  <button type="button" className="secondary btn-inline" onClick={handleRemoveQuestionImage}>
                    Remove Image
                  </button>
                </div>
              ) : (
                <label>
                  <span>Question Image (optional)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    disabled={uploadingQuestionImage}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      handleQuestionImageUpload(file);
                      event.target.value = "";
                    }}
                  />
                  {uploadingQuestionImage ? <span className="muted small">Uploading...</span> : null}
                </label>
              )}

              {questionType === "mcq" ? (
                <>
                  {questionOptions.map((option, index) => (
                    <label key={`opt-${index}`}>
                      <span>Option {index + 1}</span>
                      <input
                        type="text"
                        value={option}
                        onChange={(event) => handleOptionChange(index, event.target.value)}
                        required
                      />
                    </label>
                  ))}

                  <label>
                    <span>Correct Answer</span>
                    <select
                      value={questionCorrectAnswer}
                      onChange={(event) => setQuestionCorrectAnswer(event.target.value)}
                      required
                    >
                      <option value="">Select correct answer</option>
                      <option value="0">Option 1</option>
                      <option value="1">Option 2</option>
                      <option value="2">Option 3</option>
                      <option value="3">Option 4</option>
                    </select>
                  </label>
                </>
              ) : questionType === "coding" ? (
                <>
                  <label>
                    <span>Sample Input (optional)</span>
                    <textarea
                      className="answer-textarea"
                      value={questionSampleInput}
                      onChange={(event) => setQuestionSampleInput(event.target.value)}
                      placeholder="Sample input for students..."
                    />
                  </label>

                  <label>
                    <span>Sample Output (optional)</span>
                    <textarea
                      className="answer-textarea"
                      value={questionSampleOutput}
                      onChange={(event) => setQuestionSampleOutput(event.target.value)}
                      placeholder="Expected sample output..."
                    />
                  </label>

                  <label>
                    <span>Starter Code (optional)</span>
                    <textarea
                      className="answer-textarea"
                      value={questionStarterCode}
                      onChange={(event) => setQuestionStarterCode(event.target.value)}
                      placeholder="Optional starter template code..."
                    />
                  </label>
                </>
              ) : (
                <label>
                  <span>Reference Answer (optional)</span>
                  <textarea
                    className="answer-textarea"
                    value={questionReferenceAnswer}
                    onChange={(event) => setQuestionReferenceAnswer(event.target.value)}
                    placeholder="Reference points for manual evaluation..."
                  />
                </label>
              )}

              <label>
                <span>Marks</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={questionMarks}
                  onChange={(event) => setQuestionMarks(event.target.value)}
                  required
                />
              </label>

              <div className="actions-row">
                <button type="submit" disabled={savingQuestion}>
                  {savingQuestion ? "Saving..." : "Save Question"}
                </button>
                <button className="secondary" type="button" onClick={resetQuestionForm}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </div>
    );
  }

  function renderEvaluationParticipantsView() {
    return (
      <section className="card teacher-panel">
        <div className="teacher-section-strip">
          <span className="teacher-section-tag">Evaluation Desk</span>
          <span className="teacher-section-note">Review submissions and score written answers.</span>
        </div>
        <div className="card-head">
          <h2 className="teacher-title">Evaluation: {currentExamTitle}</h2>
          <div className="actions-row">
            <button
              className="secondary"
              onClick={() => currentExamId && loadEvaluationParticipants(currentExamId)}
            >
              Refresh
            </button>
            <button
              className="secondary"
              onClick={() => {
                setView("list");
                loadExams();
              }}
            >
              Back to Exams
            </button>
          </div>
        </div>

        <p className="muted">
          Step 1: Choose a student from participants. Step 2: Evaluate written answers in their answer sheet.
        </p>

        {loadingEvaluationParticipants ? <p>Loading participants...</p> : null}
        {!loadingEvaluationParticipants && evaluationParticipants.length === 0 ? (
          <p className="muted">No participants found.</p>
        ) : null}

        <ul className="list teacher-list">
          {evaluationParticipants.map((participant) => {
            const submitted = Boolean(participant.submission_id);
            return (
              <li key={participant.participant_id} className="teacher-list-item">
                <div className="teacher-list-head">
                  <strong>{participant.student_name}</strong>
                  <span className={`teacher-chip ${submitted ? "teacher-chip-done" : "teacher-chip-wait"}`}>
                    {submitted ? "submitted" : "awaiting"}
                  </span>
                </div>
                <span>{participant.student_email}</span>
                <span>
                  Joined: {formatDateTime(participant.joined_at)} | Submission:{" "}
                  {submitted ? "Submitted" : "Not Submitted"}
                </span>
                <span>
                  Status: {participant.evaluation_status || "pending"} | Auto:{" "}
                  {participant.auto_score ?? 0} | Manual: {participant.manual_score ?? 0} | Total:{" "}
                  {participant.score ?? 0}
                </span>
                <div className="actions-row">
                  <button
                    className="secondary"
                    disabled={!submitted}
                    onClick={() => loadSubmissionSheet(participant.submission_id)}
                  >
                    {submitted ? "Open Answer Sheet" : "Awaiting Submission"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  function renderAnswerSheetView() {
    if (!selectedSubmissionSheet) return null;

    const violations = normalizeViolations(selectedSubmissionSheet.violations);
    const writtenItems = (selectedSubmissionSheet.answer_sheet || []).filter(
      (item) => normalizeQuestionType(item.question_type) === "written"
    );

    return (
      <div className="content-stack">
        <section className="card teacher-panel">
          <div className="teacher-section-strip">
            <span className="teacher-section-tag">Answer Sheet</span>
            <span className="teacher-section-note">Inspect responses and finalize manual marks.</span>
          </div>
          <div className="card-head">
            <h2>
              Answer Sheet: {selectedSubmissionSheet.student_name} ({selectedSubmissionSheet.student_email})
            </h2>
            <button className="secondary" onClick={() => setSelectedSubmissionSheet(null)}>
              Back to Participant List
            </button>
          </div>

          <div className="actions-row">
            <span className="score-pill">Auto: {selectedSubmissionSheet.auto_score}</span>
            <span className="score-pill">Manual: {selectedSubmissionSheet.manual_score}</span>
            <span className="score-pill">Total: {selectedSubmissionSheet.score}</span>
            <span className="score-pill">Status: {selectedSubmissionSheet.evaluation_status}</span>
          </div>

          <p className="muted small">Submitted at: {formatDateTime(selectedSubmissionSheet.submitted_at)}</p>
          <p className="muted small">Violations: {violations.length}</p>
        </section>

        {loadingSubmissionSheet ? <section className="card teacher-panel">Loading answer sheet...</section> : null}

        {!loadingSubmissionSheet ? (
          <section className="card teacher-panel">
            <h3 className="teacher-title">Answers</h3>
            <div className="question-stack">
              {(selectedSubmissionSheet.answer_sheet || []).map((item, index) => {
                const qType = normalizeQuestionType(item.question_type);
                const maxMarks = Number(item.max_marks) || 0;
                const selectedIdx =
                  item.selected_answer === undefined || item.selected_answer === null
                    ? null
                    : Number(item.selected_answer);

                return (
                  <article key={item.question_id} className="question-card teacher-question-card">
                    <p className="question-title">
                      {index + 1}. {item.question_text}
                    </p>
                    {item.image_url ? (
                      <img
                        className="question-inline-image"
                        src={resolveUploadUrl(item.image_url)}
                        alt={`Question ${index + 1}`}
                      />
                    ) : null}
                    <p className="muted small">
                      Type: {qType === "written" ? "Written" : "MCQ"} | Max Marks: {maxMarks}
                    </p>

                    {qType === "mcq" ? (
                      <>
                        <ul className="option-list">
                          {(item.options || []).map((option, optIndex) => (
                            <li
                              key={`${item.question_id}-${optIndex}`}
                              className={
                                Number(item.correct_answer) === optIndex
                                  ? "correct-option"
                                  : selectedIdx === optIndex
                                    ? "student-selected-option"
                                    : ""
                              }
                            >
                              {String.fromCharCode(65 + optIndex)}. {option}
                              {selectedIdx === optIndex ? "  [Student Selected]" : ""}
                            </li>
                          ))}
                        </ul>
                        <p className="muted small">
                          Auto evaluation: {item.is_correct ? "Correct" : "Wrong"} | Awarded:{" "}
                          {item.awarded_marks}/{maxMarks}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="written-preview">
                          <p className="muted small">Student answer:</p>
                          <p>{item.written_answer || "No answer provided."}</p>
                        </div>

                        <div className="written-preview">
                          <p className="muted small">Reference answer:</p>
                          <p>{item.reference_answer || "No reference answer provided."}</p>
                        </div>

                        <div className="evaluation-box">
                          <label>
                            <span>Awarded Marks</span>
                            <input
                              type="number"
                              min={0}
                              max={maxMarks}
                              value={writtenMarksDraft[item.question_id] ?? "0"}
                              onChange={(event) =>
                                handleWrittenMarkDraftChange(item.question_id, event.target.value, maxMarks)
                              }
                            />
                          </label>

                          <label>
                            <span>Evaluation Comment (optional)</span>
                            <textarea
                              className="answer-textarea"
                              value={writtenCommentDraft[item.question_id] || ""}
                              onChange={(event) =>
                                handleWrittenCommentDraftChange(item.question_id, event.target.value)
                              }
                              placeholder="Feedback for this written answer..."
                            />
                          </label>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>

            {writtenItems.length > 0 ? (
              <div className="actions-row top-spaced">
                <button onClick={saveWrittenEvaluation} disabled={savingEvaluation}>
                  {savingEvaluation ? "Saving..." : "Save Written Evaluation"}
                </button>
                <button className="secondary" onClick={() => loadSubmissionSheet(selectedSubmissionSheet.id)}>
                  Reload Sheet
                </button>
              </div>
            ) : (
              <p className="muted top-spaced">No written questions in this exam. MCQ evaluation is automatic.</p>
            )}
          </section>
        ) : null}
      </div>
    );
  }

  function renderSubmissionsView() {
    if (selectedSubmissionSheet) return renderAnswerSheetView();
    return renderEvaluationParticipantsView();
  }

  return (
    <section className={`teacher-ui teacher-view-${view}`}>
      {view === "form" ? renderExamFormView() : null}
      {view === "questions" ? renderQuestionManagerView() : null}
      {view === "submissions" ? renderSubmissionsView() : null}
      {view === "list" ? renderExamListView() : null}
    </section>
  );
}
