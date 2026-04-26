import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  RefreshCw,
  KeyRound,
  User,
  Hourglass,
  Play,
  Eye,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Send,
  Lock,
  Clock,
  ShieldAlert,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Code2,
  FileText,
  RotateCcw,
  CircleDot,
  LogIn,
  BookOpenCheck,
  Timer,
  Award,
  Info,
  XCircle,
  Trophy,
  Users,
  ShieldCheck,
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
} from "../../components/ui";
import { cn } from "../../lib/cn";
import ProctoringCamera from "./ProctoringCamera";

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

function normalizeQuestionFlowMode(rawMode) {
  return String(rawMode || "all_at_once").toLowerCase() === "one_by_one"
    ? "one_by_one"
    : "all_at_once";
}

function defaultCodeForLanguage(language) {
  if (language === "python") {
    return "# Write your Python solution here\n";
  }
  if (language === "cpp") {
    return [
      "#include <bits/stdc++.h>",
      "using namespace std;",
      "",
      "int main() {",
      "  ios::sync_with_stdio(false);",
      "  cin.tie(nullptr);",
      "",
      "  // Write your C++ solution here",
      "",
      "  return 0;",
      "}",
    ].join("\n");
  }
  return "// Write your JavaScript solution here\n";
}

function isQuestionAnswered(question, answerState, codeState) {
  const qType = normalizeQuestionType(question?.question_type);
  if (qType === "mcq") {
    return answerState?.selected_answer !== null
      && answerState?.selected_answer !== undefined
      && answerState?.selected_answer !== "";
  }
  if (qType === "written") {
    return String(answerState?.written_answer || "").trim().length > 0;
  }

  const currentCode = String(codeState?.code || "");
  if (currentCode.trim().length === 0) {
    return false;
  }
  const teacherStarterCode = String(question?.starter_code || "");
  if (!teacherStarterCode.trim()) {
    return true;
  }
  return currentCode.trim() !== teacherStarterCode.trim();
}

function buildFormattedAnswers(answerSource, codingSource) {
  const mergedAnswers = { ...(answerSource || {}) };

  Object.entries(codingSource || {}).forEach(([questionId, coding]) => {
    mergedAnswers[questionId] = {
      ...(mergedAnswers[questionId] || {}),
      selected_answer: null,
      written_answer: coding?.code || "",
      language: coding?.language || "javascript",
    };
  });

  return Object.entries(mergedAnswers).map(([questionId, answer]) => ({
    question_id: Number(questionId),
    selected_answer: answer.selected_answer ?? null,
    written_answer: answer.written_answer ?? "",
    language: answer.language || "",
  }));
}

function getExamStatusBadgeVariant(status) {
  const normalized = String(status || "waiting").toLowerCase();
  if (normalized === "in_progress") return "success";
  if (normalized === "completed") return "neutral";
  return "warning";
}

function formatDateTime(dateValue) {
  if (!dateValue) return "N/A";
  return new Date(dateValue).toLocaleString();
}

function getEvaluationStatusLabel(status) {
  return String(status || "pending").toLowerCase() === "completed"
    ? "Completed"
    : "Pending Evaluation";
}

export default function StudentDashboard({ token, user, onExamModeChange }) {
  const { showAlert, showConfirm } = useModal();
  const [view, setView] = useState("dashboard");
  const [activeExams, setActiveExams] = useState([]);
  const [loadingActiveExams, setLoadingActiveExams] = useState(false);
  const [studentNameInput, setStudentNameInput] = useState(localStorage.getItem("studentDisplayName") || "");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joiningExam, setJoiningExam] = useState(false);
  const [waitingExam, setWaitingExam] = useState(null);
  const [waitingParticipantCount, setWaitingParticipantCount] = useState(0);
  const [waitingStatusMessage, setWaitingStatusMessage] = useState("Auto-checking exam status...");
  const [waitingLastUpdatedAt, setWaitingLastUpdatedAt] = useState(null);
  const [examData, setExamData] = useState(null);
  const [examAnswers, setExamAnswers] = useState({});
  const [timerText, setTimerText] = useState("--:--");
  const [examLoading, setExamLoading] = useState(false);
  const [submittingExam, setSubmittingExam] = useState(false);
  const [examSubmitMessage, setExamSubmitMessage] = useState("");
  const [codingState, setCodingState] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [warningMessage, setWarningMessage] = useState("");
  const [warningSeverity, setWarningSeverity] = useState("medium");
  const [violationCount, setViolationCount] = useState(0);
  const [examViolations, setExamViolations] = useState([]);
  const [results, setResults] = useState([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [selectedResultDetails, setSelectedResultDetails] = useState(null);
  const [loadingResultDetails, setLoadingResultDetails] = useState(false);
  const [isExamBlocked, setIsExamBlocked] = useState(false);
  const [isTeacherForceSubmitting, setIsTeacherForceSubmitting] = useState(false);
  const [codeEditorHeight, setCodeEditorHeight] = useState(
    typeof window !== "undefined" && window.innerWidth <= 720 ? "300px" : "420px"
  );

  const waitingPollIntervalRef = useRef(null);
  const examTimerIntervalRef = useRef(null);
  const examControlIntervalRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const submissionInProgressRef = useRef(false);
  const forceSubmitTriggeredRef = useRef(false);
  const viewRef = useRef(view);
  const examDataRef = useRef(examData);
  const examAnswersRef = useRef(examAnswers);
  const codingStateRef = useRef(codingState);
  const examViolationsRef = useRef(examViolations);
  const submitExamRef = useRef(null);
  const enterWaitingRoomRef = useRef(null);
  const startExamSessionRef = useRef(null);
  const sessionRestoreAttemptedRef = useRef(false);

  const sessionStorageKey = useMemo(
    () => (user?.id ? `student-session:${user.id}` : null),
    [user?.id]
  );

  const persistStudentSession = useCallback(
    (mode, exam) => {
      if (!sessionStorageKey || typeof window === "undefined") return;
      if (!exam?.id || !mode) {
        try {
          window.localStorage.removeItem(sessionStorageKey);
        } catch (err) {
          // ignore
        }
        return;
      }
      try {
        window.localStorage.setItem(
          sessionStorageKey,
          JSON.stringify({ mode, examId: exam.id, savedAt: new Date().toISOString() })
        );
      } catch (err) {
        // ignore
      }
    },
    [sessionStorageKey]
  );

  const clearStudentSession = useCallback(() => {
    if (!sessionStorageKey || typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(sessionStorageKey);
    } catch (err) {
      // ignore
    }
  }, [sessionStorageKey]);

  const monacoEditorOptions = useMemo(
    () => ({
      minimap: { enabled: false },
      fontSize: 14,
      wordWrap: "on",
      smoothScrolling: true,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      readOnly: isExamBlocked,
      domReadOnly: isExamBlocked,
      tabSize: 2,
    }),
    [isExamBlocked]
  );

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const handleResize = () => {
      setCodeEditorHeight(window.innerWidth <= 720 ? "300px" : "420px");
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (typeof onExamModeChange === "function") {
      onExamModeChange(view === "exam");
    }
  }, [onExamModeChange, view]);

  useEffect(() => {
    examDataRef.current = examData;
  }, [examData]);

  useEffect(() => {
    examAnswersRef.current = examAnswers;
  }, [examAnswers]);

  useEffect(() => {
    codingStateRef.current = codingState;
  }, [codingState]);

  useEffect(() => {
    examViolationsRef.current = examViolations;
  }, [examViolations]);

  const clearWaitingPolling = useCallback(() => {
    if (waitingPollIntervalRef.current) {
      clearInterval(waitingPollIntervalRef.current);
      waitingPollIntervalRef.current = null;
    }
  }, []);

  const clearExamTimer = useCallback(() => {
    if (examTimerIntervalRef.current) {
      clearInterval(examTimerIntervalRef.current);
      examTimerIntervalRef.current = null;
    }
  }, []);

  const clearExamControlPolling = useCallback(() => {
    if (examControlIntervalRef.current) {
      clearInterval(examControlIntervalRef.current);
      examControlIntervalRef.current = null;
    }
  }, []);

  const clearWarningTimer = useCallback(() => {
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
  }, []);

  const loadActiveExams = useCallback(async () => {
    setLoadingActiveExams(true);
    try {
      const result = await apiRequest("/exams/my-active", {}, token);
      setActiveExams(result.data.exams || []);
    } catch (err) {
      await showAlert({
        title: "Error",
        message: err.message || "Failed to load active exams.",
      });
    } finally {
      setLoadingActiveExams(false);
    }
  }, [showAlert, token]);

  const loadMyResults = useCallback(async () => {
    setLoadingResults(true);
    try {
      const result = await apiRequest("/exams/my-results", {}, token);
      setResults(result.data.results || []);
    } catch (err) {
      await showAlert({
        title: "Error",
        message: err.message || "Failed to load exam results.",
      });
    } finally {
      setLoadingResults(false);
    }
  }, [showAlert, token]);

  const loadResultDetails = useCallback(
    async (submissionId) => {
      if (!submissionId) return;
      setLoadingResultDetails(true);
      try {
        const result = await apiRequest(`/exams/my-results/${submissionId}`, {}, token);
        setSelectedResultDetails(result.data.result || null);
        setView("result-details");
      } catch (err) {
        await showAlert({
          title: "Error",
          message: err.message || "Failed to load result details.",
        });
      } finally {
        setLoadingResultDetails(false);
      }
    },
    [showAlert, token]
  );

  const reportLiveViolation = useCallback(
    async (examId, violation) => {
      if (!examId || !violation?.type) {
        return;
      }

      try {
        await apiRequest(
          `/exams/${examId}/violations`,
          {
            method: "POST",
            body: JSON.stringify({
              type: violation.type,
              severity: violation.severity || "medium",
              timestamp: violation.timestamp || new Date().toISOString(),
            }),
          },
          token
        );
      } catch (error) {
        console.error("Live violation report error:", error);
      }
    },
    [token]
  );

  const resetExamState = useCallback(() => {
    clearExamTimer();
    clearExamControlPolling();
    clearWarningTimer();
    setExamData(null);
    setExamAnswers({});
    setCodingState({});
    setCurrentQuestionIndex(0);
    setExamViolations([]);
    setViolationCount(0);
    setTimerText("--:--");
    setWarningMessage("");
    setWarningSeverity("medium");
    setExamSubmitMessage("");
    setWaitingStatusMessage("Auto-checking exam status...");
    setWaitingLastUpdatedAt(null);
    setIsExamBlocked(false);
    setIsTeacherForceSubmitting(false);
    forceSubmitTriggeredRef.current = false;
  }, [clearExamControlPolling, clearExamTimer, clearWarningTimer]);

  const forceAutoSubmitExam = useCallback(
    async (examId, autoSubmitReason, options = {}) => {
      const { silent = false } = options;
      if (!examId || submissionInProgressRef.current) {
        return false;
      }

      submissionInProgressRef.current = true;
      setSubmittingExam(true);
      clearExamTimer();
      clearExamControlPolling();
      clearWaitingPolling();

      const activeExam = examDataRef.current;
      const isCurrentExam = Boolean(activeExam && Number(activeExam.id) === Number(examId));
      const answerSource = isCurrentExam ? examAnswersRef.current : {};
      const violationSource = isCurrentExam ? examViolationsRef.current : [];

      const formattedAnswers = buildFormattedAnswers(answerSource, isCurrentExam ? codingStateRef.current : {});

      try {
        await apiRequest(
          `/exams/${examId}/submit`,
          {
            method: "POST",
            body: JSON.stringify({
              answers: formattedAnswers,
              violations: violationSource,
            }),
          },
          token
        );

        if (window.electronAPI?.submitExam) {
          try {
            await window.electronAPI.submitExam({
              examId,
              answers: formattedAnswers,
            });
          } catch (electronError) {
            console.error("Electron submitExam error:", electronError);
          }
        }

        if (!silent) {
          await showAlert({
            title: "Exam submitted",
            message: autoSubmitReason,
          });
        }

        clearStudentSession();
        resetExamState();
        setWaitingExam(null);
        setWaitingParticipantCount(0);
        setView("dashboard");
        await loadActiveExams();
        await loadMyResults();
        return true;
      } catch (err) {
        const messageText = String(err?.message || "");
        const alreadySubmitted = messageText.toLowerCase().includes("already submitted");

        if (!alreadySubmitted && !silent) {
          setExamSubmitMessage(messageText || "Failed to auto-submit exam. Please contact your teacher.");
          await showAlert({
            title: "Submission issue",
            message: `${autoSubmitReason}\n\n${messageText || "Failed to auto-submit exam."}`,
          });
        }

        clearStudentSession();
        resetExamState();
        setWaitingExam(null);
        setWaitingParticipantCount(0);
        setView("dashboard");
        await loadActiveExams();
        await loadMyResults();
        return alreadySubmitted;
      } finally {
        submissionInProgressRef.current = false;
        setSubmittingExam(false);
      }
    },
    [clearExamControlPolling, clearExamTimer, clearStudentSession, clearWaitingPolling, loadActiveExams, loadMyResults, resetExamState, showAlert, token]
  );

  const submitExam = useCallback(
    async ({ autoSubmit = false, autoSubmitReason = "" } = {}) => {
      if (submissionInProgressRef.current) {
        return;
      }

      const activeExam = examDataRef.current;
      if (!activeExam) {
        return;
      }

      if (autoSubmit) {
        await forceAutoSubmitExam(activeExam.id, autoSubmitReason || "Exam was auto-submitted.");
        return;
      }

      if (isExamBlocked) {
        await showAlert({
          title: "Exam Blocked",
          message: "Your teacher has blocked your exam screen. Wait until you are unblocked.",
        });
        return;
      }

      const confirmed = await showConfirm({
        title: "Submit Exam",
        message: "Are you sure you want to submit your exam? You cannot change answers after submission.",
        confirmText: "Submit",
        cancelText: "Cancel",
      });
      if (!confirmed) {
        return;
      }

      submissionInProgressRef.current = true;
      setSubmittingExam(true);
      clearExamTimer();
      clearExamControlPolling();
      clearWaitingPolling();

      const formattedAnswers = buildFormattedAnswers(examAnswersRef.current, codingStateRef.current);

      try {
        const result = await apiRequest(
          `/exams/${activeExam.id}/submit`,
          {
            method: "POST",
            body: JSON.stringify({
              answers: formattedAnswers,
              violations: examViolationsRef.current,
            }),
          },
          token
        );

        if (window.electronAPI?.submitExam) {
          try {
            await window.electronAPI.submitExam({
              examId: activeExam.id,
              answers: formattedAnswers,
            });
          } catch (electronError) {
            console.error("Electron submitExam error:", electronError);
          }
        }

        const submission = result.data?.submission || {};
        const hasWrittenPending = submission.evaluation_status === "pending";
        const scoreLine = hasWrittenPending
          ? `Current auto score: ${submission.auto_score ?? 0}.`
          : `Final score: ${submission.score ?? 0}.`;

        const pendingLine = hasWrittenPending
          ? "\nManual answers will be evaluated by your teacher."
          : "";

        await showAlert({
          title: "Submission Complete",
          message: `Exam submitted successfully.\n${scoreLine}${pendingLine}`,
        });

        clearStudentSession();
        resetExamState();
        setView("dashboard");
        await loadActiveExams();
        await loadMyResults();
      } catch (err) {
        setExamSubmitMessage(err.message || "Failed to submit exam. Please try again.");
      } finally {
        submissionInProgressRef.current = false;
        setSubmittingExam(false);
      }
    },
    [
      clearExamTimer,
      clearExamControlPolling,
      clearStudentSession,
      clearWaitingPolling,
      forceAutoSubmitExam,
      isExamBlocked,
      loadActiveExams,
      loadMyResults,
      resetExamState,
      showAlert,
      showConfirm,
      token,
    ]
  );

  useEffect(() => {
    submitExamRef.current = submitExam;
  }, [submitExam]);

  const pollExamControl = useCallback(
    async (examId) => {
      if (!examId) return;
      try {
        const result = await apiRequest(`/exams/${examId}/status`, {}, token);
        const data = result.data || {};
        const frozen = Boolean(data.is_frozen);
        const forceSubmitRequested = Boolean(data.force_submit_requested);

        setIsExamBlocked(frozen);

        if (forceSubmitRequested && !submissionInProgressRef.current && !forceSubmitTriggeredRef.current) {
          forceSubmitTriggeredRef.current = true;
          clearExamControlPolling();
          setIsTeacherForceSubmitting(true);
          await forceAutoSubmitExam(
            examId,
            "Your teacher submitted your exam.",
            { silent: true }
          );
        }
      } catch (err) {
        console.error("Exam control poll error:", err);
      }
    },
    [clearExamControlPolling, forceAutoSubmitExam, token]
  );

  const startExamSession = useCallback(
    async (examId) => {
      setExamLoading(true);
      try {
        const result = await apiRequest(`/exams/${examId}`, {}, token);
        const exam = result.data.exam;

        if (exam.has_submitted) {
          await showAlert({
            title: "Already Submitted",
            message: "You have already submitted this exam. You cannot take it again.",
          });
          await loadActiveExams();
          return;
        }

        if (exam.started_at) {
          const startTime = new Date(exam.started_at);
          const endTime = new Date(startTime.getTime() + Number(exam.duration) * 60 * 1000);
          const now = new Date();
          const remainingSeconds = Math.floor((endTime - now) / 1000);

          if (remainingSeconds <= 0) {
            await forceAutoSubmitExam(
              exam.id,
              "Time is up. Your exam was submitted automatically."
            );
            return;
          }
        }

        if (exam.webcam_required) {
          const agreed = await showConfirm({
            title: "Webcam Required",
            message:
              "This exam requires your webcam for proctoring. Your camera will be active throughout the exam and periodic snapshots will be recorded for the teacher to review. Do you want to allow camera access and proceed?",
            confirmText: "Allow & Start Exam",
            cancelText: "Cancel",
          });

          if (!agreed) {
            setExamLoading(false);
            return;
          }

          try {
            if (!navigator.mediaDevices?.getUserMedia) {
              throw Object.assign(new Error("getUserMedia not supported"), { name: "NotSupportedError" });
            }
            const testStream = await navigator.mediaDevices.getUserMedia({ video: true });
            testStream.getTracks().forEach((t) => t.stop());
          } catch (camErr) {
            let camMessage = "Could not access your camera. Make sure it is connected and not in use by another application, then try again.";
            if (camErr.name === "NotAllowedError" || camErr.name === "PermissionDeniedError") {
              camMessage = "Camera access was denied. You must allow camera access to take this proctored exam.";
            } else if (camErr.name === "NotSupportedError") {
              camMessage = "Camera API is not available. Please restart the application.";
            }
            await showAlert({ title: "Camera Access Failed", message: camMessage });
            setExamLoading(false);
            return;
          }
        }

        clearWaitingPolling();
        clearExamControlPolling();
        setWaitingExam(null);
        setWaitingParticipantCount(0);
        resetExamState();
        forceSubmitTriggeredRef.current = false;
        setIsExamBlocked(false);
        setExamData(exam);
        setCurrentQuestionIndex(0);
        setView("exam");
        persistStudentSession("exam", exam);

        if (window.electronAPI?.setUserData) {
          window.electronAPI.setUserData(user);
        }

        if (window.electronAPI?.startExam) {
          setTimeout(() => {
            window.electronAPI.startExam(exam);
          }, 100);
        }

        pollExamControl(exam.id);
        examControlIntervalRef.current = setInterval(() => {
          pollExamControl(exam.id);
        }, 2000);
      } catch (err) {
        await showAlert({
          title: "Error",
          message: err.message || "Failed to start exam.",
        });
      } finally {
        setExamLoading(false);
      }
    },
    [clearExamControlPolling, clearWaitingPolling, forceAutoSubmitExam, loadActiveExams, persistStudentSession, pollExamControl, resetExamState, showAlert, token, user]
  );

  const checkExamStatus = useCallback(
    async (examId) => {
      try {
        const result = await apiRequest(`/exams/${examId}/status`, {}, token);
        const data = result.data || {};
        const participantCount = data.participants_count ?? data.participant_count ?? 0;
        setWaitingParticipantCount(participantCount);
        setWaitingLastUpdatedAt(new Date().toISOString());

        if (data.status === "in_progress") {
          setWaitingStatusMessage("Exam started. Opening exam...");
          clearWaitingPolling();
          await startExamSession(examId);
          return;
        }

        if (data.status === "completed") {
          setWaitingStatusMessage("Exam already completed.");
          clearWaitingPolling();
          await forceAutoSubmitExam(
            examId,
            "Time is up. Your exam was submitted automatically."
          );
          setWaitingExam(null);
          setWaitingParticipantCount(0);
          setView("dashboard");
          await loadMyResults();
          return;
        }

        setWaitingStatusMessage("Auto-checking exam status...");
      } catch (err) {
        setWaitingLastUpdatedAt(new Date().toISOString());
        setWaitingStatusMessage("Auto-check failed. Retrying...");
        console.error("Waiting room status check error:", err);
      }
    },
    [clearWaitingPolling, forceAutoSubmitExam, loadMyResults, startExamSession, token]
  );

  const enterWaitingRoom = useCallback(
    (exam) => {
      clearWaitingPolling();
      setWaitingExam(exam);
      setWaitingParticipantCount(0);
      setWaitingStatusMessage("Auto-checking exam status...");
      setWaitingLastUpdatedAt(null);
      setView("waiting");
      persistStudentSession("waiting", exam);

      checkExamStatus(exam.id);
      waitingPollIntervalRef.current = setInterval(() => {
        checkExamStatus(exam.id);
      }, 3000);
    },
    [checkExamStatus, clearWaitingPolling, persistStudentSession]
  );

  useEffect(() => {
    enterWaitingRoomRef.current = enterWaitingRoom;
  }, [enterWaitingRoom]);

  useEffect(() => {
    startExamSessionRef.current = startExamSession;
  }, [startExamSession]);

  // Restore the student into their previous waiting room or exam state
  // if they were in one when the app was closed/logged out.
  useEffect(() => {
    if (sessionRestoreAttemptedRef.current) return;
    if (!sessionStorageKey || !token) return;
    sessionRestoreAttemptedRef.current = true;

    let raw = null;
    try {
      raw = window.localStorage.getItem(sessionStorageKey);
    } catch (err) {
      raw = null;
    }
    if (!raw) return;

    let saved = null;
    try {
      saved = JSON.parse(raw);
    } catch (err) {
      saved = null;
    }
    if (!saved?.examId || !saved?.mode) {
      clearStudentSession();
      return;
    }

    (async () => {
      try {
        const result = await apiRequest(`/exams/${saved.examId}`, {}, token);
        const exam = result.data?.exam;
        if (!exam) {
          clearStudentSession();
          return;
        }
        if (exam.has_submitted || exam.status === "completed") {
          clearStudentSession();
          return;
        }
        if (exam.status === "in_progress" && startExamSessionRef.current) {
          await startExamSessionRef.current(exam.id);
          return;
        }
        if (enterWaitingRoomRef.current) {
          enterWaitingRoomRef.current(exam);
        }
      } catch (err) {
        // Restore failed (e.g. exam deleted / no longer accessible).
        clearStudentSession();
      }
    })();
  }, [clearStudentSession, sessionStorageKey, token]);

  const handleJoinExam = useCallback(
    async (event) => {
      event.preventDefault();
      setJoinError("");

      const normalizedName = studentNameInput.trim();
      const normalizedRoomCode = roomCodeInput.trim().toUpperCase();

      if (!normalizedName) {
        setJoinError("Please enter your name.");
        return;
      }

      if (normalizedRoomCode.length !== 6) {
        setJoinError("Please enter a valid 6-character room code.");
        return;
      }

      setJoiningExam(true);
      try {
        localStorage.setItem("studentDisplayName", normalizedName);
        const result = await apiRequest(
          "/exams/join",
          {
            method: "POST",
            body: JSON.stringify({
              roomCode: normalizedRoomCode,
              studentName: normalizedName,
            }),
          },
          token
        );

        const joinedExam = result.data.exam;
        setRoomCodeInput("");

        if (joinedExam.status === "in_progress") {
          persistStudentSession("exam", joinedExam);
          await startExamSession(joinedExam.id);
        } else {
          persistStudentSession("waiting", joinedExam);
          enterWaitingRoom(joinedExam);
        }

        await loadActiveExams();
      } catch (err) {
        setJoinError(err.message || "Failed to join exam.");
      } finally {
        setJoiningExam(false);
      }
    },
    [enterWaitingRoom, loadActiveExams, persistStudentSession, roomCodeInput, startExamSession, studentNameInput, token]
  );

  const handleLeaveWaitingRoom = useCallback(async () => {
    const confirmed = await showConfirm({
      title: "Leave Waiting Room",
      message: "Are you sure you want to leave the waiting room?",
      confirmText: "Leave",
      cancelText: "Stay",
    });

    if (!confirmed) {
      return;
    }

    clearWaitingPolling();
    clearStudentSession();
    setWaitingExam(null);
    setWaitingParticipantCount(0);
    setWaitingStatusMessage("Auto-checking exam status...");
    setWaitingLastUpdatedAt(null);
    setView("dashboard");
    await loadActiveExams();
  }, [clearStudentSession, clearWaitingPolling, loadActiveExams, showConfirm]);

  const handleRejoinExam = useCallback(
    async (examId) => {
      try {
        const result = await apiRequest(`/exams/${examId}`, {}, token);
        const exam = result.data.exam;
        enterWaitingRoom(exam);
      } catch (err) {
        await showAlert({
          title: "Error",
          message: err.message || "Failed to rejoin exam.",
        });
      }
    },
    [enterWaitingRoom, showAlert, token]
  );

  useEffect(() => {
    loadActiveExams();
    loadMyResults();
  }, [loadActiveExams, loadMyResults]);

  useEffect(() => {
    if (!examData?.questions) {
      return;
    }

    const nextCodingState = {};
    examData.questions.forEach((question) => {
      const qType = normalizeQuestionType(question.question_type);
      if (qType !== "coding") {
        return;
      }

      const questionId = Number(question.id);
      nextCodingState[questionId] = {
        language: "javascript",
        code: question.starter_code || defaultCodeForLanguage("javascript"),
        stdin: question.sample_input || "",
        stdout: "",
        stderr: "",
        running: false,
      };
    });

    setCodingState(nextCodingState);

    if (Object.keys(nextCodingState).length > 0) {
      setExamAnswers((prev) => {
        const merged = { ...prev };
        Object.entries(nextCodingState).forEach(([questionId, state]) => {
          merged[questionId] = {
            ...(merged[questionId] || {}),
            selected_answer: null,
            written_answer: state.code,
            language: state.language,
          };
        });
        return merged;
      });
    }
  }, [examData]);

  useEffect(() => {
    if (view !== "exam" || !examData) {
      return;
    }

    const startTime = examData.started_at ? new Date(examData.started_at) : new Date();
    const endTime = new Date(startTime.getTime() + Number(examData.duration) * 60 * 1000);

    const tick = () => {
      const now = new Date();
      const remaining = Math.floor((endTime - now) / 1000);

      if (remaining <= 0) {
        setTimerText("00:00");
        clearExamTimer();
        if (submitExamRef.current) {
          submitExamRef.current({
            autoSubmit: true,
            autoSubmitReason: "Time is up. Your exam was submitted automatically.",
          });
        }
        return;
      }

      setTimerText(formatTimerDisplay(remaining));
    };

    tick();
    examTimerIntervalRef.current = setInterval(tick, 1000);
    return () => {
      clearExamTimer();
    };
  }, [clearExamTimer, examData, view]);

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    const unsubscribeViolation = window.electronAPI.onViolation((_event, data) => {
      if (viewRef.current !== "exam") {
        return;
      }

      const violationTimestamp = data.timestamp || new Date().toISOString();
      const violationType = data.type || "UNKNOWN";
      const violationSeverity = data.severity || "medium";
      const violationMetaDetail = data.shortcut
        ? ` (${data.shortcut})`
        : data.processName
          ? ` (${data.processName})`
          : data.durationMs
            ? ` (${Math.round(Number(data.durationMs) / 1000)}s)`
            : "";

      const violationEntry = {
        type: violationType,
        severity: violationSeverity,
        timestamp: violationTimestamp,
      };

      setViolationCount((prev) => Number(data.count || prev + 1));
      setWarningSeverity(violationSeverity);
      setWarningMessage(`${String(violationSeverity).toUpperCase()} RISK: ${violationType}${violationMetaDetail}`);
      setExamViolations((prev) => [...prev, violationEntry]);

      const currentExamId = examDataRef.current?.id;
      if (currentExamId) {
        reportLiveViolation(currentExamId, violationEntry);
      }

      clearWarningTimer();
      warningTimeoutRef.current = setTimeout(() => {
        setWarningMessage("");
      }, 4000);
    });

    const unsubscribeForceSubmit = window.electronAPI.onForceSubmit(() => {
      if (viewRef.current !== "exam") {
        return;
      }

      if (submitExamRef.current) {
        submitExamRef.current({
          autoSubmit: true,
          autoSubmitReason: "Exam auto-submitted due to forbidden application.",
        });
      }
    });

    return () => {
      if (typeof unsubscribeViolation === "function") {
        unsubscribeViolation();
      }
      if (typeof unsubscribeForceSubmit === "function") {
        unsubscribeForceSubmit();
      }
    };
  }, [clearWarningTimer, reportLiveViolation]);

  useEffect(() => {
    return () => {
      if (typeof onExamModeChange === "function") {
        onExamModeChange(false);
      }
      clearWaitingPolling();
      clearExamTimer();
      clearExamControlPolling();
      clearWarningTimer();
    };
  }, [clearExamControlPolling, clearExamTimer, clearWaitingPolling, clearWarningTimer, onExamModeChange]);

  function handleMcqAnswerChange(questionId, selectedOption) {
    if (isExamBlocked) return;
    setExamAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || {}),
        selected_answer: selectedOption,
        written_answer: prev[questionId]?.written_answer || "",
      },
    }));
  }

  function handleWrittenAnswerChange(questionId, writtenText) {
    if (isExamBlocked) return;
    setExamAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || {}),
        selected_answer: prev[questionId]?.selected_answer ?? null,
        written_answer: writtenText,
      },
    }));
  }

  function handleCodingStateChange(question, patch) {
    if (isExamBlocked) return;
    const questionId = Number(question.id);
    let nextForAnswer = null;

    setCodingState((prev) => {
      const current = prev[questionId] || {
        language: "javascript",
        code: question.starter_code || defaultCodeForLanguage("javascript"),
        stdin: question.sample_input || "",
        stdout: "",
        stderr: "",
        running: false,
      };

      const next = { ...current, ...patch };
      if (patch.language && patch.code === undefined) {
        const hasUserCode = (next.code || "").trim().length > 0;
        if (!hasUserCode || next.code === current.code) {
          next.code = question.starter_code || defaultCodeForLanguage(patch.language);
        }
      }

      nextForAnswer = next;

      return {
        ...prev,
        [questionId]: next,
      };
    });

    if (patch.language !== undefined) {
      const languageValue = nextForAnswer?.language || "javascript";
      setExamAnswers((prev) => ({
        ...prev,
        [questionId]: {
          ...(prev[questionId] || {}),
          selected_answer: null,
          written_answer: prev[questionId]?.written_answer || "",
          language: languageValue,
        },
      }));
    }
  }

  function handleCodeEditorMount(editor) {
    editor.updateOptions({
      readOnly: isExamBlocked,
      domReadOnly: isExamBlocked,
    });
  }

  async function handleRunCode(question) {
    if (!examData || isExamBlocked) {
      return;
    }

    const questionId = Number(question.id);
    const current = codingState[questionId] || {
      language: "javascript",
      code: question.starter_code || defaultCodeForLanguage("javascript"),
      stdin: question.sample_input || "",
      stdout: "",
      stderr: "",
      running: false,
    };

    handleCodingStateChange(question, { running: true, stdout: "", stderr: "" });

    try {
      const result = await apiRequest(
        `/exams/${examData.id}/run-code`,
        {
          method: "POST",
          body: JSON.stringify({
            question_id: questionId,
            language: current.language,
            code: current.code,
            stdin: current.stdin,
          }),
        },
        token
      );

      handleCodingStateChange(question, {
        running: false,
        stdout: result.data?.stdout || "",
        stderr: result.data?.stderr || "",
      });
    } catch (err) {
      handleCodingStateChange(question, {
        running: false,
        stdout: "",
        stderr: err.message || "Execution failed",
      });
    }
  }

  function handleResetCode(question) {
    if (isExamBlocked) return;
    const questionId = Number(question.id);
    const current = codingState[questionId] || {
      language: "javascript",
    };
    const language = current.language || "javascript";
    const nextCode = question.starter_code || defaultCodeForLanguage(language);
    handleCodingStateChange(question, {
      code: nextCode,
      stdout: "",
      stderr: "",
    });
  }

  // ─── RENDER: Dashboard ────────────────────────────────────────────
  function renderDashboardView() {
    const waitingCount = activeExams.filter((exam) => String(exam.status || "").toLowerCase() === "waiting").length;
    const liveCount = activeExams.filter((exam) => String(exam.status || "").toLowerCase() === "in_progress").length;

    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">
            Student workspace
          </p>
          <h1 className="text-2xl font-semibold text-ink tracking-tight mt-1">
            Hello, {user?.name || user?.email || "student"}
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Join an exam by room code, or continue where you left off below.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Join an exam</CardTitle>
              <CardDescription>
                Enter your display name and the 6-character room code your teacher shared.
              </CardDescription>
            </div>
            <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-md bg-primary-subtle text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleJoinExam} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Your name" htmlFor="student-name" required>
                  <Input
                    id="student-name"
                    type="text"
                    value={studentNameInput}
                    onChange={(event) => setStudentNameInput(event.target.value)}
                    placeholder="Your full name"
                    required
                    leftIcon={<User className="h-4 w-4" />}
                  />
                </FormField>
                <FormField label="Room code" htmlFor="room-code" required>
                  <Input
                    id="room-code"
                    type="text"
                    value={roomCodeInput}
                    onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                    placeholder="AB3X7Y"
                    maxLength={6}
                    required
                    leftIcon={<KeyRound className="h-4 w-4" />}
                    className="uppercase tracking-[0.3em] font-semibold"
                  />
                </FormField>
              </div>

              {joinError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-danger-subtle bg-danger-subtle/40 px-3 py-2.5 text-sm text-danger"
                >
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{joinError}</span>
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button type="submit" disabled={joiningExam} size="lg">
                  {joiningExam ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Joining…
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" /> Join exam
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>My active exams</CardTitle>
              <CardDescription>Track waiting and live exams in one place.</CardDescription>
            </div>
            <IconButton
              aria-label="Refresh active exams"
              tooltip="Refresh"
              variant="secondary"
              onClick={loadActiveExams}
              disabled={loadingActiveExams}
            >
              <RefreshCw className={cn("h-4 w-4", loadingActiveExams && "animate-spin")} />
            </IconButton>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">Total {activeExams.length}</Badge>
              <Badge variant="warning">
                <Hourglass className="h-3 w-3" /> Waiting {waitingCount}
              </Badge>
              <Badge variant="success">
                <CircleDot className="h-3 w-3" /> Live {liveCount}
              </Badge>
            </div>

            {loadingActiveExams ? (
              <div className="flex items-center gap-2 text-ink-muted text-sm py-4">
                <Spinner /> Loading active exams…
              </div>
            ) : activeExams.length === 0 ? (
              <EmptyState
                icon={BookOpenCheck}
                title="No active exams"
                description="Join an exam above using a room code from your teacher."
              />
            ) : (
              <ul className="space-y-2">
                {activeExams.map((exam) => (
                  <li
                    key={exam.id}
                    className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4 hover:border-border-strong transition-colors flex-wrap"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-ink">{exam.title}</p>
                        <Badge variant={getExamStatusBadgeVariant(exam.status)}>
                          {exam.status === "in_progress" ? (
                            <>
                              <CircleDot className="h-3 w-3" /> Live
                            </>
                          ) : exam.status === "waiting" ? (
                            <>
                              <Hourglass className="h-3 w-3" /> Waiting
                            </>
                          ) : (
                            exam.status
                          )}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
                        <Badge variant="outline">
                          <Timer className="h-3 w-3" /> {exam.duration} min
                        </Badge>
                        <Badge variant="outline">
                          <FileText className="h-3 w-3" /> {exam.question_count || 0} q
                        </Badge>
                      </div>
                    </div>
                    {exam.status === "waiting" ? (
                      <Button variant="secondary" size="sm" onClick={() => handleRejoinExam(exam.id)}>
                        <Hourglass className="h-4 w-4" /> Waiting room
                      </Button>
                    ) : null}
                    {exam.status === "in_progress" ? (
                      <Button size="sm" onClick={() => startExamSession(exam.id)} disabled={examLoading}>
                        {examLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Opening…
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" /> Start exam
                          </>
                        )}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>My results</CardTitle>
              <CardDescription>Previously submitted exam outcomes.</CardDescription>
            </div>
            <IconButton
              aria-label="Refresh results"
              tooltip="Refresh"
              variant="secondary"
              onClick={loadMyResults}
              disabled={loadingResults}
            >
              <RefreshCw className={cn("h-4 w-4", loadingResults && "animate-spin")} />
            </IconButton>
          </CardHeader>
          <CardBody>
            {loadingResults ? (
              <div className="flex items-center gap-2 text-ink-muted text-sm py-4">
                <Spinner /> Loading results…
              </div>
            ) : results.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="No submitted exams yet"
                description="Results appear here after you submit an exam."
              />
            ) : (
              <ul className="space-y-2">
                {results.map((result) => {
                  const isCompleted = String(result.evaluation_status || "").toLowerCase() === "completed";
                  return (
                    <li
                      key={result.submission_id}
                      className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4 hover:border-border-strong transition-colors flex-wrap"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-ink">{result.exam_title}</p>
                          <Badge variant={isCompleted ? "success" : "warning"}>
                            {isCompleted ? (
                              <>
                                <CheckCircle2 className="h-3 w-3" /> Completed
                              </>
                            ) : (
                              <>
                                <Clock className="h-3 w-3" /> Pending
                              </>
                            )}
                          </Badge>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
                          <Badge variant="outline">{result.exam_type || "lab_quiz"}</Badge>
                          <Badge variant="outline">Submitted {formatDateTime(result.submitted_at)}</Badge>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
                          <Badge variant="info">Auto {result.auto_score ?? 0}</Badge>
                          <Badge variant="primary">Manual {result.manual_score ?? 0}</Badge>
                          <Badge variant="success">Total {result.score ?? 0}</Badge>
                        </div>
                      </div>
                      <IconButton
                        aria-label="View details"
                        tooltip="View details"
                        variant="secondary"
                        onClick={() => loadResultDetails(result.submission_id)}
                        disabled={loadingResultDetails}
                      >
                        <Eye className="h-4 w-4" />
                      </IconButton>
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

  // ─── RENDER: Waiting Room ─────────────────────────────────────────
  function renderWaitingView() {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-xl">
          <CardBody className="p-8 text-center space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-subtle text-primary">
              <Hourglass className="h-8 w-8 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                Standby
              </p>
              <h2 className="text-2xl font-semibold text-ink mt-2">Waiting room</h2>
              <p className="text-sm text-ink-muted mt-2">
                Please wait for your teacher to start the exam.
              </p>
            </div>

            {waitingExam ? (
              <div className="grid gap-3 sm:grid-cols-2 text-left">
                <div className="rounded-md border border-border bg-bg p-3">
                  <p className="text-xs uppercase tracking-wide text-ink-subtle font-medium">
                    Exam title
                  </p>
                  <p className="text-sm font-semibold text-ink mt-1 truncate">
                    {waitingExam.title}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-bg p-3">
                  <p className="text-xs uppercase tracking-wide text-ink-subtle font-medium">
                    Duration
                  </p>
                  <p className="text-sm font-semibold text-ink mt-1 tabular-nums">
                    {waitingExam.duration} min
                  </p>
                </div>
                <div className="rounded-md border border-border bg-bg p-3">
                  <p className="text-xs uppercase tracking-wide text-ink-subtle font-medium">
                    Questions
                  </p>
                  <p className="text-sm font-semibold text-ink mt-1 tabular-nums">
                    {waitingExam.question_count || 0}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-bg p-3">
                  <p className="text-xs uppercase tracking-wide text-ink-subtle font-medium">
                    Participants
                  </p>
                  <p className="text-sm font-semibold text-ink mt-1 tabular-nums flex items-center gap-1.5 justify-start">
                    <Users className="h-4 w-4 text-ink-muted" />
                    {waitingParticipantCount}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="space-y-1 text-xs text-ink-muted">
              <p className="flex items-center justify-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {waitingStatusMessage}
              </p>
              <p>
                Last updated: {waitingLastUpdatedAt ? formatDateTime(waitingLastUpdatedAt) : "Checking…"}
              </p>
            </div>

            <div className="flex justify-center">
              <Button variant="secondary" onClick={handleLeaveWaitingRoom}>
                <ChevronLeft className="h-4 w-4" /> Leave waiting room
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  // ─── RENDER: Result Details ─────────────────────────────────────────
  function renderResultDetailsView() {
    if (!selectedResultDetails) {
      return (
        <div className="mx-auto max-w-2xl px-4 py-8">
          <Card>
            <CardBody className="text-center space-y-4">
              <p className="text-sm text-ink-muted">Result details not available.</p>
              <div className="flex justify-center">
                <Button variant="secondary" onClick={() => setView("dashboard")}>
                  <ArrowLeft className="h-4 w-4" /> Back to dashboard
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <IconButton
              aria-label="Back to dashboard"
              tooltip="Back to dashboard"
              variant="secondary"
              onClick={() => setView("dashboard")}
            >
              <ArrowLeft className="h-4 w-4" />
            </IconButton>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                Result details
              </p>
              <h1 className="text-xl font-semibold text-ink">{selectedResultDetails.exam_title}</h1>
              <p className="text-xs text-ink-muted mt-0.5">
                Submitted {formatDateTime(selectedResultDetails.submitted_at)} ·{" "}
                {getEvaluationStatusLabel(selectedResultDetails.evaluation_status)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={Award} label="Auto score" value={selectedResultDetails.auto_score ?? 0} tone="info" />
          <Stat icon={FileText} label="Manual score" value={selectedResultDetails.manual_score ?? 0} tone="primary" />
          <Stat icon={Trophy} label="Total" value={selectedResultDetails.score ?? 0} tone="success" />
        </div>

        <div className="space-y-4">
          {(selectedResultDetails.answers || []).map((item, index) => {
            const qType = normalizeQuestionType(item.question_type);
            const earned = item.awarded_marks ?? 0;
            const max = item.max_marks ?? 0;
            return (
              <Card key={item.question_id}>
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="primary">#{index + 1}</Badge>
                      <Badge variant={qType === "mcq" ? "info" : qType === "coding" ? "warning" : "outline"}>
                        {qType === "mcq" ? "MCQ" : qType === "coding" ? "Coding" : "Written"}
                      </Badge>
                    </div>
                    <Badge variant={earned === max ? "success" : earned === 0 ? "danger" : "warning"}>
                      {earned} / {max} marks
                    </Badge>
                  </div>
                  <p className="text-sm font-medium text-ink whitespace-pre-wrap">
                    {item.question_text}
                  </p>

                  {qType === "mcq" ? (
                    <div className="rounded-md border border-border bg-bg p-3 space-y-1.5 text-sm">
                      <p className="text-ink-muted text-xs">
                        Selected:{" "}
                        <span className="text-ink font-medium">
                          {item.selected_answer === null || item.selected_answer === undefined
                            ? "No answer"
                            : String.fromCharCode(65 + Number(item.selected_answer))}
                        </span>
                      </p>
                      <p className="text-ink-muted text-xs">
                        Correct:{" "}
                        <span className="text-ink font-medium">
                          {item.correct_answer === null || item.correct_answer === undefined || item.correct_answer === ""
                            ? "N/A"
                            : String.fromCharCode(65 + Number(item.correct_answer))}
                        </span>
                      </p>
                      <p className="text-xs flex items-center gap-1.5">
                        {item.is_correct ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            <span className="text-success font-medium">Correct</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3.5 w-3.5 text-danger" />
                            <span className="text-danger font-medium">Incorrect</span>
                          </>
                        )}
                      </p>
                    </div>
                  ) : qType === "coding" ? (
                    <>
                      <div>
                        <p className="text-xs text-ink-muted mb-1.5">
                          Your code ({item.language || "unknown"}):
                        </p>
                        <pre className="rounded-md bg-bg border border-border p-3 text-xs font-mono text-ink overflow-x-auto">
                          {item.written_answer || "// No code submitted."}
                        </pre>
                      </div>
                      {item.evaluation_comment ? (
                        <div className="rounded-md border border-info-subtle bg-info-subtle/30 p-3 text-sm text-ink">
                          <p className="text-xs font-medium text-info uppercase tracking-wide mb-1">Teacher comment</p>
                          <p className="whitespace-pre-wrap">{item.evaluation_comment}</p>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-xs text-ink-muted mb-1.5">Your answer:</p>
                        <pre className="rounded-md bg-bg border border-border p-3 text-sm text-ink whitespace-pre-wrap font-sans">
                          {item.written_answer || "No answer submitted."}
                        </pre>
                      </div>
                      {item.evaluation_comment ? (
                        <div className="rounded-md border border-info-subtle bg-info-subtle/30 p-3 text-sm text-ink">
                          <p className="text-xs font-medium text-info uppercase tracking-wide mb-1">Teacher comment</p>
                          <p className="whitespace-pre-wrap">{item.evaluation_comment}</p>
                        </div>
                      ) : null}
                    </>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── RENDER: Exam Taker ─────────────────────────────────────────────
  function renderExamView() {
    if (!examData) {
      return (
        <div className="mx-auto max-w-2xl px-4 py-8">
          <Card>
            <CardBody className="text-center space-y-4">
              <p className="text-sm text-ink-muted">Exam data not found.</p>
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setView("dashboard");
                    loadActiveExams();
                  }}
                >
                  <ArrowLeft className="h-4 w-4" /> Back to dashboard
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      );
    }

    const questionFlowMode = normalizeQuestionFlowMode(examData.question_flow_mode);
    const isOneByOneFlow = questionFlowMode === "one_by_one";
    const questions = Array.isArray(examData.questions) ? examData.questions : [];
    const totalQuestions = questions.length;
    const safeQuestionIndex = totalQuestions > 0
      ? Math.min(Math.max(currentQuestionIndex, 0), totalQuestions - 1)
      : 0;
    const visibleQuestions = isOneByOneFlow
      ? questions.slice(safeQuestionIndex, safeQuestionIndex + 1)
      : questions;
    const activeQuestion = isOneByOneFlow && totalQuestions > 0 ? questions[safeQuestionIndex] : null;
    const activeAnswerState = activeQuestion ? (examAnswers[activeQuestion.id] || {}) : {};
    const activeCodeState = activeQuestion
      ? (codingState[Number(activeQuestion.id)] || {
          language: "javascript",
          code: activeQuestion.starter_code || defaultCodeForLanguage("javascript"),
          stdin: activeQuestion.sample_input || "",
          stdout: "",
          stderr: "",
          running: false,
        })
      : null;
    const activeQuestionAnswered = activeQuestion
      ? isQuestionAnswered(activeQuestion, activeAnswerState, activeCodeState)
      : false;
    const canGoPrevious = isOneByOneFlow && safeQuestionIndex > 0;
    const canGoNext = isOneByOneFlow
      && safeQuestionIndex < totalQuestions - 1
      && activeQuestionAnswered;

    return (
      <div className="min-h-screen bg-bg">
        {/* Sticky exam chrome */}
        <div className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-subtle text-primary shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Exam in progress
                </p>
                <h1 className="text-sm font-semibold text-ink truncate">{examData.title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5",
                  Number(timerText.replace(":", "")) > 500
                    ? "border-border bg-bg"
                    : "border-warning bg-warning-subtle"
                )}
                aria-live="polite"
              >
                <Clock className="h-4 w-4 text-ink-muted" />
                <span className="text-sm font-mono font-semibold text-ink tabular-nums tracking-tight">
                  {timerText}
                </span>
              </div>
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5",
                  violationCount > 0
                    ? "border-danger bg-danger-subtle text-danger"
                    : "border-border bg-bg text-ink-muted"
                )}
                aria-live="polite"
              >
                <ShieldAlert className="h-4 w-4" />
                <span className="text-sm font-medium tabular-nums">
                  {violationCount} violation{violationCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6 space-y-5">
          {/* Exam description + proctoring camera */}
          <Card>
            <CardBody className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                {examData.description ? (
                  <p className="text-sm text-ink-muted">{examData.description}</p>
                ) : (
                  <p className="text-sm text-ink-subtle italic">No description provided.</p>
                )}
                <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                  <Badge variant="outline">
                    <Timer className="h-3 w-3" /> {examData.duration} min
                  </Badge>
                  <Badge variant="outline">
                    <FileText className="h-3 w-3" /> {totalQuestions} questions
                  </Badge>
                  <Badge variant="outline">
                    {isOneByOneFlow ? "One at a time" : "All at once"}
                  </Badge>
                  {Boolean(examData.randomize_question_order) ? (
                    <Badge variant="outline">Randomized</Badge>
                  ) : null}
                  {Boolean(examData.webcam_required) ? (
                    <Badge variant="success">
                      <ShieldCheck className="h-3 w-3" /> Proctored
                    </Badge>
                  ) : null}
                </div>
              </div>
              <ProctoringCamera
                token={token}
                examId={examData.id}
                enabled={Boolean(examData.webcam_required)}
              />
            </CardBody>
          </Card>

          {warningMessage ? (
            <div
              role="alert"
              aria-live="assertive"
              className={cn(
                "flex items-start gap-3 rounded-lg border-2 px-4 py-3 animate-slide-up",
                warningSeverity === "high"
                  ? "border-danger bg-danger-subtle text-danger"
                  : "border-warning bg-warning-subtle text-warning"
              )}
            >
              <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-bold uppercase tracking-wide">{warningMessage}</p>
                <p className="text-xs mt-1 opacity-80">
                  Repeated violations may result in your exam being force-submitted by your teacher.
                </p>
              </div>
            </div>
          ) : null}

          {/* Questions */}
          {totalQuestions === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon={FileText}
                  title="No questions available"
                  description="Contact your teacher if you believe this is an error."
                />
              </CardBody>
            </Card>
          ) : (
            <div className="space-y-4">
              {visibleQuestions.map((question, visibleIndex) => {
                const index = isOneByOneFlow ? safeQuestionIndex : visibleIndex;
                const qType = normalizeQuestionType(question.question_type);
                const answerState = examAnswers[question.id] || {};
                const codeState = codingState[Number(question.id)] || {
                  language: "javascript",
                  code: question.starter_code || defaultCodeForLanguage("javascript"),
                  stdin: question.sample_input || "",
                  stdout: "",
                  stderr: "",
                  running: false,
                };
                const answered = isQuestionAnswered(question, answerState, codeState);
                return (
                  <Card key={question.id}>
                    <CardBody className="space-y-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Badge variant="primary">Question {index + 1}</Badge>
                          <Badge variant={qType === "mcq" ? "info" : qType === "coding" ? "warning" : "outline"}>
                            {qType === "mcq" ? "MCQ" : qType === "coding" ? <>
                              <Code2 className="h-3 w-3" /> Coding
                            </> : "Written"}
                          </Badge>
                          <Badge variant="neutral">{question.marks} marks</Badge>
                          {answered ? (
                            <Badge variant="success">
                              <CheckCircle2 className="h-3 w-3" /> Answered
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <p className="text-base font-medium text-ink whitespace-pre-wrap leading-relaxed">
                        {question.question_text}
                      </p>

                      {qType === "written" ? (
                        <FormField label="Your answer" htmlFor={`written-${question.id}`}>
                          <Textarea
                            id={`written-${question.id}`}
                            rows={6}
                            value={answerState.written_answer || ""}
                            onChange={(event) => handleWrittenAnswerChange(question.id, event.target.value)}
                            placeholder="Type your answer here…"
                            disabled={isExamBlocked}
                          />
                        </FormField>
                      ) : qType === "coding" ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3 flex-wrap">
                            <FormField label="Language" htmlFor={`lang-${question.id}`} className="w-40">
                              <select
                                id={`lang-${question.id}`}
                                value={codeState.language}
                                onChange={(event) =>
                                  handleCodingStateChange(question, { language: event.target.value })
                                }
                                disabled={isExamBlocked}
                                className="h-10 w-full rounded-md bg-surface border border-border px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-ring disabled:opacity-60"
                              >
                                <option value="javascript">JavaScript</option>
                                <option value="python">Python</option>
                                <option value="cpp">C++</option>
                              </select>
                            </FormField>
                          </div>

                          {(question.sample_input || question.sample_output) ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="rounded-md border border-border bg-bg p-3">
                                <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wide mb-1.5">
                                  Sample input
                                </p>
                                <pre className="text-xs font-mono text-ink whitespace-pre-wrap">
                                  {question.sample_input || "(none)"}
                                </pre>
                              </div>
                              <div className="rounded-md border border-border bg-bg p-3">
                                <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wide mb-1.5">
                                  Sample output
                                </p>
                                <pre className="text-xs font-mono text-ink whitespace-pre-wrap">
                                  {question.sample_output || "(none)"}
                                </pre>
                              </div>
                            </div>
                          ) : null}

                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wide">
                                Code editor
                              </p>
                            </div>
                            <div className="rounded-lg border border-border overflow-hidden bg-surface">
                              <Editor
                                height={codeEditorHeight}
                                path={`question-${question.id}.${codeState.language === "cpp" ? "cpp" : codeState.language === "python" ? "py" : "js"}`}
                                language={codeState.language === "cpp" ? "cpp" : codeState.language}
                                value={codeState.code}
                                theme="vs"
                                options={monacoEditorOptions}
                                loading={
                                  <div className="flex items-center gap-2 text-ink-muted text-sm p-4">
                                    <Spinner /> Loading editor…
                                  </div>
                                }
                                onMount={handleCodeEditorMount}
                                onChange={(value) =>
                                  handleCodingStateChange(question, { code: value || "" })
                                }
                              />
                            </div>
                          </div>

                          <FormField label="Custom input (stdin)" htmlFor={`stdin-${question.id}`}>
                            <Textarea
                              id={`stdin-${question.id}`}
                              rows={3}
                              value={codeState.stdin}
                              onChange={(event) =>
                                handleCodingStateChange(question, { stdin: event.target.value })
                              }
                              placeholder="Provide input for your program…"
                              disabled={isExamBlocked}
                              className="font-mono text-xs"
                            />
                          </FormField>

                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => handleRunCode(question)}
                              disabled={codeState.running || isExamBlocked}
                            >
                              {codeState.running ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" /> Running…
                                </>
                              ) : (
                                <>
                                  <Play className="h-4 w-4" /> Run code
                                </>
                              )}
                            </Button>
                            <IconButton
                              aria-label="Reset to starter code"
                              tooltip="Reset to starter code"
                              variant="secondary"
                              onClick={() => handleResetCode(question)}
                              disabled={isExamBlocked}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </IconButton>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-md border border-border bg-bg p-3">
                              <p className="text-xs font-semibold text-success uppercase tracking-wide mb-1.5">
                                stdout
                              </p>
                              <pre className="text-xs font-mono text-ink whitespace-pre-wrap min-h-[3rem]">
                                {codeState.stdout || "(empty)"}
                              </pre>
                            </div>
                            <div className="rounded-md border border-border bg-bg p-3">
                              <p className="text-xs font-semibold text-danger uppercase tracking-wide mb-1.5">
                                stderr
                              </p>
                              <pre className="text-xs font-mono text-ink whitespace-pre-wrap min-h-[3rem]">
                                {codeState.stderr || "(empty)"}
                              </pre>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(question.options || []).map((option, optIndex) => {
                            const selected = answerState.selected_answer === optIndex;
                            return (
                              <label
                                key={`${question.id}-${optIndex}`}
                                className={cn(
                                  "flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-all",
                                  "focus-within:ring-2 focus-within:ring-primary-ring focus-within:ring-offset-2 focus-within:ring-offset-bg",
                                  selected
                                    ? "border-primary bg-primary-subtle/50 shadow-xs"
                                    : "border-border bg-surface hover:border-border-strong hover:bg-bg",
                                  isExamBlocked && "opacity-60 cursor-not-allowed"
                                )}
                              >
                                <input
                                  type="radio"
                                  name={`question-${question.id}`}
                                  checked={selected}
                                  onChange={() => handleMcqAnswerChange(question.id, optIndex)}
                                  disabled={isExamBlocked}
                                  className="sr-only"
                                />
                                <span
                                  className={cn(
                                    "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                                    selected
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border-strong bg-surface text-ink-muted"
                                  )}
                                >
                                  {String.fromCharCode(65 + optIndex)}
                                </span>
                                <span className={cn("flex-1 text-sm", selected ? "text-ink font-medium" : "text-ink")}>
                                  {option}
                                </span>
                                {selected ? (
                                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                                ) : null}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </CardBody>
                  </Card>
                );
              })}

              {isOneByOneFlow ? (
                <Card>
                  <CardBody className="space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="primary">
                          Question {safeQuestionIndex + 1} of {totalQuestions}
                        </Badge>
                        <Badge variant="outline">
                          {Boolean(examData.randomize_question_order) ? "Randomized" : "Fixed"} order
                        </Badge>
                      </div>
                      <p className="text-xs text-ink-muted">
                        {safeQuestionIndex === totalQuestions - 1
                          ? "Last question — submit when ready."
                          : activeQuestionAnswered
                            ? "Answer saved. Continue when ready."
                            : "Answer this question to unlock Next."}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <IconButton
                        aria-label="Previous question"
                        tooltip="Previous"
                        variant="secondary"
                        onClick={() => setCurrentQuestionIndex((prev) => Math.max(prev - 1, 0))}
                        disabled={!canGoPrevious || isExamBlocked}
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </IconButton>
                      <div className="flex-1 mx-2 h-1.5 rounded-full bg-border overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{
                            width: `${((safeQuestionIndex + 1) / totalQuestions) * 100}%`,
                          }}
                        />
                      </div>
                      <IconButton
                        aria-label="Next question"
                        tooltip="Next"
                        variant="primary"
                        onClick={() => setCurrentQuestionIndex((prev) => Math.min(prev + 1, totalQuestions - 1))}
                        disabled={!canGoNext || isExamBlocked}
                      >
                        <ChevronRight className="h-5 w-5" />
                      </IconButton>
                    </div>
                  </CardBody>
                </Card>
              ) : null}
            </div>
          )}

          {/* Submit row */}
          <Card>
            <CardBody className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <Info className="h-4 w-4" />
                Once submitted, answers cannot be changed.
              </div>
              <div className="flex items-center gap-2">
                <IconButton
                  aria-label="Exit disabled during exam"
                  tooltip="Exit is disabled during exam mode"
                  variant="ghost"
                  disabled
                >
                  <Lock className="h-4 w-4" />
                </IconButton>
                <Button
                  size="lg"
                  onClick={() => submitExam()}
                  disabled={submittingExam || isExamBlocked}
                >
                  {submittingExam ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" /> Submit exam
                    </>
                  )}
                </Button>
              </div>
            </CardBody>
          </Card>

          {examSubmitMessage ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger-subtle bg-danger-subtle/40 px-3 py-2.5 text-sm text-danger"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{examSubmitMessage}</span>
            </div>
          ) : null}
        </div>

        {/* Screen-lock overlay */}
        {isExamBlocked ? (
          <div
            role="alertdialog"
            aria-modal="true"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/90 backdrop-blur animate-fade-in px-4"
          >
            <div className="max-w-md text-center space-y-4 text-white">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-danger/20 text-white border-2 border-danger">
                <Lock className="h-10 w-10" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight">Screen locked</h2>
              <p className="text-base opacity-90">Your teacher has blocked your exam screen.</p>
              <p className="text-sm opacity-70">
                You cannot make any changes while blocked. Wait for your teacher to unblock you.
              </p>
            </div>
          </div>
        ) : null}

        {/* Force-submit overlay — brief notice while we auto-submit */}
        {isTeacherForceSubmitting ? (
          <div
            role="alertdialog"
            aria-modal="true"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/85 backdrop-blur-sm animate-fade-in px-4"
          >
            <div className="max-w-md text-center space-y-4 rounded-xl bg-surface text-ink shadow-xl px-6 py-8 border border-border">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-semibold">Exam submitted by teacher</h2>
              <p className="text-sm text-ink-muted">
                Your answers were submitted automatically. Returning to dashboard…
              </p>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn(view === "exam" ? "" : "mx-auto max-w-[1200px] w-full px-4 sm:px-6 py-6 sm:py-8")}>
      {view === "dashboard" ? renderDashboardView() : null}
      {view === "waiting" ? renderWaitingView() : null}
      {view === "exam" ? renderExamView() : null}
      {view === "result-details" ? renderResultDetailsView() : null}
    </div>
  );
}
