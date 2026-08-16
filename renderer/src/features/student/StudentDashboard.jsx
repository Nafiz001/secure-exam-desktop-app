import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { apiRequest, resolveUploadUrl } from "../../api";
import { useModal } from "../../components/modals/ModalProvider";
import ProctoringCamera from "./ProctoringCamera";

function formatTimerDisplay(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Score visibility is a per-exam teacher setting (off by default) — the
// backend already omits the numeric fields and sets results_hidden when
// it's off, so this just picks the right message for whatever came back.
function buildScoreLines(submission) {
  if (submission.results_hidden) {
    return {
      scoreLine: "Your teacher has not enabled result visibility for this exam yet.",
      pendingLine: ""
    };
  }

  const hasWrittenPending = submission.evaluation_status === "pending";
  const scoreLine = hasWrittenPending
    ? `Current auto score: ${submission.auto_score ?? 0}.`
    : `Final score: ${submission.score ?? 0}.`;
  const pendingLine = hasWrittenPending ? "\nWritten answers will be evaluated by your teacher." : "";

  return { scoreLine, pendingLine };
}

const LANGUAGE_FILE_EXTENSIONS = {
  cpp: "cpp",
  c: "c",
  python: "py",
  javascript: "js"
};

const MONACO_LANGUAGE_IDS = {
  cpp: "cpp",
  c: "c",
  python: "python",
  javascript: "javascript"
};

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
  if (language === "c") {
    return [
      "#include <stdio.h>",
      "",
      "int main() {",
      "  // Write your C solution here",
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

export default function StudentDashboard({ token, user, onAuthenticated, onViewChange }) {
  const { showAlert, showConfirm } = useModal();
  const [view, setView] = useState("dashboard");
  const [activeExams, setActiveExams] = useState([]);
  const [loadingActiveExams, setLoadingActiveExams] = useState(false);
  const [studentNameInput, setStudentNameInput] = useState("");
  const [rollNumberInput, setRollNumberInput] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joiningExam, setJoiningExam] = useState(false);
  const [waitingExam, setWaitingExam] = useState(null);
  const [waitingParticipantCount, setWaitingParticipantCount] = useState(0);
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

  const tokenRef = useRef(token);
  const waitingPollIntervalRef = useRef(null);
  const examTimerIntervalRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const submissionInProgressRef = useRef(false);
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
      automaticLayout: true
    }),
    []
  );

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    viewRef.current = view;
    if (typeof onViewChange === "function") {
      onViewChange(view);
    }
  }, [view, onViewChange]);

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

  const clearWarningTimer = useCallback(() => {
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
  }, []);

  const loadActiveExams = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoadingActiveExams(true);
    try {
      const result = await apiRequest("/exams/my-active", {}, tokenRef.current);
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

  const resetExamState = useCallback(() => {
    clearExamTimer();
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
  }, [clearExamTimer, clearWarningTimer]);

  const forceAutoSubmitExam = useCallback(
    async (examId, autoSubmitReason) => {
      if (!examId || submissionInProgressRef.current) {
        return false;
      }

      submissionInProgressRef.current = true;
      setSubmittingExam(true);
      clearExamTimer();
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
          tokenRef.current
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
        const { scoreLine, pendingLine } = buildScoreLines(submission);

        await showAlert({
          title: "Submission Complete",
          message: `${autoSubmitReason}\n\nExam submitted successfully.\n${scoreLine}${pendingLine}`
        });

        resetExamState();
        setWaitingExam(null);
        setWaitingParticipantCount(0);
        setView("dashboard");
        await loadActiveExams();
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
        return alreadySubmitted;
      } finally {
        submissionInProgressRef.current = false;
        setSubmittingExam(false);
      }
    },
    [clearExamTimer, clearWaitingPolling, loadActiveExams, resetExamState, showAlert, token]
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
          tokenRef.current
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
        const { scoreLine, pendingLine } = buildScoreLines(submission);

        await showAlert({
          title: "Submission Complete",
          message: `Exam submitted successfully.\n${scoreLine}${pendingLine}`
        });

        resetExamState();
        setView("dashboard");
        await loadActiveExams();
      } catch (err) {
        setExamSubmitMessage(err.message || "Failed to submit exam. Please try again.");
      } finally {
        submissionInProgressRef.current = false;
        setSubmittingExam(false);
      }
    },
    [
      clearExamTimer,
      clearWaitingPolling,
      forceAutoSubmitExam,
      loadActiveExams,
      resetExamState,
      showAlert,
      showConfirm,
      token
    ]
  );

  useEffect(() => {
    submitExamRef.current = submitExam;
  }, [submitExam]);

  const startExamSession = useCallback(
    async (examId) => {
      setExamLoading(true);
      try {
        const result = await apiRequest(`/exams/${examId}`, {}, tokenRef.current);
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
        setWaitingExam(null);
        setWaitingParticipantCount(0);
        resetExamState();
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
      } catch (err) {
        await showAlert({
          title: "Error",
          message: err.message || "Failed to start exam."
        });
      } finally {
        setExamLoading(false);
      }
    },
    [clearWaitingPolling, forceAutoSubmitExam, loadActiveExams, resetExamState, showAlert, showConfirm, token, user]
  );

  const checkExamStatus = useCallback(
    async (examId) => {
      try {
        const result = await apiRequest(`/exams/${examId}/status`, {}, tokenRef.current);
        const data = result.data || {};
        const participantCount = data.participants_count ?? data.participant_count ?? 0;
        setWaitingParticipantCount(participantCount);

        if (data.status === "in_progress") {
          clearWaitingPolling();
          await startExamSession(examId);
          return;
        }

        if (data.status === "completed") {
          clearWaitingPolling();
          await forceAutoSubmitExam(
            examId,
            "Time is up. Your exam was submitted automatically."
          );
          setWaitingExam(null);
          setWaitingParticipantCount(0);
          setView("dashboard");
        }
      } catch (err) {
        console.error("Waiting room status check error:", err);
      }
    },
    [clearWaitingPolling, forceAutoSubmitExam, startExamSession, token]
  );

  const enterWaitingRoom = useCallback(
    (exam) => {
      clearWaitingPolling();
      setWaitingExam(exam);
      setWaitingParticipantCount(0);
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
      const normalizedRoll = rollNumberInput.trim();
      const normalizedRoomCode = roomCodeInput.trim().toUpperCase();

      if (!normalizedName) {
        setJoinError("Please enter your name.");
        return;
      }

      if (!normalizedRoll) {
        setJoinError("Please enter your roll number.");
        return;
      }

      if (normalizedRoomCode.length !== 6) {
        setJoinError("Please enter a valid 6-character room code.");
        return;
      }

      setJoiningExam(true);
      try {
        const result = await apiRequest(
          "/exams/join",
          {
            method: "POST",
            body: JSON.stringify({
              roomCode: normalizedRoomCode,
              studentName: normalizedName,
              rollNumber: normalizedRoll
            })
          },
          token
        );

        if (result.data.token && result.data.user) {
          tokenRef.current = result.data.token;
          if (onAuthenticated) {
            onAuthenticated(result.data.token, result.data.user);
          }
        }

        const joinedExam = result.data.exam;
        setRoomCodeInput("");

        if (joinedExam.status === "in_progress") {
          await startExamSession(joinedExam.id);
        } else {
          enterWaitingRoom(joinedExam);
        }
      } catch (err) {
        setJoinError(err.message || "Failed to join exam.");
      } finally {
        setJoiningExam(false);
      }
    },
    [enterWaitingRoom, onAuthenticated, rollNumberInput, roomCodeInput, startExamSession, studentNameInput, token]
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
    setView("dashboard");
    await loadActiveExams();
  }, [clearWaitingPolling, loadActiveExams, showConfirm]);

  useEffect(() => {
    loadActiveExams();
  }, [loadActiveExams]);

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

      setViolationCount(data.count || 0);
      setWarningSeverity(data.severity || "medium");
      setWarningMessage(`${String(data.severity || "medium").toUpperCase()} RISK: ${data.type}`);
      setExamViolations((prev) => [
        ...prev,
        {
          type: data.type || "UNKNOWN",
          severity: data.severity || "medium",
          timestamp: new Date().toISOString()
        }
      ]);

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
  }, [clearWarningTimer]);

  useEffect(() => {
    return () => {
      clearWaitingPolling();
      clearExamTimer();
      clearWarningTimer();
    };
  }, [clearExamTimer, clearWaitingPolling, clearWarningTimer]);

  function handleMcqAnswerChange(questionId, selectedOption) {
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

  async function handleRunCode(question) {
    if (!examData) {
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
        tokenRef.current
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

  function renderDashboardView() {
    return (
      <div className="student-join-shell">
        <section className="card student-panel student-panel-hero student-panel-narrow">
          <div className="student-panel-glow" aria-hidden="true" />
          <h2 className="student-title">Join Exam</h2>
          <p className="muted student-subtitle">Enter your name, roll number, and the room code provided by your teacher.</p>

          <form className="form-stack" onSubmit={handleJoinExam}>
            <label>
              <span>Name</span>
              <input
                type="text"
                value={studentNameInput}
                onChange={(event) => setStudentNameInput(event.target.value)}
                placeholder="Enter your name"
                required
              />
            </label>

            <label>
              <span>Roll No.</span>
              <input
                type="text"
                value={rollNumberInput}
                onChange={(event) => setRollNumberInput(event.target.value)}
                placeholder="Enter your roll number"
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
      </div>
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

        <div className="actions-row">
          <button className="secondary" onClick={handleLeaveWaitingRoom}>
            Leave Waiting Room
          </button>
          <button onClick={() => waitingExam && checkExamStatus(waitingExam.id)}>Check Now</button>
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
            <div>
              <h2 className="student-title">{examData.title}</h2>
              <div className="badge-row">
                <span className="badge">Time Left: {timerText}</span>
                <span className="badge">Violations: {violationCount}</span>
                {examData.webcam_required ? <span className="badge">Proctored</span> : null}
              </div>
              <p className="muted">{examData.description || "No description"}</p>
            </div>
            <ProctoringCamera token={tokenRef.current} examId={examData.id} enabled={Boolean(examData.webcam_required)} />
          </div>
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
                    {question.image_url ? (
                      <img
                        className="question-inline-image"
                        src={resolveUploadUrl(question.image_url)}
                        alt={`Question ${index + 1}`}
                      />
                    ) : null}
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
                        />
                      </label>
                    ) : qType === "coding" ? (
                      <div className="form-stack">
                        <label>
                          <span>Language</span>
                          <select
                            value={codeState.language}
                            onChange={(event) =>
                              handleCodingStateChange(question, { language: event.target.value })
                            }
                          >
                            <option value="javascript">JavaScript</option>
                            <option value="python">Python</option>
                            <option value="c">C</option>
                            <option value="cpp">C++</option>
                          </select>
                        </label>

                        {question.sample_input || question.sample_output ? (
                          <div className="written-preview">
                            <p className="muted small">Sample Input:</p>
                            <pre>{question.sample_input || "(none)"}</pre>
                            <p className="muted small">Sample Output:</p>
                            <pre>{question.sample_output || "(none)"}</pre>
                          </div>
                        ) : null}

                        <label>
                          <span>Code Editor</span>
                          <Editor
                            height="320px"
                            path={`question-${question.id}.${LANGUAGE_FILE_EXTENSIONS[codeState.language] || "js"}`}
                            language={MONACO_LANGUAGE_IDS[codeState.language] || "javascript"}
                            value={codeState.code}
                            options={monacoEditorOptions}
                            keepCurrentModel
                            loading={<div className="muted small">Loading editor...</div>}
                            onChange={(value) =>
                              handleCodingStateChange(question, { code: value || "" })
                            }
                          />
                        </label>

                        <label>
                          <span>Custom Input (stdin)</span>
                          <textarea
                            className="answer-textarea"
                            value={codeState.stdin}
                            onChange={(event) =>
                              handleCodingStateChange(question, { stdin: event.target.value })
                            }
                            placeholder="Provide input for your program..."
                          />
                        </label>

                        <div className="actions-row">
                          <button
                            type="button"
                            onClick={() => handleRunCode(question)}
                            disabled={codeState.running}
                          >
                            {codeState.running ? "Running..." : "Run"}
                          </button>
                        </div>

                        <div className="written-preview">
                          <p className="muted small">stdout:</p>
                          <pre>{codeState.stdout || "(empty)"}</pre>
                          <p className="muted small">stderr:</p>
                          <pre>{codeState.stderr || "(empty)"}</pre>
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
          <button onClick={() => submitExam()} disabled={submittingExam}>
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
      </>
    );
  }

  return (
    <div className={`content-stack student-ui student-view-${view}`}>
      {view === "dashboard" ? renderDashboardView() : null}
      {view === "waiting" ? renderWaitingView() : null}
      {view === "exam" ? renderExamView() : null}
    </div>
  );
}
