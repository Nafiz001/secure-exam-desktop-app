import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { apiRequest, apiUpload, resolveUploadUrl, API_BASE_URL } from "../../api";
import { useModal } from "../../components/modals/ModalProvider";
import AIAssistant from "./AIAssistant";
import {
  FaPlay,
  FaStop,
  FaSyncAlt,
  FaPlus,
  FaEdit,
  FaTrash,
  FaCopy,
  FaDownload,
  FaVideo,
  FaClipboardList,
  FaListUl,
  FaTimes,
  FaSave,
  FaUndo,
  FaRedo,
  FaLock,
  FaLockOpen,
  FaPaperPlane
} from "react-icons/fa";
import IconButton from "../../components/IconButton";
import { ExamListSkeleton, FormSkeleton, ListSkeleton } from "../../components/Skeletons";

function normalizeOptionsForEditing(rawOptions) {
  const base = Array.isArray(rawOptions) && rawOptions.length > 0 ? rawOptions : ["", "", "", ""];
  return [0, 1, 2, 3].map((i) => {
    const opt = base[i];
    if (opt && typeof opt === "object") return opt.text || "";
    return opt || "";
  });
}

function formatTimerDisplay(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function normalizeQuestionType(rawType) {
  const normalized = String(rawType || "mcq").toLowerCase();
  if (normalized === "written") return "written";
  if (normalized === "coding") return "coding";
  return "mcq";
}

// MCQs are scored automatically; written and coding answers both need the
// teacher to award marks by hand.
function isManuallyGraded(rawType) {
  return normalizeQuestionType(rawType) !== "mcq";
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

function getRemainingSeconds(startedAt, durationMinutes, referenceNow) {
  if (!startedAt) return 0;
  const startedAtMs = new Date(startedAt).getTime();
  const durationMs = Number(durationMinutes || 0) * 60 * 1000;
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(durationMs)) return 0;
  return Math.max(0, Math.floor((startedAtMs + durationMs - referenceNow) / 1000));
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

function getProctoringToneClass(status) {
  const normalized = String(status || "unknown").toLowerCase();
  if (normalized === "violation") return "proctor-tone-violation";
  if (normalized === "warning") return "proctor-tone-warning";
  if (normalized === "ok") return "proctor-tone-ok";
  return "proctor-tone-unknown";
}

const TeacherDashboard = forwardRef(function TeacherDashboard({ token, onViewChange }, ref) {
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
  const [formWebcamRequired, setFormWebcamRequired] = useState(false);
  const [formAllowMultipleAttempts, setFormAllowMultipleAttempts] = useState(false);
  const [formShowResultsToStudents, setFormShowResultsToStudents] = useState(false);
  const [formQuestionFlowMode, setFormQuestionFlowMode] = useState("all_at_once");
  const [formRandomizeQuestionOrder, setFormRandomizeQuestionOrder] = useState(false);
  const [examFormSnapshot, setExamFormSnapshot] = useState(null);
  const [loadingExamDetails, setLoadingExamDetails] = useState(false);
  const [restartingExam, setRestartingExam] = useState(false);
  const [duplicatingExam, setDuplicatingExam] = useState(false);
  const [liveTimerText, setLiveTimerText] = useState("--:--");
  const [busyExamId, setBusyExamId] = useState(null);
  const [busyParticipantId, setBusyParticipantId] = useState(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const [proctoringStudents, setProctoringStudents] = useState([]);
  const [loadingProctoring, setLoadingProctoring] = useState(false);
  const [selectedProctoringStudent, setSelectedProctoringStudent] = useState(null);
  const [proctoringEvents, setProctoringEvents] = useState([]);
  const [loadingProctoringEvents, setLoadingProctoringEvents] = useState(false);
  const proctoringPollRef = useRef(null);

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

  useEffect(() => {
    if (onViewChange) onViewChange(view);
  }, [view, onViewChange]);

  useImperativeHandle(ref, () => ({
    goBack() {
      if (view === "submissions" && selectedSubmissionSheet) {
        setSelectedSubmissionSheet(null);
      } else if (view === "proctoring") {
        clearProctoringPolling();
        setSelectedProctoringStudent(null);
        setProctoringEvents([]);
        setView("room");
        if (currentExamId) startParticipantPolling(currentExamId);
      } else if (view !== "list") {
        clearParticipantPolling();
        setView("list");
        loadExams();
      }
    }
  }));

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

  const loadProctoringStatus = useCallback(
    async (examId, { silent = false } = {}) => {
      if (!silent) setLoadingProctoring(true);
      try {
        const result = await apiRequest(`/proctoring/${examId}/students`, {}, token);
        setProctoringStudents(result.data.students || []);
      } catch (err) {
        if (!silent) {
          await showAlert({ title: "Error", message: err.message || "Failed to load proctoring data." });
        }
      } finally {
        if (!silent) setLoadingProctoring(false);
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
      clearProctoringPolling();
    };
  }, [clearParticipantPolling]);

  // Live countdown for the teacher while an exam is running — mirrors the
  // student-side timer so the teacher can see how much time is left without
  // switching screens.
  useEffect(() => {
    const status = getEffectiveExamStatus(examStatus, examStartedAt, formDuration);
    if (status !== "in_progress" || !examStartedAt) {
      setLiveTimerText("--:--");
      return undefined;
    }

    const startTime = new Date(examStartedAt);
    const endTime = new Date(startTime.getTime() + Number(formDuration || 0) * 60 * 1000);

    const tick = () => {
      const remaining = Math.floor((endTime - new Date()) / 1000);
      setLiveTimerText(formatTimerDisplay(remaining));
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [examStatus, examStartedAt, formDuration]);

  // Ticks once a second while the exam list is showing at least one running
  // exam, so per-card "Time Left" badges update without opening Edit.
  useEffect(() => {
    if (view !== "list") return undefined;
    const hasActiveExam = exams.some(
      (exam) => getEffectiveExamStatus(exam.status, exam.started_at, exam.duration) === "in_progress"
    );
    if (!hasActiveExam) return undefined;

    const intervalId = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [view, exams]);

  async function openCreateForm() {
    clearParticipantPolling();
    clearProctoringPolling();
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
    setFormWebcamRequired(false);
    setFormAllowMultipleAttempts(false);
    setFormShowResultsToStudents(false);
    setFormQuestionFlowMode("all_at_once");
    setFormRandomizeQuestionOrder(false);
    setExamFormSnapshot({
      formTitle: "",
      formDescription: "",
      formExamType: "lab_quiz",
      formDuration: "60",
      formWebcamRequired: false,
      formAllowMultipleAttempts: false,
      formShowResultsToStudents: false,
      formQuestionFlowMode: "all_at_once",
      formRandomizeQuestionOrder: false
    });
    setView("form");
  }

  async function loadExamIntoEditor(examId, targetView) {
    clearParticipantPolling();
    clearProctoringPolling();
    // Switch screens first so the click feels instant and the skeleton covers
    // the fetch, instead of sitting on the old screen until it resolves.
    setLoadingExamDetails(true);
    setView(targetView);
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
      setFormWebcamRequired(Boolean(exam.webcam_required));
      setFormAllowMultipleAttempts(Boolean(exam.allow_multiple_attempts));
      setFormShowResultsToStudents(Boolean(exam.show_results_to_students));
      setFormQuestionFlowMode(exam.question_flow_mode === "one_by_one" ? "one_by_one" : "all_at_once");
      setFormRandomizeQuestionOrder(Boolean(exam.randomize_question_order));
      setExamFormSnapshot({
        formTitle: exam.title || "",
        formDescription: exam.description || "",
        formExamType: exam.exam_type || "lab_quiz",
        formDuration: String(exam.duration || 60),
        formWebcamRequired: Boolean(exam.webcam_required),
        formAllowMultipleAttempts: Boolean(exam.allow_multiple_attempts),
        formShowResultsToStudents: Boolean(exam.show_results_to_students),
        formQuestionFlowMode: exam.question_flow_mode === "one_by_one" ? "one_by_one" : "all_at_once",
        formRandomizeQuestionOrder: Boolean(exam.randomize_question_order)
      });
      if (exam.room_code) {
        startParticipantPolling(exam.id);
      } else {
        setParticipants([]);
      }
    } catch (err) {
      // Nothing loaded, so don't strand the user on an empty editor.
      setView("list");
      await showAlert({
        title: "Error",
        message: err.message || "Failed to load exam details."
      });
    } finally {
      setLoadingExamDetails(false);
    }
  }

  async function openEditForm(examId) {
    return loadExamIntoEditor(examId, "form");
  }

  async function openLiveRoom(examId) {
    return loadExamIntoEditor(examId, "room");
  }

  async function handleDeleteExam(examId, title) {
    const confirmed = await showConfirm({
      title: "Delete Exam",
      message: `Delete "${title}"? This action cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      danger: true
    });
    if (!confirmed) return;

    try {
      await apiRequest(`/exams/${examId}`, { method: "DELETE" }, token);
      if (examId === currentExamId) {
        clearParticipantPolling();
        clearProctoringPolling();
        setCurrentExamId(null);
        setCurrentExamTitle("");
        setView("list");
      }
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
        {
          method,
          body: JSON.stringify({
            title,
            description: formDescription,
            exam_type: examType,
            duration,
            webcam_required: formWebcamRequired,
            allow_multiple_attempts: formAllowMultipleAttempts,
            show_results_to_students: formShowResultsToStudents,
            question_flow_mode: formQuestionFlowMode,
            randomize_question_order: formRandomizeQuestionOrder
          })
        },
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
      setFormWebcamRequired(Boolean(exam.webcam_required));
      setFormAllowMultipleAttempts(Boolean(exam.allow_multiple_attempts));
      setFormShowResultsToStudents(Boolean(exam.show_results_to_students));
      setFormQuestionFlowMode(exam.question_flow_mode === "one_by_one" ? "one_by_one" : "all_at_once");
      setFormRandomizeQuestionOrder(Boolean(exam.randomize_question_order));
      await loadExams();

      if (isNewExam) {
        await openQuestionManager(exam.id, exam.title || title);
      } else {
        clearParticipantPolling();
        setView("list");
      }
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to save exam." });
    } finally {
      setSavingExam(false);
    }
  }

  function handleUndoExamForm() {
    if (!examFormSnapshot) return;
    setFormTitle(examFormSnapshot.formTitle);
    setFormDescription(examFormSnapshot.formDescription);
    setFormExamType(examFormSnapshot.formExamType);
    setFormDuration(examFormSnapshot.formDuration);
    setFormWebcamRequired(examFormSnapshot.formWebcamRequired);
    setFormAllowMultipleAttempts(examFormSnapshot.formAllowMultipleAttempts);
    setFormShowResultsToStudents(examFormSnapshot.formShowResultsToStudents);
    setFormQuestionFlowMode(examFormSnapshot.formQuestionFlowMode);
    setFormRandomizeQuestionOrder(examFormSnapshot.formRandomizeQuestionOrder);
  }

  async function handleStartExamById(examId) {
    const confirmed = await showConfirm({
      title: "Start Exam",
      message: "Are you sure you want to start the exam? All joined students will begin immediately.",
      confirmText: "Start",
      cancelText: "Cancel"
    });
    if (!confirmed) return;

    setBusyExamId(examId);
    try {
      const result = await apiRequest(`/exams/${examId}/start`, { method: "POST" }, token);
      await loadExams();
      if (examId === currentExamId) {
        setExamStatus("in_progress");
        setExamStartedAt(result?.data?.started_at || new Date().toISOString());
      }
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to start exam." });
    } finally {
      setBusyExamId(null);
    }
  }

  async function handleForceSubmitParticipant(participant) {
    if (!currentExamId || !participant?.id) return;
    const confirmed = await showConfirm({
      title: "Force Submit",
      message: `Submit ${participant.student_name}'s exam for them? Their current answers are saved and they can't continue.`,
      confirmText: "Force Submit",
      cancelText: "Cancel",
      danger: true
    });
    if (!confirmed) return;

    setBusyParticipantId(participant.id);
    try {
      await apiRequest(
        `/exams/${currentExamId}/participants/${participant.id}/force-submit`,
        { method: "POST" },
        token
      );
      await loadParticipants(currentExamId);
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to force submit." });
    } finally {
      setBusyParticipantId(null);
    }
  }

  async function handleToggleFreezeParticipant(participant) {
    if (!currentExamId || !participant?.id) return;
    const freezing = !participant.is_frozen;
    const confirmed = await showConfirm({
      title: freezing ? "Freeze Screen" : "Unfreeze Screen",
      message: freezing
        ? `Lock ${participant.student_name}'s exam screen? They can't answer anything until you unfreeze them.`
        : `Let ${participant.student_name} carry on with their exam?`,
      confirmText: freezing ? "Freeze" : "Unfreeze",
      cancelText: "Cancel",
      danger: freezing
    });
    if (!confirmed) return;

    setBusyParticipantId(participant.id);
    try {
      await apiRequest(
        `/exams/${currentExamId}/participants/${participant.id}/toggle-freeze`,
        { method: "POST" },
        token
      );
      await loadParticipants(currentExamId);
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to update freeze state." });
    } finally {
      setBusyParticipantId(null);
    }
  }

  async function handleStopExamById(examId) {
    const confirmed = await showConfirm({
      title: "Stop Exam",
      message: "End this exam right now for everyone? Students still taking it will be auto-submitted with their current answers.",
      confirmText: "Stop Exam",
      cancelText: "Cancel",
      danger: true
    });
    if (!confirmed) return;

    setBusyExamId(examId);
    try {
      await apiRequest(`/exams/${examId}/stop`, { method: "POST" }, token);
      await loadExams();
      if (examId === currentExamId) {
        setExamStatus("completed");
      }
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to stop exam." });
    } finally {
      setBusyExamId(null);
    }
  }

  async function handleRestartExam() {
    if (!currentExamId) return;
    const confirmed = await showConfirm({
      title: "Restart Exam",
      message:
        "This reopens the exam so students can rejoin with the same room code. " +
        (formAllowMultipleAttempts
          ? "Since \"Allow multiple attempts\" is on, students who already submitted can submit again."
          : "Students who already submitted still can't submit again unless you enable \"Allow multiple attempts\"."),
      confirmText: "Restart",
      cancelText: "Cancel"
    });
    if (!confirmed) return;

    setRestartingExam(true);
    try {
      const result = await apiRequest(`/exams/${currentExamId}/restart`, { method: "POST" }, token);
      const exam = result.data.exam;
      setExamStatus(exam.status || "created");
      setExamStartedAt(exam.started_at || null);
      await loadExams();
      await showAlert({ title: "Success", message: "Exam restarted. The room code is active again." });
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to restart exam." });
    } finally {
      setRestartingExam(false);
    }
  }

  async function handleDuplicateExam(examId, examTitle) {
    const confirmed = await showConfirm({
      title: "Duplicate Exam",
      message: `Create a copy of "${examTitle}" with a new room code and the same questions?`,
      confirmText: "Duplicate",
      cancelText: "Cancel"
    });
    if (!confirmed) return;

    setDuplicatingExam(true);
    try {
      const result = await apiRequest(`/exams/${examId}/duplicate`, { method: "POST" }, token);
      const exam = result.data.exam;
      await loadExams();
      await showAlert({ title: "Success", message: `Duplicated as "${exam.title}" (room code ${exam.room_code}).` });
      await openEditForm(exam.id);
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to duplicate exam." });
    } finally {
      setDuplicatingExam(false);
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
    clearProctoringPolling();
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
    clearProctoringPolling();
    setCurrentExamId(examId);
    setCurrentExamTitle(examTitle);
    setSelectedSubmissionSheet(null);
    setWrittenMarksDraft({});
    setWrittenCommentDraft({});
    setView("submissions");
    await loadEvaluationParticipants(examId);
  }

  function clearProctoringPolling() {
    if (proctoringPollRef.current) {
      clearInterval(proctoringPollRef.current);
      proctoringPollRef.current = null;
    }
  }

  async function openProctoringView(examId, examTitle) {
    clearParticipantPolling();
    clearProctoringPolling();
    setCurrentExamId(examId);
    setCurrentExamTitle(examTitle);
    setSelectedProctoringStudent(null);
    setProctoringEvents([]);
    setView("proctoring");
    await loadProctoringStatus(examId);
    proctoringPollRef.current = setInterval(() => {
      loadProctoringStatus(examId, { silent: true });
    }, 3000);
  }

  async function loadStudentProctoringEvents(student) {
    setSelectedProctoringStudent(student);
    setProctoringEvents([]);
    setLoadingProctoringEvents(true);
    try {
      const result = await apiRequest(`/proctoring/${currentExamId}/events/${student.student_id}`, {}, token);
      setProctoringEvents(result.data.events || []);
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to load event log." });
    } finally {
      setLoadingProctoringEvents(false);
    }
  }

  async function downloadResultsCsv(examId) {
    if (!examId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/exams/${examId}/export-results.csv`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Export failed (${response.status})`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = /filename="?([^";]+)"?/.exec(disposition);
      const filename = match ? match[1] : `exam_${examId}_results_${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Could not download results CSV." });
    }
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
      cancelText: "Cancel",
      danger: true
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

    const writtenItems = (selectedSubmissionSheet.answer_sheet || []).filter((item) =>
      isManuallyGraded(item.question_type)
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
          <h2 className="teacher-title">Teacher Dashboard</h2>
          <div className="actions-row teacher-toolbar">
            <IconButton
              icon={<FaSyncAlt className={loadingExams ? "spin" : ""} />}
              label="Refresh"
              onClick={loadExams}
              disabled={loadingExams}
            />
            <IconButton icon={<FaPlus />} label="Create New Exam" variant="primary" onClick={openCreateForm} />
          </div>
        </div>

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

        {/* Only on first load — during a refresh the existing list stays put
            and the spinning refresh icon signals the activity. */}
        {loadingExams && exams.length === 0 ? <ExamListSkeleton /> : null}
        {!loadingExams && exams.length === 0 ? (
          <p className="muted">No exams yet — use the + button above to create your first one.</p>
        ) : null}

        <ul className="list teacher-list">
          {exams.map((exam) => {
            const effectiveStatus = getEffectiveExamStatus(exam.status, exam.started_at, exam.duration);
            return (
            <li key={exam.id} className="teacher-list-item">
              <div className="teacher-list-head">
                <strong
                  className="teacher-exam-title-link"
                  role="button"
                  tabIndex={0}
                  onClick={() => openLiveRoom(exam.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openLiveRoom(exam.id);
                    }
                  }}
                >
                  {exam.title}
                </strong>
                <div className="teacher-list-head-right">
                  {effectiveStatus === "in_progress" ? (
                    <span className="teacher-meta-chip teacher-live-chip">
                      Time Left: {formatTimerDisplay(getRemainingSeconds(exam.started_at, exam.duration, nowTick))}
                    </span>
                  ) : null}
                  {effectiveStatus === "in_progress" ? (
                    <button
                      type="button"
                      className="exam-run-toggle exam-run-toggle-stop"
                      onClick={() => handleStopExamById(exam.id)}
                      disabled={busyExamId === exam.id}
                      title="Stop Exam"
                      aria-label="Stop Exam"
                    >
                      {busyExamId === exam.id ? (
                        <span className="exam-run-toggle-spinner" aria-hidden="true" />
                      ) : (
                        <FaStop size={22} />
                      )}
                    </button>
                  ) : effectiveStatus === "created" || effectiveStatus === "waiting" ? (
                    <button
                      type="button"
                      className="exam-run-toggle exam-run-toggle-play"
                      onClick={() => handleStartExamById(exam.id)}
                      disabled={busyExamId === exam.id || !exam.room_code}
                      title="Start Exam"
                      aria-label="Start Exam"
                    >
                      {busyExamId === exam.id ? (
                        <span className="exam-run-toggle-spinner" aria-hidden="true" />
                      ) : (
                        <FaPlay size={22} />
                      )}
                    </button>
                  ) : null}
                  <span className={`teacher-chip ${getStatusToneClass(effectiveStatus)}`}>
                    {String(effectiveStatus || "created").replace("_", " ")}
                  </span>
                </div>
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
                <IconButton
                  icon={<FaEdit />}
                  label="Edit Exam"
                  onClick={() => openEditForm(exam.id)}
                />
                <IconButton
                  icon={<FaListUl />}
                  label="Questions"
                  onClick={() => openQuestionManager(exam.id, exam.title)}
                />
                <IconButton
                  icon={<FaClipboardList />}
                  label="Evaluation"
                  onClick={() => openSubmissionsView(exam.id, exam.title)}
                />
                <IconButton
                  icon={<FaCopy />}
                  label="Duplicate Exam"
                  onClick={() => handleDuplicateExam(exam.id, exam.title)}
                  disabled={duplicatingExam}
                />
                <IconButton
                  icon={<FaTrash />}
                  label="Delete Exam"
                  variant="danger"
                  onClick={() => handleDeleteExam(exam.id, exam.title)}
                />
              </div>
            </li>
            );
          })}
        </ul>
      </section>
    );
  }

  function renderExamFormView() {
    return (
      <div className="content-stack teacher-stack">
        <section className="card teacher-panel">
          <div className="teacher-section-strip">
            <span className="teacher-section-tag">Exam Setup</span>
            <span className="teacher-section-note">Configure exam details and scheduling.</span>
          </div>
          <div className="card-head">
            <h2 className="teacher-title">{currentExamId ? "Edit Exam" : "Create Exam"}</h2>
          </div>

          {loadingExamDetails ? <FormSkeleton fields={6} /> : null}

          <form className="form-stack" hidden={loadingExamDetails} onSubmit={handleSaveExam}>
            <label>
              <span>Exam Title</span>
              <input value={formTitle} onChange={(event) => setFormTitle(event.target.value)} required />
            </label>

            <label>
              <span>Description</span>
              <textarea
                className="question-text-input"
                value={formDescription}
                onChange={(event) => setFormDescription(event.target.value)}
                rows={4}
              />
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

            <label>
              <span>Question Flow</span>
              <select
                value={formQuestionFlowMode}
                onChange={(event) => setFormQuestionFlowMode(event.target.value)}
              >
                <option value="all_at_once">Show all questions at once</option>
                <option value="one_by_one">Show one question at a time</option>
              </select>
            </label>

            <div className="settings-grid">
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={formWebcamRequired}
                  onChange={(event) => setFormWebcamRequired(event.target.checked)}
                />
                <span>
                  <strong>Require webcam proctoring</strong>
                  <small>Face detection will monitor for suspicious activity during the exam.</small>
                </span>
              </label>

              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={formAllowMultipleAttempts}
                  onChange={(event) => setFormAllowMultipleAttempts(event.target.checked)}
                />
                <span>
                  <strong>Allow multiple attempts</strong>
                  <small>Students can submit again, replacing their previous attempt (e.g. after you restart the exam).</small>
                </span>
              </label>

              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={formShowResultsToStudents}
                  onChange={(event) => setFormShowResultsToStudents(event.target.checked)}
                />
                <span>
                  <strong>Show results to students</strong>
                  <small>Off by default — students see "submitted successfully" only, no score, until you turn this on.</small>
                </span>
              </label>

              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={formRandomizeQuestionOrder}
                  onChange={(event) => setFormRandomizeQuestionOrder(event.target.checked)}
                />
                <span>
                  <strong>Randomize question order per student</strong>
                  <small>Each student gets a shuffled but consistent question order, to discourage copying.</small>
                </span>
              </label>
            </div>

            <div className="actions-row centered top-spaced">
              <IconButton
                type="submit"
                icon={savingExam ? <span className="exam-run-toggle-spinner" aria-hidden="true" /> : <FaSave />}
                label={savingExam ? "Saving..." : "Save Exam"}
                variant="primary"
                disabled={savingExam}
              />
              <IconButton
                type="button"
                icon={<FaUndo />}
                label="Undo Changes"
                onClick={handleUndoExamForm}
                disabled={savingExam || !examFormSnapshot}
              />
            </div>
          </form>
        </section>
      </div>
    );
  }

  function renderLiveRoomView() {
    const effectiveExamStatus = getEffectiveExamStatus(examStatus, examStartedAt, formDuration);

    if (loadingExamDetails) {
      return (
        <div className="content-stack teacher-stack">
          <section className="card teacher-panel">
            <div className="teacher-section-strip">
              <span className="teacher-section-tag">Live Room</span>
              <span className="teacher-section-note">Share code, track participants, and launch.</span>
            </div>
            <FormSkeleton fields={2} />
            <ListSkeleton rows={2} />
          </section>
        </div>
      );
    }

    return (
      <div className="content-stack teacher-stack">
        <section className="card teacher-panel">
          <div className="teacher-section-strip">
            <span className="teacher-section-tag">Live Room</span>
            <span className="teacher-section-note">Share code, track participants, and launch.</span>
          </div>
          <div className="card-head">
            <h3 className="teacher-title">Room & Participants: {currentExamTitle}</h3>
            <div className="actions-row">
              <IconButton
                icon={<FaSyncAlt />}
                label="Refresh Participants"
                onClick={() => loadParticipants(currentExamId)}
              />
              <IconButton
                icon={<FaListUl />}
                label="Manage Questions"
                onClick={() => openQuestionManager(currentExamId, currentExamTitle)}
              />
              {formWebcamRequired ? (
                <IconButton
                  icon={<FaVideo />}
                  label="Proctoring"
                  onClick={() => openProctoringView(currentExamId, currentExamTitle)}
                />
              ) : null}
              <IconButton
                icon={<FaDownload />}
                label="Export Results (CSV)"
                onClick={() => downloadResultsCsv(currentExamId)}
              />
              <IconButton
                icon={<FaCopy />}
                label={duplicatingExam ? "Duplicating..." : "Duplicate Exam"}
                onClick={() => handleDuplicateExam(currentExamId, currentExamTitle || formTitle || "Exam")}
                disabled={duplicatingExam}
              />
              <IconButton
                icon={<FaTrash />}
                label="Delete Exam"
                variant="danger"
                onClick={() => handleDeleteExam(currentExamId, currentExamTitle || formTitle || "Exam")}
              />
            </div>
          </div>

          <div className="room-code-row top-spaced teacher-room-row">
            <span className="muted">Room Code:</span>
            <span className="room-code">{roomCode || "N/A"}</span>
            <IconButton
              icon={<FaCopy />}
              label="Copy Code"
              onClick={copyRoomCodeToClipboard}
              disabled={!roomCode}
            />
            <span className="badge">Status: {effectiveExamStatus || "created"}</span>
            <span className="badge">Type: {currentExamType || "lab_quiz"}</span>
            {effectiveExamStatus === "in_progress" ? (
              <span className="badge">Time Left: {liveTimerText}</span>
            ) : null}
            {effectiveExamStatus === "completed" ? (
              <IconButton
                icon={restartingExam ? <span className="exam-run-toggle-spinner" aria-hidden="true" /> : <FaRedo />}
                label={restartingExam ? "Restarting..." : "Restart Exam"}
                variant="primary"
                onClick={handleRestartExam}
                disabled={restartingExam}
              />
            ) : effectiveExamStatus === "in_progress" ? (
              <button
                type="button"
                className="exam-run-toggle exam-run-toggle-stop"
                onClick={() => handleStopExamById(currentExamId)}
                disabled={busyExamId === currentExamId}
                title="Stop Exam"
                aria-label="Stop Exam"
              >
                {busyExamId === currentExamId ? (
                  <span className="exam-run-toggle-spinner" aria-hidden="true" />
                ) : (
                  <FaStop size={22} />
                )}
              </button>
            ) : (
              <button
                type="button"
                className="exam-run-toggle exam-run-toggle-play"
                onClick={() => handleStartExamById(currentExamId)}
                disabled={busyExamId === currentExamId || !roomCode}
                title="Start Exam"
                aria-label="Start Exam"
              >
                {busyExamId === currentExamId ? (
                  <span className="exam-run-toggle-spinner" aria-hidden="true" />
                ) : (
                  <FaPlay size={22} />
                )}
              </button>
            )}
          </div>

          {loadingParticipants ? <ListSkeleton rows={2} lines={2} /> : null}
          {!loadingParticipants && participants.length === 0 ? (
            <p className="muted top-spaced">No students joined yet.</p>
          ) : null}

          {!loadingParticipants && participants.length > 0 ? (
            <ul className="list top-spaced teacher-list">
              {participants.map((participant) => {
                const isFrozen = Boolean(participant.is_frozen);
                const isDone = String(participant.status || "").toLowerCase() === "completed";
                return (
                  <li key={participant.id} className="teacher-list-item">
                    <div className="teacher-list-head">
                      <strong>{participant.student_name}</strong>
                      <div className="teacher-list-head-right">
                        {isFrozen ? <span className="teacher-chip teacher-chip-created">frozen</span> : null}
                        <span className={`teacher-chip ${isDone ? "teacher-chip-done" : "teacher-chip-wait"}`}>
                          {participant.status}
                        </span>
                      </div>
                    </div>
                    <span>{participant.student_email}</span>
                    <span>Joined: {formatDateTime(participant.joined_at)}</span>
                    {!isDone ? (
                      <div className="actions-row teacher-actions">
                        <IconButton
                          icon={isFrozen ? <FaLockOpen /> : <FaLock />}
                          label={isFrozen ? "Unfreeze Screen" : "Freeze Screen"}
                          onClick={() => handleToggleFreezeParticipant(participant)}
                          disabled={busyParticipantId === participant.id}
                        />
                        <IconButton
                          icon={<FaPaperPlane />}
                          label="Force Submit"
                          variant="danger"
                          onClick={() => handleForceSubmitParticipant(participant)}
                          disabled={busyParticipantId === participant.id}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      </div>
    );
  }

  function renderQuestionManagerView() {
    return (
      <div className="content-stack teacher-stack">
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
                <textarea
                  className="question-text-input"
                  value={questionText}
                  onChange={(event) => setQuestionText(event.target.value)}
                  rows={6}
                  required
                />
              </label>

              {questionImage ? (
                <div className="option-image-preview">
                  <img src={resolveUploadUrl(questionImage)} alt="Question preview" />
                  <IconButton
                    icon={<FaTrash />}
                    label="Remove Image"
                    variant="danger"
                    onClick={handleRemoveQuestionImage}
                  />
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

        <section className="card teacher-panel">
          <div className="teacher-section-strip">
            <span className="teacher-section-tag">Question Studio</span>
            <span className="teacher-section-note">Author and maintain your question set.</span>
          </div>
          <div className="card-head">
            <h2 className="teacher-title">Questions: {currentExamTitle}</h2>
            <div className="actions-row">
              <IconButton
                icon={<FaSyncAlt className={loadingQuestions ? "spin" : ""} />}
                label="Refresh"
                onClick={() => currentExamId && loadQuestionsForExam(currentExamId)}
              />
            </div>
          </div>

          <div className="actions-row top-spaced">
            <IconButton icon={<FaPlus />} label="Add Question" variant="primary" onClick={openAddQuestionForm} />
          </div>

          {loadingQuestions ? <ListSkeleton rows={3} lines={2} /> : null}
          {!loadingQuestions && questions.length === 0 ? (
            <p className="muted top-spaced">No questions found. Add your first question.</p>
          ) : null}

          {!loadingQuestions && questions.length > 0 ? (
            <ul className="list top-spaced teacher-list">
              {questions.map((question, index) => {
                const qType = normalizeQuestionType(question.question_type);
                return (
                  <li key={question.id} className="teacher-list-item">
                    <strong className="question-text-block">
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
                      <IconButton icon={<FaEdit />} label="Edit Question" onClick={() => openEditQuestionForm(question)} />
                      <IconButton
                        icon={<FaTrash />}
                        label="Delete Question"
                        variant="danger"
                        onClick={() => handleDeleteQuestion(question.id)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
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
            <IconButton
              icon={<FaSyncAlt className={loadingEvaluationParticipants ? "spin" : ""} />}
              label="Refresh"
              onClick={() => currentExamId && loadEvaluationParticipants(currentExamId)}
            />
          </div>
        </div>

        <p className="muted">
          Step 1: Choose a student from participants. Step 2: Evaluate written answers in their answer sheet.
        </p>

        {loadingEvaluationParticipants ? <ListSkeleton rows={3} lines={2} /> : null}
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
                <span>Joined: {formatDateTime(participant.joined_at)}</span>
                {submitted ? (
                  <span>
                    Marking: {participant.evaluation_status || "pending"} | Auto:{" "}
                    {participant.auto_score ?? 0} | Manual: {participant.manual_score ?? 0} | Total:{" "}
                    {participant.score ?? 0}
                  </span>
                ) : null}
                {submitted ? (
                  <div className="actions-row">
                    <button className="secondary" onClick={() => loadSubmissionSheet(participant.submission_id)}>
                      Open Answer Sheet
                    </button>
                  </div>
                ) : null}
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
    const writtenItems = (selectedSubmissionSheet.answer_sheet || []).filter((item) =>
      isManuallyGraded(item.question_type)
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

        {loadingSubmissionSheet ? (<section className="card teacher-panel"><ListSkeleton rows={3} lines={3} /></section>) : null}

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
                    <p className="question-title question-text-block">
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
                      Type: {qType === "written" ? "Written" : qType === "coding" ? "Coding" : "MCQ"} | Max Marks:{" "}
                      {maxMarks}
                      {qType === "coding" && item.language ? ` | Language: ${item.language}` : ""}
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
                          <p className="muted small">{qType === "coding" ? "Student code:" : "Student answer:"}</p>
                          {qType === "coding" ? (
                            <pre>{item.written_answer || "No code submitted."}</pre>
                          ) : (
                            <p className="question-text-block">{item.written_answer || "No answer provided."}</p>
                          )}
                        </div>

                        <div className="written-preview">
                          <p className="muted small">Reference answer:</p>
                          {qType === "coding" ? (
                            <pre>{item.reference_answer || "No reference answer provided."}</pre>
                          ) : (
                            <p className="question-text-block">
                              {item.reference_answer || "No reference answer provided."}
                            </p>
                          )}
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
              <div className="actions-row centered top-spaced">
                <IconButton
                  icon={savingEvaluation ? <span className="exam-run-toggle-spinner" aria-hidden="true" /> : <FaSave />}
                  label={savingEvaluation ? "Saving..." : "Save Evaluation"}
                  variant="primary"
                  onClick={saveWrittenEvaluation}
                  disabled={savingEvaluation}
                />
                <IconButton
                  icon={<FaSyncAlt className={loadingSubmissionSheet ? "spin" : ""} />}
                  label="Reload Sheet"
                  onClick={() => loadSubmissionSheet(selectedSubmissionSheet.id)}
                />
              </div>
            ) : (
              <p className="muted top-spaced">This exam is all MCQ — scoring is automatic, nothing to grade by hand.</p>
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

  function renderProctoringView() {
    const violations = proctoringStudents.filter((s) => s.proctoring_status === "violation").length;
    const warnings = proctoringStudents.filter((s) => s.proctoring_status === "warning").length;
    const okCount = proctoringStudents.length - violations - warnings;

    return (
      <div className="content-stack teacher-stack">
        <section className="card teacher-panel">
          <div className="teacher-section-strip">
            <span className="teacher-section-tag">Live Monitor</span>
            <span className="teacher-section-note">Auto-refreshes every 3 seconds with the latest snapshots.</span>
          </div>
          <div className="card-head">
            <h2 className="teacher-title">Proctoring: {currentExamTitle}</h2>
          </div>

          <div className="actions-row top-spaced">
            <span className="teacher-chip teacher-chip-done">OK {okCount}</span>
            <span className="teacher-chip teacher-chip-wait">Warning {warnings}</span>
            <span className="teacher-chip teacher-chip-created">Violation {violations}</span>
            <span className="muted">{proctoringStudents.length} total students</span>
          </div>
        </section>

        {loadingProctoring && proctoringStudents.length === 0 ? (
          <ListSkeleton rows={2} lines={1} />
        ) : proctoringStudents.length === 0 ? (
          <section className="card teacher-panel">
            <p className="muted">No students are in this exam yet. Once students join, their live feeds appear here.</p>
          </section>
        ) : (
          <div className="proctor-grid">
            {proctoringStudents.map((s) => {
              const isSelected = selectedProctoringStudent?.student_id === s.student_id;
              const tone = s.proctoring_status || "unknown";
              return (
                <div key={s.student_id} className={`proctor-card ${getProctoringToneClass(tone)} ${isSelected ? "proctor-card-selected" : ""}`}>
                  <div className="proctor-card-thumb">
                    {s.snapshot_base64 ? (
                      <img src={s.snapshot_base64} alt={s.student_name} />
                    ) : (
                      <span className="muted small">No feed</span>
                    )}
                    <span className="proctor-card-badge proctor-card-badge-left">{tone}</span>
                    <span className="proctor-card-badge proctor-card-badge-right">
                      {s.face_count} {Number(s.face_count) === 1 ? "face" : "faces"}
                    </span>
                  </div>
                  <div className="proctor-card-body">
                    <p className="proctor-card-name" title={s.student_name}>{s.student_name}</p>
                    <div className="actions-row">
                      {Number(s.no_face_count) > 0 ? (
                        <span className="teacher-chip teacher-chip-wait">Away x{s.no_face_count}</span>
                      ) : null}
                      {Number(s.multiple_faces_count) > 0 ? (
                        <span className="teacher-chip teacher-chip-created">Multi x{s.multiple_faces_count}</span>
                      ) : null}
                      {Number(s.looking_away_count) > 0 ? (
                        <span className="teacher-chip teacher-chip-wait">Look x{s.looking_away_count}</span>
                      ) : null}
                      {Number(s.looking_down_count) > 0 ? (
                        <span className="teacher-chip teacher-chip-wait">Down x{s.looking_down_count}</span>
                      ) : null}
                      {Number(s.total_events) === 0 ? <span className="teacher-chip teacher-chip-done">Clean</span> : null}
                    </div>
                    <button
                      className="secondary btn-inline"
                      onClick={() => (isSelected ? setSelectedProctoringStudent(null) : loadStudentProctoringEvents(s))}
                    >
                      {isSelected ? "Close log" : `Events (${s.total_events})`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedProctoringStudent ? (
          <section className="card teacher-panel">
            <div className="card-head">
              <h3 className="teacher-title">Event log: {selectedProctoringStudent.student_name}</h3>
              <IconButton icon={<FaTimes />} label="Close" onClick={() => setSelectedProctoringStudent(null)} />
            </div>
            {loadingProctoringEvents ? (
              <p className="muted top-spaced">Loading events...</p>
            ) : proctoringEvents.length === 0 ? (
              <p className="muted top-spaced">No events recorded. This student has had a clean session so far.</p>
            ) : (
              <ul className="list top-spaced teacher-list">
                {proctoringEvents.map((ev) => (
                  <li key={ev.id} className="teacher-list-item">
                    <strong>{String(ev.event_type || "").replace(/_/g, " ")}</strong>
                    <span>{formatDateTime(ev.created_at)}</span>
                    {ev.details ? <span className="muted small">{ev.details}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <section className={`teacher-ui teacher-view-${view}`}>
      {view === "form" ? renderExamFormView() : null}
      {view === "room" ? renderLiveRoomView() : null}
      {view === "questions" ? renderQuestionManagerView() : null}
      {view === "submissions" ? renderSubmissionsView() : null}
      {view === "proctoring" ? renderProctoringView() : null}
      {view === "list" ? renderExamListView() : null}

      <AIAssistant
        token={token}
        currentExamId={currentExamId}
        currentExamTitle={currentExamTitle}
        currentExamType={currentExamType}
        formDuration={formDuration}
        onQuestionAdded={
          view === "questions" && currentExamId ? () => loadQuestionsForExam(currentExamId) : null
        }
      />
    </section>
  );
});

export default TeacherDashboard;
