import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { apiRequest } from "../../api";
import { useModal } from "../../components/modals/ModalProvider";
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
      "}"
    ].join("\n");
  }
  return "// Write your JavaScript solution here\n";
}

function buildFormattedAnswers(answerSource, codingSource) {
  const mergedAnswers = { ...(answerSource || {}) };

  Object.entries(codingSource || {}).forEach(([questionId, coding]) => {
    mergedAnswers[questionId] = {
      ...(mergedAnswers[questionId] || {}),
      selected_answer: null,
      written_answer: coding?.code || "",
      language: coding?.language || "javascript"
    };
  });

  return Object.entries(mergedAnswers).map(([questionId, answer]) => ({
    question_id: Number(questionId),
    selected_answer: answer.selected_answer ?? null,
    written_answer: answer.written_answer ?? "",
    language: answer.language || ""
  }));
}

function getExamStatusToneClass(status) {
  const normalized = String(status || "waiting").toLowerCase();
  if (normalized === "in_progress") return "student-chip-live";
  if (normalized === "completed") return "student-chip-done";
  return "student-chip-wait";
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
      tabSize: 2
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
        message: err.message || "Failed to load active exams."
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
        message: err.message || "Failed to load exam results."
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
          message: err.message || "Failed to load result details."
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
              timestamp: violation.timestamp || new Date().toISOString()
            })
          },
          token
        );
      } catch (error) {
        // Best-effort live reporting; keep exam flow uninterrupted.
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
    async (examId, autoSubmitReason) => {
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
        const result = await apiRequest(
          `/exams/${examId}/submit`,
          {
            method: "POST",
            body: JSON.stringify({
              answers: formattedAnswers,
              violations: violationSource
            })
          },
          token
        );

        if (window.electronAPI?.submitExam) {
          try {
            await window.electronAPI.submitExam({
              examId,
              answers: formattedAnswers
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
          message: `${autoSubmitReason}\n\nExam submitted successfully.\n${scoreLine}${pendingLine}`
        });

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

        if (!alreadySubmitted) {
          setExamSubmitMessage(messageText || "Failed to auto-submit exam. Please contact your teacher.");
          await showAlert({
            title: "Auto Submission Issue",
            message: `${autoSubmitReason}\n\n${messageText || "Failed to auto-submit exam."}`
          });
        }

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
    [clearExamControlPolling, clearExamTimer, clearWaitingPolling, loadActiveExams, loadMyResults, resetExamState, showAlert, token]
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
          message: "Your teacher has blocked your exam screen. Wait until you are unblocked."
        });
        return;
      }

      const confirmed = await showConfirm({
        title: "Submit Exam",
        message: "Are you sure you want to submit your exam? You cannot change answers after submission.",
        confirmText: "Submit",
        cancelText: "Cancel"
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
              violations: examViolationsRef.current
            })
          },
          token
        );

        if (window.electronAPI?.submitExam) {
          try {
            await window.electronAPI.submitExam({
              examId: activeExam.id,
              answers: formattedAnswers
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
          message: `Exam submitted successfully.\n${scoreLine}${pendingLine}`
        });

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
      clearWaitingPolling,
      forceAutoSubmitExam,
      isExamBlocked,
      loadActiveExams,
      loadMyResults,
      resetExamState,
      showAlert,
      showConfirm,
      token
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
          if (submitExamRef.current) {
            submitExamRef.current({
              autoSubmit: true,
              autoSubmitReason: "Your teacher force-submitted your exam."
            });
          }
        }
      } catch (err) {
        console.error("Exam control poll error:", err);
      }
    },
    [clearExamControlPolling, token]
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
            message: "You have already submitted this exam. You cannot take it again."
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

        // Webcam proctoring consent + camera pre-check
        if (exam.webcam_required) {
          const agreed = await showConfirm({
            title: "Webcam Required",
            message:
              "This exam requires your webcam for proctoring. Your camera will be active throughout the exam and periodic snapshots will be recorded for the teacher to review. Do you want to allow camera access and proceed?",
            confirmText: "Allow & Start Exam",
            cancelText: "Cancel"
          });

          if (!agreed) {
            setExamLoading(false);
            return;
          }

          // Test camera access before entering — gives a clear error early
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
        setView("exam");

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
          message: err.message || "Failed to start exam."
        });
      } finally {
        setExamLoading(false);
      }
    },
    [clearExamControlPolling, clearWaitingPolling, forceAutoSubmitExam, loadActiveExams, pollExamControl, resetExamState, showAlert, token, user]
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

      checkExamStatus(exam.id);
      waitingPollIntervalRef.current = setInterval(() => {
        checkExamStatus(exam.id);
      }, 3000);
    },
    [checkExamStatus, clearWaitingPolling]
  );

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
              studentName: normalizedName
            })
          },
          token
        );

        const joinedExam = result.data.exam;
        setRoomCodeInput("");

        if (joinedExam.status === "in_progress") {
          await startExamSession(joinedExam.id);
        } else {
          enterWaitingRoom(joinedExam);
        }

        await loadActiveExams();
      } catch (err) {
        setJoinError(err.message || "Failed to join exam.");
      } finally {
        setJoiningExam(false);
      }
    },
    [enterWaitingRoom, loadActiveExams, roomCodeInput, startExamSession, studentNameInput, token]
  );

  const handleLeaveWaitingRoom = useCallback(async () => {
    const confirmed = await showConfirm({
      title: "Leave Waiting Room",
      message: "Are you sure you want to leave the waiting room?",
      confirmText: "Leave",
      cancelText: "Stay"
    });

    if (!confirmed) {
      return;
    }

    clearWaitingPolling();
    setWaitingExam(null);
    setWaitingParticipantCount(0);
    setWaitingStatusMessage("Auto-checking exam status...");
    setWaitingLastUpdatedAt(null);
    setView("dashboard");
    await loadActiveExams();
  }, [clearWaitingPolling, loadActiveExams, showConfirm]);

  const handleRejoinExam = useCallback(
    async (examId) => {
      try {
        const result = await apiRequest(`/exams/${examId}`, {}, token);
        const exam = result.data.exam;
        enterWaitingRoom(exam);
      } catch (err) {
        await showAlert({
          title: "Error",
          message: err.message || "Failed to rejoin exam."
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
        running: false
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
            language: state.language
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
            autoSubmitReason: "Time is up. Your exam was submitted automatically."
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

      const violationEntry = {
        type: data.type || "UNKNOWN",
        severity: data.severity || "medium",
        timestamp: new Date().toISOString()
      };

      setViolationCount(data.count || 0);
      setWarningSeverity(data.severity || "medium");
      setWarningMessage(`${String(data.severity || "medium").toUpperCase()} RISK: ${data.type}`);
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
          autoSubmitReason: "Exam auto-submitted due to forbidden application."
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
        written_answer: prev[questionId]?.written_answer || ""
      }
    }));
  }

  function handleWrittenAnswerChange(questionId, writtenText) {
    if (isExamBlocked) return;
    setExamAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || {}),
        selected_answer: prev[questionId]?.selected_answer ?? null,
        written_answer: writtenText
      }
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
        running: false
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
        [questionId]: next
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
          language: languageValue
        }
      }));
    }
  }

  function handleCodeEditorMount(editor) {
    editor.updateOptions({
      readOnly: isExamBlocked,
      domReadOnly: isExamBlocked
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
      running: false
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
            stdin: current.stdin
          })
        },
        token
      );

      handleCodingStateChange(question, {
        running: false,
        stdout: result.data?.stdout || "",
        stderr: result.data?.stderr || ""
      });
    } catch (err) {
      handleCodingStateChange(question, {
        running: false,
        stdout: "",
        stderr: err.message || "Execution failed"
      });
    }
  }

  function handleResetCode(question) {
    if (isExamBlocked) return;
    const questionId = Number(question.id);
    const current = codingState[questionId] || {
      language: "javascript"
    };
    const language = current.language || "javascript";
    const nextCode = question.starter_code || defaultCodeForLanguage(language);
    handleCodingStateChange(question, {
      code: nextCode,
      stdout: "",
      stderr: ""
    });
  }

  function renderDashboardView() {
    const waitingCount = activeExams.filter((exam) => String(exam.status || "").toLowerCase() === "waiting").length;
    const liveCount = activeExams.filter((exam) => String(exam.status || "").toLowerCase() === "in_progress").length;

    return (
      <>
        <section className="card student-panel student-panel-hero">
          <div className="student-panel-glow" aria-hidden="true" />
          <p className="student-kicker">Student Access</p>
          <h2 className="student-title">Join Exam</h2>
          <p className="muted student-subtitle">Enter your name and room code provided by your teacher.</p>

          <form className="form-stack" onSubmit={handleJoinExam}>
            <label>
              <span>Your Name</span>
              <input
                type="text"
                value={studentNameInput}
                onChange={(event) => setStudentNameInput(event.target.value)}
                placeholder="Enter your name"
                required
              />
            </label>

            <label>
              <span>Room Code</span>
              <input
                type="text"
                value={roomCodeInput}
                onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                placeholder="Enter 6-character room code"
                maxLength={6}
                required
              />
            </label>

            {joinError ? <div className="error-box">{joinError}</div> : null}

            <button type="submit" disabled={joiningExam}>
              {joiningExam ? "Joining..." : "Join Exam"}
            </button>
          </form>
        </section>

        <section className="card student-panel">
          <div className="card-head">
            <div>
              <h2 className="student-title">My Active Exams</h2>
              <p className="student-subline">Track waiting and live exams in one place.</p>
            </div>
            <button className="secondary" onClick={loadActiveExams} disabled={loadingActiveExams}>
              Refresh
            </button>
          </div>

          <div className="student-stats-row">
            <span className="student-chip student-chip-neutral">Total {activeExams.length}</span>
            <span className="student-chip student-chip-wait">Waiting {waitingCount}</span>
            <span className="student-chip student-chip-live">Live {liveCount}</span>
          </div>

          {loadingActiveExams ? <p>Loading active exams...</p> : null}

          {!loadingActiveExams && activeExams.length === 0 ? (
            <p className="muted">No active exams found.</p>
          ) : null}

          <ul className="list student-list">
            {activeExams.map((exam) => (
              <li key={exam.id} className="student-list-item">
                <div className="student-list-head">
                  <strong>{exam.title}</strong>
                  <span className={`student-chip ${getExamStatusToneClass(exam.status)}`}>{exam.status}</span>
                </div>
                <div className="student-meta-row">
                  <span className="student-meta-chip">{exam.duration} mins</span>
                  <span className="student-meta-chip">Questions {exam.question_count || 0}</span>
                </div>
                {exam.status === "waiting" ? (
                  <button className="secondary btn-inline" onClick={() => handleRejoinExam(exam.id)}>
                    Enter Waiting Room
                  </button>
                ) : null}
                {exam.status === "in_progress" ? (
                  <button className="btn-inline" onClick={() => startExamSession(exam.id)} disabled={examLoading}>
                    {examLoading ? "Opening..." : "Start Exam"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="card student-panel">
          <div className="card-head">
            <div>
              <h2 className="student-title">My Results</h2>
              <p className="student-subline">Previously submitted exam outcomes.</p>
            </div>
            <button className="secondary" onClick={loadMyResults} disabled={loadingResults}>
              Refresh
            </button>
          </div>

          {loadingResults ? <p>Loading results...</p> : null}
          {!loadingResults && results.length === 0 ? (
            <p className="muted">No submitted exams yet.</p>
          ) : null}

          <ul className="list student-list">
            {results.map((result) => {
              const isCompleted = String(result.evaluation_status || "").toLowerCase() === "completed";
              return (
                <li key={result.submission_id} className="student-list-item">
                  <div className="student-list-head">
                    <strong>{result.exam_title}</strong>
                    <span className={`student-chip ${isCompleted ? "student-chip-done" : "student-chip-wait"}`}>
                      {getEvaluationStatusLabel(result.evaluation_status)}
                    </span>
                  </div>
                  <div className="student-meta-row">
                    <span className="student-meta-chip">Type {result.exam_type || "lab_quiz"}</span>
                    <span className="student-meta-chip">Submitted {formatDateTime(result.submitted_at)}</span>
                  </div>
                  <div className="student-meta-row">
                    <span className="student-meta-chip">Auto {result.auto_score ?? 0}</span>
                    <span className="student-meta-chip">Manual {result.manual_score ?? 0}</span>
                    <span className="student-meta-chip">Total {result.score ?? 0}</span>
                  </div>
                  <div className="actions-row">
                    <button
                      className="secondary btn-inline"
                      onClick={() => loadResultDetails(result.submission_id)}
                      disabled={loadingResultDetails}
                    >
                      {loadingResultDetails ? "Opening..." : "View Details"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </>
    );
  }

  function renderWaitingView() {
    return (
      <section className="card student-panel student-panel-waiting">
        <p className="student-kicker">Standby</p>
        <h2 className="student-title">Waiting Room</h2>
        <p className="muted student-subtitle">Please wait for your teacher to start the exam.</p>

        {waitingExam ? (
          <div className="waiting-grid student-waiting-grid">
            <div>
              <p className="muted small">Exam Title</p>
              <strong>{waitingExam.title}</strong>
            </div>
            <div>
              <p className="muted small">Duration</p>
              <strong>{waitingExam.duration} mins</strong>
            </div>
            <div>
              <p className="muted small">Questions</p>
              <strong>{waitingExam.question_count || 0}</strong>
            </div>
            <div>
              <p className="muted small">Participants</p>
              <strong>{waitingParticipantCount}</strong>
            </div>
          </div>
        ) : null}

        <p className="muted small student-waiting-status">{waitingStatusMessage}</p>
        <p className="muted small">
          Last updated: {waitingLastUpdatedAt ? formatDateTime(waitingLastUpdatedAt) : "Checking..."}
        </p>

        <div className="actions-row">
          <button className="secondary" onClick={handleLeaveWaitingRoom}>
            Leave Waiting Room
          </button>
        </div>
      </section>
    );
  }

  function renderResultDetailsView() {
    if (!selectedResultDetails) {
      return (
        <section className="card student-panel">
          <p className="muted">Result details not available.</p>
          <button className="secondary" onClick={() => setView("dashboard")}>
            Back to Dashboard
          </button>
        </section>
      );
    }

    return (
      <section className="card student-panel">
        <div className="card-head">
          <div>
            <h2 className="student-title">{selectedResultDetails.exam_title}</h2>
            <p className="student-subline">
              Submitted: {formatDateTime(selectedResultDetails.submitted_at)} | Status:{" "}
              {getEvaluationStatusLabel(selectedResultDetails.evaluation_status)}
            </p>
          </div>
          <button className="secondary" onClick={() => setView("dashboard")}>
            Back
          </button>
        </div>

        <div className="student-meta-row">
          <span className="student-meta-chip">Auto {selectedResultDetails.auto_score ?? 0}</span>
          <span className="student-meta-chip">Manual {selectedResultDetails.manual_score ?? 0}</span>
          <span className="student-meta-chip">Total {selectedResultDetails.score ?? 0}</span>
        </div>

        <div className="question-stack student-question-stack top-spaced">
          {(selectedResultDetails.answers || []).map((item, index) => {
            const qType = normalizeQuestionType(item.question_type);
            return (
              <article key={item.question_id} className="question-card student-question-card">
                <p className="question-title">
                  {index + 1}. {item.question_text}
                </p>
                <p className="muted small student-question-meta">
                  Type: {qType === "written" ? "Written" : qType === "coding" ? "Coding" : "MCQ"} | Marks:{" "}
                  {item.awarded_marks ?? 0}/{item.max_marks ?? 0}
                </p>

                {qType === "mcq" ? (
                  <div className="written-preview">
                    <p className="muted small">
                      Selected:{" "}
                      {item.selected_answer === null || item.selected_answer === undefined
                        ? "No answer"
                        : `${String.fromCharCode(65 + Number(item.selected_answer))}`}
                    </p>
                    <p className="muted small">
                      Correct:{" "}
                      {item.correct_answer === null || item.correct_answer === undefined || item.correct_answer === ""
                        ? "N/A"
                        : `${String.fromCharCode(65 + Number(item.correct_answer))}`}
                    </p>
                    <p className="muted small">Result: {item.is_correct ? "Correct" : "Incorrect"}</p>
                  </div>
                ) : qType === "coding" ? (
                  <div className="written-preview">
                    <p className="muted small">Submitted code ({item.language || "unknown"}):</p>
                    <pre>{item.written_answer || "// No code submitted."}</pre>
                    <p className="muted small top-spaced">
                      Teacher comment: {item.evaluation_comment || "No comment"}
                    </p>
                  </div>
                ) : (
                  <div className="written-preview">
                    <p className="muted small">Submitted answer:</p>
                    <pre>{item.written_answer || "No answer submitted."}</pre>
                    <p className="muted small top-spaced">
                      Teacher comment: {item.evaluation_comment || "No comment"}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderExamView() {
    if (!examData) {
      return (
        <section className="card student-panel">
          <p>Exam data not found.</p>
          <button
            className="secondary"
            onClick={() => {
              setView("dashboard");
              loadActiveExams();
            }}
          >
            Back to Dashboard
          </button>
        </section>
      );
    }

    return (
      <>
        <section className="card student-panel student-panel-exam-header">
          <div className="card-head">
            <h2 className="student-title">{examData.title}</h2>
            <div className="badge-row">
              <span className="badge">Time Left: {timerText}</span>
              <span className="badge">Violations: {violationCount}</span>
            </div>
          </div>
          <p className="muted">{examData.description || "No description"}</p>
          <ProctoringCamera
            token={token}
            examId={examData.id}
            enabled={Boolean(examData.webcam_required)}
          />
        </section>

        {warningMessage ? (
          <section className={`card warning-card ${warningSeverity === "high" ? "warning-high" : "warning-medium"}`}>
            <strong>{warningMessage}</strong>
          </section>
        ) : null}

        <section className="card student-panel">
          <h3 className="student-title">Questions</h3>
          {!examData.questions || examData.questions.length === 0 ? (
            <p className="muted">No questions available.</p>
          ) : (
            <div className="question-stack student-question-stack">
              {examData.questions.map((question, index) => {
                const qType = normalizeQuestionType(question.question_type);
                const answerState = examAnswers[question.id] || {};
                const codeState = codingState[Number(question.id)] || {
                  language: "javascript",
                  code: question.starter_code || defaultCodeForLanguage("javascript"),
                  stdin: question.sample_input || "",
                  stdout: "",
                  stderr: "",
                  running: false
                };
                return (
                  <article key={question.id} className="question-card student-question-card">
                    <p className="question-title">
                      {index + 1}. {question.question_text}
                    </p>
                    <p className="muted small student-question-meta">
                      Type: {qType === "written" ? "Written" : qType === "coding" ? "Coding" : "MCQ"} | Marks: {question.marks}
                    </p>

                    {qType === "written" ? (
                      <label className="form-stack">
                        <span>Your Answer</span>
                        <textarea
                          className="answer-textarea"
                          value={answerState.written_answer || ""}
                          onChange={(event) => handleWrittenAnswerChange(question.id, event.target.value)}
                          placeholder="Write your answer here..."
                          disabled={isExamBlocked}
                        />
                      </label>
                    ) : qType === "coding" ? (
                      <div className="student-coding-layout">
                        <div className="student-coding-head">
                          <label>
                            <span>Language</span>
                            <select
                              value={codeState.language}
                              onChange={(event) =>
                                handleCodingStateChange(question, { language: event.target.value })
                              }
                              disabled={isExamBlocked}
                            >
                              <option value="javascript">JavaScript</option>
                              <option value="python">Python</option>
                              <option value="cpp">C++</option>
                            </select>
                          </label>
                        </div>

                        {(question.sample_input || question.sample_output) ? (
                          <div className="student-io-grid">
                            <div className="student-io-card">
                              <p className="muted small">Sample Input</p>
                              <pre>{question.sample_input || "(none)"}</pre>
                            </div>
                            <div className="student-io-card">
                              <p className="muted small">Sample Output</p>
                              <pre>{question.sample_output || "(none)"}</pre>
                            </div>
                          </div>
                        ) : null}

                        <div className="student-code-editor-shell">
                          <p className="student-code-editor-label">Code Editor</p>
                          <Editor
                            height={codeEditorHeight}
                            path={`question-${question.id}.${codeState.language === "cpp" ? "cpp" : codeState.language === "python" ? "py" : "js"}`}
                            language={codeState.language === "cpp" ? "cpp" : codeState.language}
                            value={codeState.code}
                            options={monacoEditorOptions}
                            loading={<div className="muted small">Loading editor...</div>}
                            onMount={handleCodeEditorMount}
                            onChange={(value) =>
                              handleCodingStateChange(question, { code: value || "" })
                            }
                          />
                        </div>

                        <label>
                          <span>Custom Input (stdin)</span>
                          <textarea
                            className="answer-textarea"
                            value={codeState.stdin}
                            onChange={(event) =>
                              handleCodingStateChange(question, { stdin: event.target.value })
                            }
                            placeholder="Provide input for your program..."
                            disabled={isExamBlocked}
                          />
                        </label>

                        <div className="actions-row">
                          <button
                            type="button"
                            onClick={() => handleRunCode(question)}
                            disabled={codeState.running || isExamBlocked}
                          >
                            {codeState.running ? "Running..." : "Run"}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => handleResetCode(question)}
                            disabled={isExamBlocked}
                          >
                            Reset to Starter Code
                          </button>
                        </div>

                        <div className="student-run-output-grid">
                          <div className="student-run-output-card">
                            <p className="muted small">stdout</p>
                            <pre>{codeState.stdout || "(empty)"}</pre>
                          </div>
                          <div className="student-run-output-card">
                            <p className="muted small">stderr</p>
                            <pre>{codeState.stderr || "(empty)"}</pre>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="option-stack">
                        {(question.options || []).map((option, optIndex) => (
                          <label key={`${question.id}-${optIndex}`} className="option-row">
                            <input
                              type="radio"
                              name={`question-${question.id}`}
                              checked={answerState.selected_answer === optIndex}
                              onChange={() => handleMcqAnswerChange(question.id, optIndex)}
                              disabled={isExamBlocked}
                            />
                            <span>
                              {String.fromCharCode(65 + optIndex)}. {option}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="card student-panel actions-row student-submit-row">
          <button onClick={() => submitExam()} disabled={submittingExam || isExamBlocked}>
            {submittingExam ? "Submitting..." : "Submit Exam"}
          </button>
          <button
            className="secondary"
            onClick={() =>
              showAlert({
                title: "Exam Protection",
                message: "Leaving exam is disabled during exam mode."
              })
            }
          >
            Exit Disabled
          </button>
        </section>

        {examSubmitMessage ? <section className="card error-box">{examSubmitMessage}</section> : null}

        {isExamBlocked && (
          <div className="student-block-overlay">
            <div className="student-block-box">
              <div className="student-block-lock-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="72" height="72">
                  <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="student-block-title">Screen Locked</h2>
              <p className="student-block-who">Your teacher has blocked your exam screen.</p>
              <p className="student-block-desc">You cannot make any changes while blocked. Wait for your teacher to unblock you.</p>
            </div>
          </div>
        )}

        {isTeacherForceSubmitting && (
          <div className="student-force-submit-overlay">
            <div className="student-force-submit-box">
              <div className="student-force-submit-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="72" height="72">
                  <path fillRule="evenodd" d="M9 1.5H5.625c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5zm6.61 10.936a.75.75 0 10-1.22-.872l-3.236 4.53-1.174-1.174a.75.75 0 00-1.06 1.06l1.75 1.75a.75.75 0 001.143-.094l3.797-5.2z" clipRule="evenodd" />
                  <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z" />
                </svg>
              </div>
              <h2 className="student-force-submit-title">Exam Force Submitted</h2>
              <p className="student-force-submit-msg">Your teacher has force-submitted your exam.</p>
              <p className="student-force-submit-wait">Submitting your answers, please wait...</p>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={`content-stack student-ui student-view-${view}`}>
      {view === "dashboard" ? renderDashboardView() : null}
      {view === "waiting" ? renderWaitingView() : null}
      {view === "exam" ? renderExamView() : null}
      {view === "result-details" ? renderResultDetailsView() : null}
    </div>
  );
}
