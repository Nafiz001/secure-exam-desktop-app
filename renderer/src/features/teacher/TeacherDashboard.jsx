import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw,
  Plus,
  ArrowLeft,
  Pencil,
  Trash2,
  Copy,
  Play,
  ListChecks,
  ClipboardCheck,
  Eye,
  EyeOff,
  StopCircle,
  Lock,
  Unlock,
  Settings2,
  Check,
  X,
  Loader2,
  BookOpenCheck,
  Users,
  Timer,
  Shield,
  ShieldAlert,
  ShieldCheck,
  FileText,
  Activity,
  Save,
  RotateCw,
  Sparkles,
  KeyRound,
  AlertCircle,
  Info,
  CircleDot,
  ChevronRight,
} from "lucide-react";
import { apiRequest } from "../../api";
import { useModal } from "../../components/modals/ModalProvider";
import {
  Button,
  IconButton,
  Input,
  Textarea,
  FormField,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardBody,
  Badge,
  Stat,
  Spinner,
  EmptyState,
  Divider,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import AIAssistant from "./AIAssistant";

function normalizeQuestionType(rawType) {
  const normalized = String(rawType || "mcq").toLowerCase();
  if (normalized === "written") return "written";
  if (normalized === "coding") return "coding";
  return "mcq";
}

function normalizeQuestionFlowMode(rawMode) {
  return String(rawMode || "all_at_once").toLowerCase() === "one_by_one"
    ? "one_by_one"
    : "all_at_once";
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

function getStatusBadgeVariant(status) {
  const normalized = String(status || "created").toLowerCase();
  if (normalized === "in_progress") return "success";
  if (normalized === "completed") return "neutral";
  if (normalized === "waiting") return "warning";
  return "outline";
}

function getQuestionFlowLabel(modeValue) {
  return normalizeQuestionFlowMode(modeValue) === "one_by_one" ? "One by one" : "All at once";
}

function getProctoringToneClasses(status) {
  if (status === "violation") return "border-danger bg-danger-subtle/20";
  if (status === "warning") return "border-warning bg-warning-subtle/20";
  if (status === "ok") return "border-success bg-success-subtle/10";
  return "border-border bg-surface";
}

function ProctorStatusDot({ status, className }) {
  const toneClass = {
    violation: "bg-danger",
    warning: "bg-warning",
    ok: "bg-success",
    unknown: "bg-ink-subtle",
  }[status || "unknown"];
  return <span className={cn("h-2 w-2 rounded-full", toneClass, className)} />;
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
  const [formWebcamRequired, setFormWebcamRequired] = useState(false);
  const [formQuestionFlowMode, setFormQuestionFlowMode] = useState("all_at_once");
  const [formRandomizeQuestionOrder, setFormRandomizeQuestionOrder] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [examStatus, setExamStatus] = useState("created");
  const [examStartedAt, setExamStartedAt] = useState(null);
  const [currentExamType, setCurrentExamType] = useState("lab_quiz");
  const [participants, setParticipants] = useState([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [listNotice, setListNotice] = useState("");
  const [highlightExamId, setHighlightExamId] = useState(null);
  const [isExamDetailsEditing, setIsExamDetailsEditing] = useState(false);

  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionFormVisible, setQuestionFormVisible] = useState(false);
  const [currentQuestionId, setCurrentQuestionId] = useState(null);
  const [questionText, setQuestionText] = useState("");
  const [questionType, setQuestionType] = useState("mcq");
  const [questionOptions, setQuestionOptions] = useState(["", "", "", ""]);
  const [questionCorrectAnswer, setQuestionCorrectAnswer] = useState("");
  const [questionReferenceAnswer, setQuestionReferenceAnswer] = useState("");
  const [questionSampleInput, setQuestionSampleInput] = useState("");
  const [questionSampleOutput, setQuestionSampleOutput] = useState("");
  const [questionStarterCode, setQuestionStarterCode] = useState("");
  const [questionMarks, setQuestionMarks] = useState("2");
  const [savingQuestion, setSavingQuestion] = useState(false);

  const [proctoringStudents, setProctoringStudents] = useState([]);
  const [loadingProctoring, setLoadingProctoring] = useState(false);
  const [selectedProctoringStudent, setSelectedProctoringStudent] = useState(null);
  const [proctoringEvents, setProctoringEvents] = useState([]);
  const [loadingProctoringEvents, setLoadingProctoringEvents] = useState(false);
  const proctoringPollRef = useRef(null);

  const [evaluationParticipants, setEvaluationParticipants] = useState([]);
  const [loadingEvaluationParticipants, setLoadingEvaluationParticipants] = useState(false);
  const [selectedSubmissionSheet, setSelectedSubmissionSheet] = useState(null);
  const [loadingSubmissionSheet, setLoadingSubmissionSheet] = useState(false);
  const [savingEvaluation, setSavingEvaluation] = useState(false);
  const [writtenMarksDraft, setWrittenMarksDraft] = useState({});
  const [writtenCommentDraft, setWrittenCommentDraft] = useState({});
  const participantPollIntervalRef = useRef(null);

  const clearParticipantPolling = useCallback(() => {
    if (participantPollIntervalRef.current) {
      clearInterval(participantPollIntervalRef.current);
      participantPollIntervalRef.current = null;
    }
  }, []);

  const loadExams = useCallback(async () => {
    setLoadingExams(true);
    try {
      const result = await apiRequest("/exams", {}, token);
      setExams(result.data.exams || []);
    } catch (err) {
      await showAlert({
        title: "Error",
        message: err.message || "Failed to load exams.",
      });
    } finally {
      setLoadingExams(false);
    }
  }, [showAlert, token]);

  const loadParticipants = useCallback(
    async (examId, options = {}) => {
      if (!examId) return;
      const { suppressAlert = false } = options;
      setLoadingParticipants(true);
      try {
        const result = await apiRequest(`/exams/${examId}/participants`, {}, token);
        setParticipants(result.data.participants || []);
      } catch (err) {
        const messageText = String(err?.message || "");
        const lostAccess = messageText.toLowerCase().includes("not found")
          || messageText.toLowerCase().includes("do not have permission");
        if (lostAccess) {
          clearParticipantPolling();
          setParticipants([]);
        }
        if (!suppressAlert) {
          await showAlert({
            title: "Error",
            message: err.message || "Failed to load participants.",
          });
        }
      } finally {
        setLoadingParticipants(false);
      }
    },
    [clearParticipantPolling, showAlert, token]
  );

  const startParticipantPolling = useCallback(
    (examId) => {
      clearParticipantPolling();
      loadParticipants(examId);
      participantPollIntervalRef.current = setInterval(() => {
        loadParticipants(examId, { suppressAlert: true });
      }, 3000);
    },
    [clearParticipantPolling, loadParticipants]
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
          message: err.message || "Failed to load questions.",
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
          message: err.message || "Failed to load evaluation participants.",
        });
      } finally {
        setLoadingEvaluationParticipants(false);
      }
    },
    [showAlert, token]
  );

  const loadProctoringStatus = useCallback(
    async (examId, options = {}) => {
      if (!examId) return;
      const { silent = false } = options;
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
    setQuestionOptions(["", "", "", ""]);
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
          const qType = normalizeQuestionType(answerItem.question_type);
          if (qType === "written" || qType === "coding") {
            nextMarks[answerItem.question_id] = String(answerItem.awarded_marks ?? 0);
            nextComments[answerItem.question_id] = answerItem.evaluation_comment || "";
          }
        });
        setWrittenMarksDraft(nextMarks);
        setWrittenCommentDraft(nextComments);
      } catch (err) {
        await showAlert({
          title: "Error",
          message: err.message || "Failed to load answer sheet.",
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
      if (proctoringPollRef.current) clearInterval(proctoringPollRef.current);
    };
  }, [clearParticipantPolling]);

  async function openCreateForm() {
    clearParticipantPolling();
    setListNotice("");
    setHighlightExamId(null);
    setIsExamDetailsEditing(true);
    setCurrentExamId(null);
    setCurrentExamTitle("");
    setFormTitle("");
    setFormDescription("");
    setFormExamType("lab_quiz");
    setFormDuration("60");
    setFormWebcamRequired(false);
    setFormQuestionFlowMode("all_at_once");
    setFormRandomizeQuestionOrder(false);
    setRoomCode("");
    setExamStatus("created");
    setExamStartedAt(null);
    setCurrentExamType("lab_quiz");
    setParticipants([]);
    setView("form");
  }

  async function openEditForm(examId) {
    clearParticipantPolling();
    setListNotice("");
    setHighlightExamId(null);
    try {
      const result = await apiRequest(`/exams/${examId}`, {}, token);
      const exam = result.data.exam;
      setIsExamDetailsEditing(false);
      setCurrentExamId(exam.id);
      setCurrentExamTitle(exam.title || "");
      setFormTitle(exam.title || "");
      setFormDescription(exam.description || "");
      setFormExamType(exam.exam_type || "lab_quiz");
      setFormDuration(String(exam.duration || 60));
      setFormWebcamRequired(Boolean(exam.webcam_required));
      setFormQuestionFlowMode(normalizeQuestionFlowMode(exam.question_flow_mode));
      setFormRandomizeQuestionOrder(Boolean(exam.randomize_question_order));
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
        message: err.message || "Failed to load exam details.",
      });
    }
  }

  async function handleDeleteExam(examId, title) {
    const confirmed = await showConfirm({
      title: "Delete Exam",
      message: `Delete "${title}"? This action cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
    });
    if (!confirmed) return;

    try {
      await apiRequest(`/exams/${examId}`, { method: "DELETE" }, token);
      clearParticipantPolling();
      setParticipants([]);
      setCurrentExamId(null);
      setCurrentExamTitle("");
      setRoomCode("");
      setExamStatus("created");
      setExamStartedAt(null);
      setView("list");
      setHighlightExamId(null);
      setListNotice(`Exam "${title}" deleted successfully.`);
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
            question_flow_mode: formQuestionFlowMode,
            randomize_question_order: formRandomizeQuestionOrder,
          }),
        },
        token
      );
      const exam = result.data.exam;
      setCurrentExamId(exam.id);
      setCurrentExamTitle(exam.title || title);
      setFormTitle(exam.title ?? title);
      setFormDescription(exam.description ?? formDescription);
      setRoomCode(exam.room_code || roomCode);
      setExamStatus(exam.status || examStatus);
      setExamStartedAt(exam.started_at || examStartedAt);
      setCurrentExamType(exam.exam_type || examType);
      setFormExamType(exam.exam_type || examType);
      setFormQuestionFlowMode(normalizeQuestionFlowMode(exam.question_flow_mode || formQuestionFlowMode));
      setFormRandomizeQuestionOrder(Boolean(exam.randomize_question_order));
      await loadExams();
      clearParticipantPolling();
      setView("form");
      setListNotice("");
      setHighlightExamId(null);
      setIsExamDetailsEditing(false);
      if (exam.id) startParticipantPolling(exam.id);
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
      cancelText: "Cancel",
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
    let copied = false;
    try {
      if (navigator?.clipboard?.writeText && window.isSecureContext !== false) {
        await navigator.clipboard.writeText(roomCode);
        copied = true;
      }
    } catch (error) {
      copied = false;
    }
    if (!copied) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = roomCode;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        copied = document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch (error) {
        copied = false;
      }
    }
    if (copied) {
      await showAlert({ title: "Copied", message: `Room code "${roomCode}" copied to clipboard.` });
    } else {
      await showAlert({
        title: "Copy failed",
        message: `Could not access the clipboard. Manually copy this code: ${roomCode}`,
      });
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

  async function openProctoringView(examId, examTitle) {
    clearParticipantPolling();
    if (proctoringPollRef.current) clearInterval(proctoringPollRef.current);
    setSelectedProctoringStudent(null);
    setProctoringEvents([]);
    setCurrentExamId(examId);
    setCurrentExamTitle(examTitle);
    setView("proctoring");
    await loadProctoringStatus(examId);
    proctoringPollRef.current = setInterval(() => {
      loadProctoringStatus(examId, { silent: true });
    }, 3000);
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
    const options = Array.isArray(question.options) ? question.options : ["", "", "", ""];
    setQuestionOptions([options[0] || "", options[1] || "", options[2] || "", options[3] || ""]);
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

    if (questionType === "mcq") {
      const trimmedOptions = questionOptions.map((opt) => opt.trim());
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
            }
          : questionType === "coding"
            ? {
                question_text: trimmedQuestionText,
                question_type: "coding",
                sample_input: questionSampleInput,
                sample_output: questionSampleOutput,
                starter_code: questionStarterCode,
                marks,
              }
          : {
              question_text: trimmedQuestionText,
              question_type: "mcq",
              options: questionOptions.map((opt) => opt.trim()),
              correct_answer: Number(questionCorrectAnswer),
              marks,
            };

      await apiRequest(
        endpoint,
        {
          method,
          body: JSON.stringify(payload),
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

    const manualItems = (selectedSubmissionSheet.answer_sheet || []).filter((item) => {
      const qType = normalizeQuestionType(item.question_type);
      return qType === "written" || qType === "coding";
    });

    const evaluations = manualItems.map((item) => ({
      question_id: item.question_id,
      awarded_marks: Number(writtenMarksDraft[item.question_id] ?? 0),
      evaluation_comment: writtenCommentDraft[item.question_id] || "",
    }));

    if (evaluations.length === 0) {
      await showAlert({
        title: "No Manual Answers",
        message: "There are no written or coding answers to evaluate in this submission.",
      });
      return;
    }

    setSavingEvaluation(true);
    try {
      await apiRequest(
        `/exams/${currentExamId}/evaluation/submissions/${selectedSubmissionSheet.id}/score`,
        { method: "PUT", body: JSON.stringify({ evaluations }) },
        token
      );

      await showAlert({ title: "Saved", message: "Evaluation saved successfully." });
      await loadSubmissionSheet(selectedSubmissionSheet.id);
      await loadEvaluationParticipants(currentExamId);
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to save evaluation." });
    } finally {
      setSavingEvaluation(false);
    }
  }

  async function handleForceSubmitParticipant(participant) {
    if (!currentExamId || !participant?.id) return;
    const confirmed = await showConfirm({
      title: "Force Submit",
      message: `Force submit exam for ${participant.student_name}?`,
      confirmText: "Force Submit",
      cancelText: "Cancel",
    });
    if (!confirmed) return;

    try {
      await apiRequest(
        `/exams/${currentExamId}/participants/${participant.id}/force-submit`,
        { method: "POST" },
        token
      );
      await showAlert({
        title: "Requested",
        message: `Force submit request sent for ${participant.student_name}.`,
      });
      await loadParticipants(currentExamId);
    } catch (err) {
      await showAlert({
        title: "Error",
        message: err.message || "Failed to force submit participant.",
      });
    }
  }

  async function handleToggleFreezeParticipant(participant) {
    if (!currentExamId || !participant?.id) return;
    const nextAction = participant.is_frozen ? "Unfreeze" : "Freeze";
    const confirmed = await showConfirm({
      title: `${nextAction} Student`,
      message: `${nextAction} exam screen for ${participant.student_name}?`,
      confirmText: nextAction,
      cancelText: "Cancel",
    });
    if (!confirmed) return;

    try {
      const result = await apiRequest(
        `/exams/${currentExamId}/participants/${participant.id}/toggle-freeze`,
        { method: "POST" },
        token
      );
      const frozen = Boolean(result.data?.participant?.is_frozen);
      await showAlert({
        title: "Updated",
        message: frozen
          ? `${participant.student_name} is now frozen.`
          : `${participant.student_name} is now unfrozen.`,
      });
      await loadParticipants(currentExamId);
    } catch (err) {
      await showAlert({
        title: "Error",
        message: err.message || "Failed to update participant freeze status.",
      });
    }
  }

  // ── RENDER: Exam List ────────────────────────────────────────────────
  function renderExamListView() {
    const totalExams = exams.length;
    const activeExams = exams.filter(
      (exam) => getEffectiveExamStatus(exam.status, exam.started_at, exam.duration) === "in_progress"
    ).length;
    const quizCount = exams.filter((exam) => String(exam.exam_type || "").toLowerCase() === "lab_quiz").length;
    const testCount = exams.filter((exam) => String(exam.exam_type || "").toLowerCase() === "lab_test").length;

    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">
              Teaching Workspace
            </p>
            <h1 className="text-2xl font-semibold text-ink tracking-tight mt-1">
              Teacher Dashboard
            </h1>
            <p className="text-sm text-ink-muted mt-1">
              Create, launch, and evaluate exams from one unified control center.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <IconButton
              aria-label="Refresh exams"
              tooltip="Refresh"
              variant="secondary"
              onClick={loadExams}
              disabled={loadingExams}
            >
              <RefreshCw className={cn("h-4 w-4", loadingExams && "animate-spin")} />
            </IconButton>
            <Button onClick={openCreateForm}>
              <Plus className="h-4 w-4" /> Create Exam
            </Button>
          </div>
        </div>

        {listNotice ? (
          <div className="flex items-start gap-2 rounded-md border border-success-subtle bg-success-subtle/40 px-3 py-2.5 text-sm text-success">
            <Check className="h-4 w-4 mt-0.5 shrink-0" /> {listNotice}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={BookOpenCheck} label="Total Exams" value={totalExams} tone="primary" />
          <Stat icon={Activity} label="In Progress" value={activeExams} tone="success" />
          <Stat icon={FileText} label="Lab Quizzes" value={quizCount} tone="info" />
          <Stat icon={ListChecks} label="Lab Tests" value={testCount} tone="warning" />
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Exams</CardTitle>
              <CardDescription>Click Manage on any exam to edit, launch, or evaluate.</CardDescription>
            </div>
          </CardHeader>
          <CardBody>
            {loadingExams ? (
              <div className="flex items-center gap-2 text-ink-muted text-sm py-6">
                <Spinner /> Loading exams…
              </div>
            ) : exams.length === 0 ? (
              <EmptyState
                icon={BookOpenCheck}
                title="No exams yet"
                description="Create your first exam to get started."
                action={
                  <Button onClick={openCreateForm}>
                    <Plus className="h-4 w-4" /> Create Exam
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border -mx-6">
                {exams.map((exam) => {
                  const effectiveStatus = getEffectiveExamStatus(
                    exam.status,
                    exam.started_at,
                    exam.duration
                  );
                  const highlight = Number(highlightExamId) === Number(exam.id);
                  return (
                    <li
                      key={exam.id}
                      className={cn(
                        "px-6 py-4 transition-colors hover:bg-bg/50",
                        highlight && "bg-primary-subtle/50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-semibold text-ink">{exam.title}</h3>
                            <Badge variant={getStatusBadgeVariant(effectiveStatus)}>
                              {effectiveStatus === "in_progress" ? (
                                <CircleDot className="h-3 w-3" />
                              ) : null}
                              {String(effectiveStatus || "created").replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                            <Badge variant="outline">
                              <Timer className="h-3 w-3" /> {exam.duration} min
                            </Badge>
                            <Badge variant="outline">
                              <ListChecks className="h-3 w-3" /> {exam.question_count || 0} q
                            </Badge>
                            {Number(exam.written_question_count || 0) > 0 ? (
                              <Badge variant="outline">Written {exam.written_question_count}</Badge>
                            ) : null}
                            {Number(exam.coding_question_count || 0) > 0 ? (
                              <Badge variant="outline">Coding {exam.coding_question_count}</Badge>
                            ) : null}
                            <Badge variant="outline">
                              {getQuestionFlowLabel(exam.question_flow_mode)}
                            </Badge>
                            <Badge variant="outline">
                              {Boolean(exam.randomize_question_order) ? "Randomized" : "Fixed order"}
                            </Badge>
                            <Badge variant={exam.exam_type === "lab_test" ? "warning" : "info"}>
                              {exam.exam_type === "lab_test" ? "Lab Test" : "Lab Quiz"}
                            </Badge>
                            {exam.room_code ? (
                              <Badge variant="primary">
                                <KeyRound className="h-3 w-3" /> {exam.room_code}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditForm(exam.id)}
                        >
                          <Settings2 className="h-4 w-4" /> Manage
                          <ChevronRight className="h-4 w-4 -mr-1" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    );
  }

  // ── RENDER: Exam Form ────────────────────────────────────────────────
  function renderExamFormView() {
    const effectiveExamStatus = getEffectiveExamStatus(examStatus, examStartedAt, formDuration);
    const isCreateMode = !currentExamId;
    const showDetailsForm = isCreateMode || isExamDetailsEditing;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <IconButton
              aria-label="Back to exams"
              tooltip="Back to exams"
              variant="secondary"
              onClick={() => {
                clearParticipantPolling();
                setView("list");
                loadExams();
              }}
            >
              <ArrowLeft className="h-4 w-4" />
            </IconButton>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                {isCreateMode ? "New Exam" : "Exam Setup"}
              </p>
              <h1 className="text-xl font-semibold text-ink">
                {isCreateMode ? "Create exam" : currentExamTitle || "Manage exam"}
              </h1>
            </div>
          </div>
          {!isCreateMode ? (
            <Button
              variant={isExamDetailsEditing ? "secondary" : "outline"}
              onClick={() => setIsExamDetailsEditing((previousValue) => !previousValue)}
            >
              {isExamDetailsEditing ? (
                <>
                  <X className="h-4 w-4" /> Cancel edit
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4" /> Edit details
                </>
              )}
            </Button>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Exam details</CardTitle>
              <CardDescription>
                {isCreateMode
                  ? "Configure exam details and scheduling."
                  : "Review exam details, then use edit mode to update settings."}
              </CardDescription>
            </div>
          </CardHeader>
          <CardBody>
            {!isCreateMode && !isExamDetailsEditing ? (
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-subtle font-medium">Title</dt>
                  <dd className="text-ink font-medium mt-1">
                    {currentExamTitle || formTitle || "Untitled exam"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-subtle font-medium">Description</dt>
                  <dd className="text-ink-muted mt-1">{formDescription || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-subtle font-medium">Type</dt>
                  <dd className="mt-1">
                    <Badge variant={formExamType === "lab_test" ? "warning" : "info"}>
                      {formExamType === "lab_test" ? "Lab Test" : "Lab Quiz"}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-subtle font-medium">Duration</dt>
                  <dd className="text-ink font-medium mt-1 tabular-nums">{formDuration} minutes</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-subtle font-medium">Presentation</dt>
                  <dd className="text-ink-muted mt-1">{getQuestionFlowLabel(formQuestionFlowMode)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-subtle font-medium">Order</dt>
                  <dd className="text-ink-muted mt-1">
                    {formRandomizeQuestionOrder ? "Randomized per student" : "Fixed"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-subtle font-medium">Webcam proctoring</dt>
                  <dd className="mt-1">
                    <Badge variant={formWebcamRequired ? "success" : "neutral"}>
                      {formWebcamRequired ? (
                        <>
                          <ShieldCheck className="h-3 w-3" /> Required
                        </>
                      ) : (
                        <>
                          <Shield className="h-3 w-3" /> Optional
                        </>
                      )}
                    </Badge>
                  </dd>
                </div>
              </dl>
            ) : (
              <form className="space-y-5" onSubmit={handleSaveExam}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Exam title" htmlFor="exam-title" required className="sm:col-span-2">
                    <Input
                      id="exam-title"
                      value={formTitle}
                      onChange={(event) => setFormTitle(event.target.value)}
                      required
                      placeholder="e.g. CSE 1101 · Mid-Term Lab Quiz"
                    />
                  </FormField>
                  <FormField label="Description" htmlFor="exam-description" className="sm:col-span-2">
                    <Input
                      id="exam-description"
                      value={formDescription}
                      onChange={(event) => setFormDescription(event.target.value)}
                      placeholder="Short summary shown to students"
                    />
                  </FormField>
                  <FormField label="Exam type" htmlFor="exam-type">
                    <select
                      id="exam-type"
                      value={formExamType}
                      onChange={(event) => setFormExamType(event.target.value)}
                      className="h-10 w-full rounded-md bg-surface border border-border px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-ring"
                    >
                      <option value="lab_quiz">Lab Quiz</option>
                      <option value="lab_test">Lab Test</option>
                    </select>
                  </FormField>
                  <FormField label="Duration (minutes)" htmlFor="exam-duration" required>
                    <Input
                      id="exam-duration"
                      type="number"
                      min={1}
                      max={300}
                      value={formDuration}
                      onChange={(event) => setFormDuration(event.target.value)}
                      required
                    />
                  </FormField>
                  <FormField label="Question presentation" htmlFor="exam-flow" className="sm:col-span-2">
                    <select
                      id="exam-flow"
                      value={formQuestionFlowMode}
                      onChange={(event) => setFormQuestionFlowMode(normalizeQuestionFlowMode(event.target.value))}
                      className="h-10 w-full rounded-md bg-surface border border-border px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-ring"
                    >
                      <option value="all_at_once">All questions at once</option>
                      <option value="one_by_one">One question at a time</option>
                    </select>
                  </FormField>
                </div>

                <div className="space-y-3">
                  <label className="flex items-start gap-3 rounded-md border border-border bg-bg p-3 cursor-pointer hover:border-border-strong transition-colors">
                    <input
                      type="checkbox"
                      checked={formRandomizeQuestionOrder}
                      onChange={(event) => setFormRandomizeQuestionOrder(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border-strong text-primary focus:ring-primary-ring"
                    />
                    <span className="text-sm">
                      <span className="block font-medium text-ink">Randomize question order</span>
                      <span className="text-ink-muted text-xs mt-0.5 block">
                        Each student receives a shuffled order that stays stable during the exam.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-md border border-border bg-bg p-3 cursor-pointer hover:border-border-strong transition-colors">
                    <input
                      type="checkbox"
                      checked={formWebcamRequired}
                      onChange={(e) => setFormWebcamRequired(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border-strong text-primary focus:ring-primary-ring"
                    />
                    <span className="text-sm">
                      <span className="block font-medium text-ink">Require webcam proctoring</span>
                      <span className="text-ink-muted text-xs mt-0.5 block">
                        Face detection will monitor for suspicious activity during the exam.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border -mx-6 px-6">
                  <Button type="submit" disabled={savingExam}>
                    {savingExam ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" /> {isCreateMode ? "Create Exam" : "Update Exam"}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardBody>
        </Card>

        {currentExamId ? (
          <>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Exam actions</CardTitle>
                  <CardDescription>Questions, evaluation, live proctoring, and deletion.</CardDescription>
                </div>
              </CardHeader>
              <CardBody>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => openQuestionManager(currentExamId, currentExamTitle)}
                    className="group flex items-start gap-3 rounded-lg border border-border bg-bg p-4 text-left hover:border-primary hover:bg-primary-subtle/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-subtle text-primary">
                      <ListChecks className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">Question Manager</p>
                      <p className="text-xs text-ink-muted mt-0.5">Author and edit questions</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => openSubmissionsView(currentExamId, currentExamTitle)}
                    className="group flex items-start gap-3 rounded-lg border border-border bg-bg p-4 text-left hover:border-primary hover:bg-primary-subtle/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-info-subtle text-info">
                      <ClipboardCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">Evaluation Desk</p>
                      <p className="text-xs text-ink-muted mt-0.5">Grade written &amp; coding</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => openProctoringView(currentExamId, currentExamTitle)}
                    className="group flex items-start gap-3 rounded-lg border border-border bg-bg p-4 text-left hover:border-primary hover:bg-primary-subtle/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-warning-subtle text-warning">
                      <Eye className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">Proctoring</p>
                      <p className="text-xs text-ink-muted mt-0.5">Live webcam monitoring</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteExam(currentExamId, currentExamTitle || formTitle || "Exam")}
                    className="group flex items-start gap-3 rounded-lg border border-border bg-bg p-4 text-left hover:border-danger hover:bg-danger-subtle/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-danger-subtle text-danger">
                      <Trash2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">Delete exam</p>
                      <p className="text-xs text-ink-muted mt-0.5">Permanently remove</p>
                    </div>
                  </button>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>
                    {effectiveExamStatus === "completed" ? "Participants" : "Live room & participants"}
                  </CardTitle>
                  <CardDescription>
                    {effectiveExamStatus === "completed"
                      ? "Exam has ended. You can still freeze or unfreeze any student's screen."
                      : "Share code, monitor joins, launch when ready."}
                  </CardDescription>
                </div>
                <IconButton
                  aria-label="Refresh participants"
                  tooltip="Refresh"
                  variant="secondary"
                  onClick={() => loadParticipants(currentExamId)}
                >
                  <RefreshCw className={cn("h-4 w-4", loadingParticipants && "animate-spin")} />
                </IconButton>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap p-4 rounded-lg border border-dashed border-border-strong bg-bg">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <span className="text-xs uppercase tracking-wide text-ink-muted font-medium">
                      Room code
                    </span>
                  </div>
                  <span className="text-xl font-mono tracking-widest font-semibold text-ink">
                    {roomCode || "—"}
                  </span>
                  <IconButton
                    aria-label="Copy room code"
                    tooltip="Copy code"
                    variant="ghost"
                    onClick={copyRoomCodeToClipboard}
                    disabled={!roomCode}
                  >
                    <Copy className="h-4 w-4" />
                  </IconButton>
                  <Divider orientation="vertical" className="h-6 mx-1" />
                  <Badge variant={getStatusBadgeVariant(effectiveExamStatus)}>
                    {effectiveExamStatus === "in_progress" ? (
                      <CircleDot className="h-3 w-3" />
                    ) : null}
                    {String(effectiveExamStatus || "created").replace("_", " ")}
                  </Badge>
                  <Badge variant={currentExamType === "lab_test" ? "warning" : "info"}>
                    {currentExamType === "lab_test" ? "Lab Test" : "Lab Quiz"}
                  </Badge>
                  <div className="ml-auto">
                    <Button
                      onClick={handleStartExamNow}
                      disabled={
                        !roomCode ||
                        effectiveExamStatus === "in_progress" ||
                        effectiveExamStatus === "completed"
                      }
                    >
                      <Play className="h-4 w-4" />
                      {effectiveExamStatus === "in_progress" ? "Exam in progress" : "Start Exam"}
                    </Button>
                  </div>
                </div>

                {loadingParticipants && participants.length === 0 ? (
                  <div className="flex items-center gap-2 text-ink-muted text-sm py-4">
                    <Spinner /> Loading participants…
                  </div>
                ) : participants.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="No students joined yet"
                    description="Share the room code with students. This list updates automatically."
                  />
                ) : (
                  <ul className="space-y-2">
                    {participants.map((participant) => {
                      const violationCount = Number(participant.violation_count || 0);
                      const isFrozen = Boolean(participant.is_frozen);
                      const lastViolation = participant.last_violation_at
                        ? `${participant.last_violation_severity || "medium"} · ${participant.last_violation_type || "Unknown"} · ${formatDateTime(participant.last_violation_at)}`
                        : null;
                      return (
                        <li
                          key={participant.id}
                          className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface p-4 hover:border-border-strong transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-ink truncate">
                                {participant.student_name}
                              </p>
                              {isFrozen ? (
                                <Badge variant="danger">
                                  <Lock className="h-3 w-3" /> Frozen
                                </Badge>
                              ) : (
                                <Badge variant="success">
                                  <CircleDot className="h-3 w-3" /> Active
                                </Badge>
                              )}
                              {violationCount > 0 ? (
                                <Badge variant="warning">
                                  <ShieldAlert className="h-3 w-3" /> {violationCount} violation{violationCount > 1 ? "s" : ""}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-xs text-ink-muted mt-1 truncate">
                              {participant.student_email}
                            </p>
                            <p className="text-xs text-ink-muted mt-1">
                              Joined {formatDateTime(participant.joined_at)} · Status: {participant.status}
                            </p>
                            {lastViolation ? (
                              <p className="text-xs text-ink-subtle mt-1">Latest: {lastViolation}</p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1">
                            <IconButton
                              aria-label={isFrozen ? "Unfreeze screen" : "Freeze screen"}
                              tooltip={isFrozen ? "Unfreeze" : "Freeze screen"}
                              variant="ghost"
                              onClick={() => handleToggleFreezeParticipant(participant)}
                            >
                              {isFrozen ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            </IconButton>
                            <IconButton
                              aria-label="Force submit"
                              tooltip="Force submit"
                              variant="danger"
                              onClick={() => handleForceSubmitParticipant(participant)}
                              disabled={String(participant.status || "").toLowerCase() === "completed"}
                            >
                              <StopCircle className="h-4 w-4" />
                            </IconButton>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          </>
        ) : null}
      </div>
    );
  }

  // ── RENDER: Question Manager ────────────────────────────────────────
  function renderQuestionManagerView() {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <IconButton
              aria-label="Back to exam"
              tooltip="Back to exam"
              variant="secondary"
              onClick={() => {
                setView("form");
                if (currentExamId) startParticipantPolling(currentExamId);
              }}
            >
              <ArrowLeft className="h-4 w-4" />
            </IconButton>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                Question studio
              </p>
              <h1 className="text-xl font-semibold text-ink">
                Questions · {currentExamTitle}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <IconButton
              aria-label="Refresh questions"
              tooltip="Refresh"
              variant="secondary"
              onClick={() => currentExamId && loadQuestionsForExam(currentExamId)}
            >
              <RefreshCw className={cn("h-4 w-4", loadingQuestions && "animate-spin")} />
            </IconButton>
            <Button onClick={openAddQuestionForm}>
              <Plus className="h-4 w-4" /> Add question
            </Button>
          </div>
        </div>

        <Card>
          <CardBody>
            {loadingQuestions ? (
              <div className="flex items-center gap-2 text-ink-muted text-sm py-6">
                <Spinner /> Loading questions…
              </div>
            ) : questions.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title="No questions yet"
                description="Add your first question to build this exam."
                action={
                  <Button onClick={openAddQuestionForm}>
                    <Plus className="h-4 w-4" /> Add question
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {questions.map((question, index) => {
                  const qType = normalizeQuestionType(question.question_type);
                  return (
                    <li
                      key={question.id}
                      className="rounded-lg border border-border bg-surface p-4 hover:border-border-strong transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="primary">#{index + 1}</Badge>
                            <Badge variant={qType === "mcq" ? "info" : qType === "coding" ? "warning" : "outline"}>
                              {qType === "mcq" ? "MCQ" : qType === "coding" ? "Coding" : "Written"}
                            </Badge>
                            <Badge variant="neutral">{question.marks} marks</Badge>
                          </div>
                          <p className="text-sm font-medium text-ink whitespace-pre-wrap">
                            {question.question_text}
                          </p>
                          <div className="mt-3 text-xs text-ink-muted space-y-1">
                            {qType === "mcq" ? (
                              <>
                                <p>
                                  Options:{" "}
                                  <span className="text-ink">
                                    {(question.options || []).join(" · ")}
                                  </span>
                                </p>
                                <p>
                                  Correct:{" "}
                                  <span className="text-ink font-medium">
                                    {question.correct_answer !== undefined && question.correct_answer !== null
                                      ? `Option ${Number(question.correct_answer) + 1}`
                                      : "N/A"}
                                  </span>
                                </p>
                              </>
                            ) : qType === "coding" ? (
                              <>
                                <p>Sample input: <code className="text-ink">{question.sample_input || "(none)"}</code></p>
                                <p>Sample output: <code className="text-ink">{question.sample_output || "(none)"}</code></p>
                              </>
                            ) : (
                              <p>Reference: {question.reference_answer || "—"}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <IconButton
                            aria-label="Edit question"
                            tooltip="Edit"
                            variant="ghost"
                            onClick={() => openEditQuestionForm(question)}
                          >
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            aria-label="Delete question"
                            tooltip="Delete"
                            variant="danger"
                            onClick={() => handleDeleteQuestion(question.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        {questionFormVisible ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{currentQuestionId ? "Edit question" : "Add question"}</CardTitle>
                <CardDescription>Compose question content and grading data.</CardDescription>
              </div>
            </CardHeader>
            <CardBody>
              <form className="space-y-5" onSubmit={handleSaveQuestion}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Question type" htmlFor="question-type">
                    <select
                      id="question-type"
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
                      className="h-10 w-full rounded-md bg-surface border border-border px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-ring disabled:opacity-60"
                    >
                      <option value="mcq">MCQ</option>
                      <option value="written">Written (Descriptive)</option>
                      <option value="coding">Coding</option>
                    </select>
                  </FormField>
                  <FormField label="Marks" htmlFor="question-marks" required>
                    <Input
                      id="question-marks"
                      type="number"
                      min={1}
                      max={100}
                      value={questionMarks}
                      onChange={(event) => setQuestionMarks(event.target.value)}
                      required
                    />
                  </FormField>
                </div>

                <FormField label="Question text" htmlFor="question-text" required>
                  {questionType === "coding" ? (
                    <Textarea
                      id="question-text"
                      rows={6}
                      value={questionText}
                      onChange={(event) => setQuestionText(event.target.value)}
                      placeholder="Describe the coding task, constraints, and expected behavior…"
                      required
                    />
                  ) : (
                    <Input
                      id="question-text"
                      type="text"
                      value={questionText}
                      onChange={(event) => setQuestionText(event.target.value)}
                      required
                      placeholder="Type the question…"
                    />
                  )}
                </FormField>

                {questionType === "mcq" ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {questionOptions.map((option, index) => (
                        <FormField key={`opt-${index}`} label={`Option ${index + 1}`} htmlFor={`opt-${index}`} required>
                          <Input
                            id={`opt-${index}`}
                            type="text"
                            value={option}
                            onChange={(event) => handleOptionChange(index, event.target.value)}
                            required
                          />
                        </FormField>
                      ))}
                    </div>
                    <FormField label="Correct answer" htmlFor="question-correct" required>
                      <select
                        id="question-correct"
                        value={questionCorrectAnswer}
                        onChange={(event) => setQuestionCorrectAnswer(event.target.value)}
                        required
                        className="h-10 w-full rounded-md bg-surface border border-border px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-ring"
                      >
                        <option value="">Select correct answer</option>
                        <option value="0">Option 1</option>
                        <option value="1">Option 2</option>
                        <option value="2">Option 3</option>
                        <option value="3">Option 4</option>
                      </select>
                    </FormField>
                  </>
                ) : questionType === "coding" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Sample input" htmlFor="q-sample-in" hint="Optional">
                      <Textarea
                        id="q-sample-in"
                        value={questionSampleInput}
                        onChange={(event) => setQuestionSampleInput(event.target.value)}
                        placeholder="Sample input for students…"
                        className="font-mono text-xs"
                      />
                    </FormField>
                    <FormField label="Sample output" htmlFor="q-sample-out" hint="Optional">
                      <Textarea
                        id="q-sample-out"
                        value={questionSampleOutput}
                        onChange={(event) => setQuestionSampleOutput(event.target.value)}
                        placeholder="Expected sample output…"
                        className="font-mono text-xs"
                      />
                    </FormField>
                    <FormField label="Starter code" htmlFor="q-starter" hint="Optional" className="sm:col-span-2">
                      <Textarea
                        id="q-starter"
                        rows={6}
                        value={questionStarterCode}
                        onChange={(event) => setQuestionStarterCode(event.target.value)}
                        placeholder="Optional starter template code…"
                        className="font-mono text-xs"
                      />
                    </FormField>
                  </div>
                ) : (
                  <FormField label="Reference answer" htmlFor="q-ref" hint="Optional — shown only to evaluators">
                    <Textarea
                      id="q-ref"
                      value={questionReferenceAnswer}
                      onChange={(event) => setQuestionReferenceAnswer(event.target.value)}
                      placeholder="Reference points for manual evaluation…"
                    />
                  </FormField>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-border -mx-6 px-6">
                  <Button type="button" variant="secondary" onClick={resetQuestionForm}>
                    <X className="h-4 w-4" /> Cancel
                  </Button>
                  <Button type="submit" disabled={savingQuestion}>
                    {savingQuestion ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" /> Save question
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  }

  // ── RENDER: Evaluation participants ──────────────────────────────────
  function renderEvaluationParticipantsView() {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <IconButton
              aria-label="Back to exam"
              tooltip="Back to exam"
              variant="secondary"
              onClick={() => {
                setView("form");
                if (currentExamId) startParticipantPolling(currentExamId);
              }}
            >
              <ArrowLeft className="h-4 w-4" />
            </IconButton>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                Evaluation desk
              </p>
              <h1 className="text-xl font-semibold text-ink">
                {currentExamTitle}
              </h1>
              <p className="text-sm text-ink-muted mt-0.5">
                Select a student to review submitted answers and finalize manual marks.
              </p>
            </div>
          </div>
          <IconButton
            aria-label="Refresh participants"
            tooltip="Refresh"
            variant="secondary"
            onClick={() => currentExamId && loadEvaluationParticipants(currentExamId)}
          >
            <RefreshCw className={cn("h-4 w-4", loadingEvaluationParticipants && "animate-spin")} />
          </IconButton>
        </div>

        <Card>
          <CardBody>
            {loadingEvaluationParticipants ? (
              <div className="flex items-center gap-2 text-ink-muted text-sm py-6">
                <Spinner /> Loading participants…
              </div>
            ) : evaluationParticipants.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No participants"
                description="Students appear here after they join the exam."
              />
            ) : (
              <ul className="space-y-2">
                {evaluationParticipants.map((participant) => {
                  const submitted = Boolean(participant.submission_id);
                  const violationCount = Number(participant.violation_count || 0);
                  const lastViolation = participant.last_violation_at
                    ? `${participant.last_violation_severity || "medium"} · ${participant.last_violation_type || "Unknown"} · ${formatDateTime(participant.last_violation_at)}`
                    : null;
                  return (
                    <li
                      key={participant.participant_id}
                      className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface p-4 hover:border-border-strong transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-ink">{participant.student_name}</p>
                          <Badge variant={submitted ? "success" : "warning"}>
                            {submitted ? (
                              <>
                                <Check className="h-3 w-3" /> Submitted
                              </>
                            ) : (
                              <>
                                <Timer className="h-3 w-3" /> Awaiting
                              </>
                            )}
                          </Badge>
                          {violationCount > 0 ? (
                            <Badge variant="danger">
                              <ShieldAlert className="h-3 w-3" /> {violationCount} violation{violationCount > 1 ? "s" : ""}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-ink-muted mt-1">{participant.student_email}</p>
                        <p className="text-xs text-ink-muted mt-1">
                          Joined {formatDateTime(participant.joined_at)} ·{" "}
                          {submitted ? "Submitted" : "Not submitted"}
                        </p>
                        {lastViolation ? (
                          <p className="text-xs text-ink-subtle mt-1">Latest violation: {lastViolation}</p>
                        ) : null}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge variant="outline">Status: {participant.evaluation_status || "pending"}</Badge>
                          <Badge variant="info">Auto {participant.auto_score ?? 0}</Badge>
                          <Badge variant="primary">Manual {participant.manual_score ?? 0}</Badge>
                          <Badge variant="success">Total {participant.score ?? 0}</Badge>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!submitted}
                        onClick={() => loadSubmissionSheet(participant.submission_id)}
                      >
                        <FileText className="h-4 w-4" />
                        {submitted ? "Open sheet" : "Awaiting"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    );
  }

  // ── RENDER: Answer sheet ────────────────────────────────────────────
  function renderAnswerSheetView() {
    if (!selectedSubmissionSheet) return null;

    const violations = normalizeViolations(selectedSubmissionSheet.violations);
    const manualItems = (selectedSubmissionSheet.answer_sheet || []).filter((item) => {
      const qType = normalizeQuestionType(item.question_type);
      return qType === "written" || qType === "coding";
    });

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <IconButton
              aria-label="Back to participants"
              tooltip="Back to participants"
              variant="secondary"
              onClick={() => setSelectedSubmissionSheet(null)}
            >
              <ArrowLeft className="h-4 w-4" />
            </IconButton>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                Answer sheet
              </p>
              <h1 className="text-xl font-semibold text-ink">
                {selectedSubmissionSheet.student_name}
              </h1>
              <p className="text-xs text-ink-muted mt-0.5">
                {selectedSubmissionSheet.student_email} · Submitted{" "}
                {formatDateTime(selectedSubmissionSheet.submitted_at)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={Activity} label="Auto score" value={selectedSubmissionSheet.auto_score} tone="info" />
          <Stat icon={Pencil} label="Manual score" value={selectedSubmissionSheet.manual_score} tone="primary" />
          <Stat icon={Check} label="Total" value={selectedSubmissionSheet.score} tone="success" />
          <Stat icon={ShieldAlert} label="Violations" value={violations.length} tone={violations.length > 0 ? "danger" : "neutral"} />
        </div>

        {violations.length > 0 ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Violations during exam</CardTitle>
                <CardDescription>
                  All proctoring and browser/keyboard events recorded for this submission, in order.
                </CardDescription>
              </div>
              <Badge variant="danger">
                <ShieldAlert className="h-3 w-3" /> {violations.length} total
              </Badge>
            </CardHeader>
            <CardBody>
              <ul className="space-y-2">
                {violations.map((v, vi) => {
                  const sev = String(v.severity || "medium").toLowerCase();
                  const sevTone = sev === "high" ? "danger" : sev === "low" ? "warning" : "neutral";
                  const source = String(v.source || "browser").toLowerCase();
                  const ts = v.timestamp ? formatDateTime(v.timestamp) : null;
                  return (
                    <li
                      key={vi}
                      className="flex items-start gap-3 rounded-md border border-border bg-bg px-3 py-2 text-sm"
                    >
                      <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-danger" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-ink">{v.type || "Unknown"}</span>
                          <Badge variant={sevTone}>{sev}</Badge>
                          <Badge variant={source === "proctoring" ? "info" : "outline"}>
                            {source === "proctoring" ? "Webcam" : "Browser"}
                          </Badge>
                        </div>
                        {ts ? <p className="text-xs text-ink-muted mt-1">{ts}</p> : null}
                        {v.details ? (
                          <p className="text-xs text-ink-muted mt-1 break-words">{v.details}</p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        ) : null}

        {loadingSubmissionSheet ? (
          <Card>
            <CardBody>
              <div className="flex items-center gap-2 text-ink-muted text-sm py-6">
                <Spinner /> Loading answer sheet…
              </div>
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="space-y-4">
              {(selectedSubmissionSheet.answer_sheet || []).map((item, index) => {
                const qType = normalizeQuestionType(item.question_type);
                const maxMarks = Number(item.max_marks) || 0;
                const selectedIdx =
                  item.selected_answer === undefined || item.selected_answer === null
                    ? null
                    : Number(item.selected_answer);

                return (
                  <Card key={item.question_id}>
                    <CardBody className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="primary">#{index + 1}</Badge>
                            <Badge variant={qType === "mcq" ? "info" : qType === "coding" ? "warning" : "outline"}>
                              {qType === "mcq" ? "MCQ" : qType === "coding" ? "Coding" : "Written"}
                            </Badge>
                            <Badge variant="neutral">Max {maxMarks}</Badge>
                          </div>
                          <p className="font-medium text-ink whitespace-pre-wrap">{item.question_text}</p>
                        </div>
                      </div>

                      {qType === "mcq" ? (
                        <>
                          <ul className="space-y-1.5">
                            {(item.options || []).map((option, optIndex) => {
                              const isCorrect = Number(item.correct_answer) === optIndex;
                              const isStudent = selectedIdx === optIndex;
                              return (
                                <li
                                  key={`${item.question_id}-${optIndex}`}
                                  className={cn(
                                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                                    isCorrect
                                      ? "border-success bg-success-subtle/50 text-success"
                                      : isStudent
                                        ? "border-danger bg-danger-subtle/40 text-danger"
                                        : "border-border bg-bg text-ink-muted"
                                  )}
                                >
                                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface border border-current text-xs font-semibold">
                                    {String.fromCharCode(65 + optIndex)}
                                  </span>
                                  <span className="flex-1">{option}</span>
                                  {isCorrect ? <Badge variant="success">Correct</Badge> : null}
                                  {isStudent && !isCorrect ? <Badge variant="danger">Selected</Badge> : null}
                                  {isStudent && isCorrect ? <Badge variant="success">Student</Badge> : null}
                                </li>
                              );
                            })}
                          </ul>
                          <p className="text-xs text-ink-muted">
                            Auto evaluation: <span className={cn("font-medium", item.is_correct ? "text-success" : "text-danger")}>
                              {item.is_correct ? "Correct" : "Wrong"}
                            </span>{" "}
                            · Awarded {item.awarded_marks}/{maxMarks}
                          </p>
                        </>
                      ) : qType === "coding" ? (
                        <>
                          <div>
                            <p className="text-xs text-ink-muted mb-1.5">
                              Student code ({item.language || "unknown"}):
                            </p>
                            <pre className="rounded-md bg-bg border border-border p-3 text-xs font-mono text-ink overflow-x-auto">
                              {item.written_answer || "// No code submitted."}
                            </pre>
                          </div>
                          <div className="rounded-md border border-border bg-bg p-3 text-xs space-y-1">
                            <p className="text-ink-muted">Sample I/O:</p>
                            <p><span className="text-ink-muted">Input:</span> <code className="text-ink">{item.sample_input || "(none)"}</code></p>
                            <p><span className="text-ink-muted">Output:</span> <code className="text-ink">{item.sample_output || "(none)"}</code></p>
                          </div>
                          <div className="rounded-lg border border-primary-subtle bg-primary-subtle/20 p-4 space-y-3">
                            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                              <FormField label="Awarded marks" htmlFor={`marks-${item.question_id}`}>
                                <Input
                                  id={`marks-${item.question_id}`}
                                  type="number"
                                  min={0}
                                  max={maxMarks}
                                  value={writtenMarksDraft[item.question_id] ?? "0"}
                                  onChange={(event) =>
                                    handleWrittenMarkDraftChange(item.question_id, event.target.value, maxMarks)
                                  }
                                />
                              </FormField>
                              <FormField label="Evaluation comment" htmlFor={`comment-${item.question_id}`} hint="Optional">
                                <Textarea
                                  id={`comment-${item.question_id}`}
                                  rows={3}
                                  value={writtenCommentDraft[item.question_id] || ""}
                                  onChange={(event) =>
                                    handleWrittenCommentDraftChange(item.question_id, event.target.value)
                                  }
                                  placeholder="Feedback for this coding answer…"
                                />
                              </FormField>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <p className="text-xs text-ink-muted mb-1.5">Student answer:</p>
                            <p className="rounded-md bg-bg border border-border p-3 text-sm text-ink whitespace-pre-wrap">
                              {item.written_answer || "No answer provided."}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-ink-muted mb-1.5">Reference answer:</p>
                            <p className="rounded-md bg-bg border border-dashed border-border p-3 text-sm text-ink-muted whitespace-pre-wrap">
                              {item.reference_answer || "No reference answer provided."}
                            </p>
                          </div>
                          <div className="rounded-lg border border-primary-subtle bg-primary-subtle/20 p-4 space-y-3">
                            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                              <FormField label="Awarded marks" htmlFor={`marks-${item.question_id}`}>
                                <Input
                                  id={`marks-${item.question_id}`}
                                  type="number"
                                  min={0}
                                  max={maxMarks}
                                  value={writtenMarksDraft[item.question_id] ?? "0"}
                                  onChange={(event) =>
                                    handleWrittenMarkDraftChange(item.question_id, event.target.value, maxMarks)
                                  }
                                />
                              </FormField>
                              <FormField label="Evaluation comment" htmlFor={`comment-${item.question_id}`} hint="Optional">
                                <Textarea
                                  id={`comment-${item.question_id}`}
                                  rows={3}
                                  value={writtenCommentDraft[item.question_id] || ""}
                                  onChange={(event) =>
                                    handleWrittenCommentDraftChange(item.question_id, event.target.value)
                                  }
                                  placeholder="Feedback for this written answer…"
                                />
                              </FormField>
                            </div>
                          </div>
                        </>
                      )}
                    </CardBody>
                  </Card>
                );
              })}
            </div>

            {manualItems.length > 0 ? (
              <div className="flex justify-end gap-2 sticky bottom-4">
                <div className="rounded-lg border border-border bg-surface/95 backdrop-blur shadow-md p-3 flex items-center gap-2">
                  <Button variant="secondary" onClick={() => loadSubmissionSheet(selectedSubmissionSheet.id)}>
                    <RotateCw className="h-4 w-4" /> Reload
                  </Button>
                  <Button onClick={saveWrittenEvaluation} disabled={savingEvaluation}>
                    {savingEvaluation ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" /> Save evaluation
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <Card>
                <CardBody>
                  <p className="text-sm text-ink-muted text-center py-4">
                    No manual questions in this exam. MCQ evaluation is automatic.
                  </p>
                </CardBody>
              </Card>
            )}
          </>
        )}
      </div>
    );
  }

  function renderSubmissionsView() {
    if (selectedSubmissionSheet) return renderAnswerSheetView();
    return renderEvaluationParticipantsView();
  }

  async function loadStudentProctoringEvents(student) {
    setSelectedProctoringStudent(student);
    setProctoringEvents([]);
    setLoadingProctoringEvents(true);
    try {
      const result = await apiRequest(`/proctoring/${currentExamId}/events/${student.student_id}`, {}, token);
      setProctoringEvents(result.data.events || []);
    } catch (err) {
      await showAlert({ title: "Error", message: err.message || "Failed to load events." });
    } finally {
      setLoadingProctoringEvents(false);
    }
  }

  // ── RENDER: Proctoring ──────────────────────────────────────────────
  function renderProctoringView() {
    const violations = proctoringStudents.filter((s) => s.proctoring_status === "violation").length;
    const warnings = proctoringStudents.filter((s) => s.proctoring_status === "warning").length;
    const okCount = proctoringStudents.length - violations - warnings;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <IconButton
              aria-label="Back to exam"
              tooltip="Back to exam"
              variant="secondary"
              onClick={() => {
                if (proctoringPollRef.current) clearInterval(proctoringPollRef.current);
                setSelectedProctoringStudent(null);
                setProctoringEvents([]);
                setView("form");
                if (currentExamId) startParticipantPolling(currentExamId);
              }}
            >
              <ArrowLeft className="h-4 w-4" />
            </IconButton>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                Live monitor
              </p>
              <h1 className="text-xl font-semibold text-ink">Proctoring · {currentExamTitle}</h1>
              <p className="text-xs text-ink-muted mt-0.5">
                Auto-refreshes every 3 seconds with the latest snapshots.
              </p>
            </div>
          </div>
        </div>

        <div className="sticky top-14 z-10 flex items-center gap-3 flex-wrap rounded-lg border border-border bg-surface/95 backdrop-blur px-4 py-3">
          <Badge variant="success">
            <ProctorStatusDot status="ok" /> {okCount} OK
          </Badge>
          <Badge variant="warning">
            <ProctorStatusDot status="warning" /> {warnings} warning
          </Badge>
          <Badge variant="danger">
            <ProctorStatusDot status="violation" /> {violations} violation
          </Badge>
          <div className="ml-auto text-xs text-ink-muted flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> {proctoringStudents.length} total students
          </div>
        </div>

        {loadingProctoring && proctoringStudents.length === 0 ? (
          <div className="flex items-center gap-2 text-ink-muted text-sm py-6">
            <Spinner /> Loading proctoring data…
          </div>
        ) : proctoringStudents.length === 0 ? (
          <Card>
            <CardBody>
              <EmptyState
                icon={Eye}
                title="No students are in this exam yet"
                description="Once students join, their live feeds appear here."
              />
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {proctoringStudents.map((s) => {
              const isSelected = selectedProctoringStudent?.student_id === s.student_id;
              const tone = s.proctoring_status || "unknown";
              return (
                <div
                  key={s.student_id}
                  className={cn(
                    "rounded-lg border-2 overflow-hidden bg-surface transition-all",
                    getProctoringToneClasses(tone),
                    isSelected && "ring-2 ring-primary-ring ring-offset-2 ring-offset-bg"
                  )}
                >
                  <div className="relative aspect-[4/3] bg-bg">
                    {s.snapshot_base64 ? (
                      <img
                        src={s.snapshot_base64}
                        alt={s.student_name}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-ink-subtle text-xs">
                        No feed
                      </div>
                    )}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-ink/80 text-white px-2 py-0.5 text-[11px]">
                      <ProctorStatusDot status={tone} />
                      {tone}
                    </div>
                    <div className="absolute top-2 right-2 rounded-full bg-ink/80 text-white px-2 py-0.5 text-[11px]">
                      {s.face_count} {Number(s.face_count) === 1 ? "face" : "faces"}
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="text-sm font-medium text-ink truncate" title={s.student_name}>
                      {s.student_name}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {Number(s.no_face_count) > 0 && (
                        <Badge variant="warning" size="sm">Away ×{s.no_face_count}</Badge>
                      )}
                      {Number(s.multiple_faces_count) > 0 && (
                        <Badge variant="danger" size="sm">Multi ×{s.multiple_faces_count}</Badge>
                      )}
                      {Number(s.looking_away_count) > 0 && (
                        <Badge variant="warning" size="sm">Look ×{s.looking_away_count}</Badge>
                      )}
                      {Number(s.looking_down_count) > 0 && (
                        <Badge variant="warning" size="sm">Down ×{s.looking_down_count}</Badge>
                      )}
                      {Number(s.total_events) === 0 && (
                        <Badge variant="success" size="sm">Clean</Badge>
                      )}
                    </div>
                    <Button
                      variant={isSelected ? "secondary" : "outline"}
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        isSelected
                          ? setSelectedProctoringStudent(null)
                          : loadStudentProctoringEvents(s)
                      }
                    >
                      {isSelected ? (
                        <>
                          <EyeOff className="h-4 w-4" /> Close log
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4" /> Events ({s.total_events})
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedProctoringStudent ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Event log · {selectedProctoringStudent.student_name}</CardTitle>
                <CardDescription>All recorded proctoring events for this student.</CardDescription>
              </div>
              <IconButton
                aria-label="Close event log"
                tooltip="Close"
                variant="ghost"
                onClick={() => setSelectedProctoringStudent(null)}
              >
                <X className="h-4 w-4" />
              </IconButton>
            </CardHeader>
            <CardBody>
              {loadingProctoringEvents ? (
                <div className="flex items-center gap-2 text-ink-muted text-sm py-6">
                  <Spinner /> Loading events…
                </div>
              ) : proctoringEvents.length === 0 ? (
                <EmptyState
                  icon={Info}
                  title="No events recorded"
                  description="This student has had a clean session so far."
                />
              ) : (
                <ul className="space-y-2">
                  {proctoringEvents.map((ev) => (
                    <li
                      key={ev.id}
                      className="flex items-start gap-3 rounded-md border border-border bg-surface p-3"
                    >
                      <ShieldAlert className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink capitalize">
                          {ev.event_type.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-ink-muted mt-0.5">
                          {formatDateTime(ev.created_at)}
                        </p>
                        {ev.details ? (
                          <p className="text-xs text-ink-subtle mt-1">{ev.details}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] w-full px-4 sm:px-6 py-6 sm:py-8">
      {view === "form" ? renderExamFormView() : null}
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
          view === "questions" && currentExamId
            ? () => loadQuestionsForExam(currentExamId)
            : null
        }
      />
    </div>
  );
}
