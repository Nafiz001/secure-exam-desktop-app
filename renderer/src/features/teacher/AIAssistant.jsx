import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "../../api";

const WELCOME_MESSAGE = {
  role: "model",
  text: "Hi! I'm your AI teaching assistant.\n\nI can help you:\n• Generate MCQ, Written, and Coding questions\n• Review your exam structure\n• Suggest difficulty balance and marks\n• Answer any teaching question\n\nWhat would you like help with?"
};

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`ai-message-row ${isUser ? "ai-message-row-user" : "ai-message-row-model"}`}>
      {!isUser ? <span className="ai-avatar" aria-hidden="true">AI</span> : null}
      <div className={`ai-bubble ${isUser ? "ai-bubble-user" : "ai-bubble-model"}`}>{msg.text}</div>
    </div>
  );
}

export default function AIAssistant({
  token,
  currentExamId,
  currentExamTitle,
  currentExamType,
  formDuration,
  onQuestionAdded
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");

  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const [genTopic, setGenTopic] = useState("");
  const [genType, setGenType] = useState("mcq");
  const [genDifficulty, setGenDifficulty] = useState("medium");
  const [genCount, setGenCount] = useState("3");
  const [genLoading, setGenLoading] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState([]);
  const [addingIdx, setAddingIdx] = useState(null);
  const [addedIdxs, setAddedIdxs] = useState(new Set());
  const [genError, setGenError] = useState("");

  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);

  useEffect(() => {
    if (isOpen && activeTab === "chat" && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, activeTab]);

  useEffect(() => {
    if (isOpen && activeTab === "chat" && chatInputRef.current) {
      chatInputRef.current.focus();
    }
  }, [isOpen, activeTab]);

  // Clear generated questions, added-state, errors, and chat history whenever
  // the teacher opens a different exam — questions drafted for one exam should
  // not linger when the context switches.
  useEffect(() => {
    setGeneratedQuestions([]);
    setAddedIdxs(new Set());
    setAddingIdx(null);
    setGenError("");
    setGenTopic("");
    setMessages([WELCOME_MESSAGE]);
    setChatInput("");
  }, [currentExamId]);

  const examContext = currentExamId
    ? { title: currentExamTitle, type: currentExamType, duration: formDuration }
    : null;

  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const userMsg = { role: "user", text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const result = await apiRequest(
        "/ai/chat",
        { method: "POST", body: JSON.stringify({ messages: nextMessages, examContext }) },
        token
      );
      setMessages((prev) => [...prev, { role: "model", text: result.data.reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "model", text: `Sorry, something went wrong: ${err.message || "Unknown error."}` }
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, messages, examContext, token]);

  function handleChatKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendChat();
    }
  }

  const runGenerate = useCallback(async () => {
    if (!genTopic.trim() || genLoading) return;
    setGenLoading(true);
    setGeneratedQuestions([]);
    setAddedIdxs(new Set());
    setGenError("");

    try {
      const result = await apiRequest(
        "/ai/generate-questions",
        {
          method: "POST",
          body: JSON.stringify({
            topic: genTopic.trim(),
            type: genType,
            difficulty: genDifficulty,
            count: Number(genCount),
            examContext
          })
        },
        token
      );
      const qs = result.data.questions || [];
      if (qs.length === 0) setGenError("No questions generated. Try a different topic.");
      else setGeneratedQuestions(qs);
    } catch (err) {
      setGenError(err.message || "Failed to generate questions. Please try again.");
    } finally {
      setGenLoading(false);
    }
  }, [genTopic, genType, genDifficulty, genCount, genLoading, examContext, token]);

  const addToExam = useCallback(
    async (question, idx) => {
      if (!currentExamId || addingIdx !== null || addedIdxs.has(idx)) return;
      setAddingIdx(idx);
      try {
        await apiRequest(
          `/exams/${currentExamId}/questions`,
          { method: "POST", body: JSON.stringify(question) },
          token
        );
        setAddedIdxs((prev) => new Set([...prev, idx]));
        if (typeof onQuestionAdded === "function") onQuestionAdded();
      } catch (err) {
        window.alert(err.message || "Failed to add question.");
      } finally {
        setAddingIdx(null);
      }
    },
    [currentExamId, addingIdx, addedIdxs, token, onQuestionAdded]
  );

  const panel = (
    <>
      {isOpen ? <div className="ai-backdrop" onClick={() => setIsOpen(false)} /> : null}

      <div className={`ai-panel ${isOpen ? "ai-panel-open" : ""}`}>
        <div className="ai-panel-header">
          <span className="ai-avatar ai-avatar-lg" aria-hidden="true">AI</span>
          <div className="ai-panel-header-text">
            <p className="ai-panel-title">AI Assistant</p>
            <p className="ai-panel-subtitle">{examContext ? examContext.title : "No exam selected"}</p>
          </div>
          <button type="button" className="secondary btn-inline ai-close-btn" onClick={() => setIsOpen(false)}>
            Close
          </button>
        </div>

        <div className="ai-tabs">
          <button
            type="button"
            className={`ai-tab ${activeTab === "chat" ? "ai-tab-active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            Chat
          </button>
          <button
            type="button"
            className={`ai-tab ${activeTab === "generate" ? "ai-tab-active" : ""}`}
            onClick={() => setActiveTab("generate")}
          >
            Generate
          </button>
        </div>

        {activeTab === "chat" ? (
          <div className="ai-tab-panel ai-chat-panel">
            <div className="ai-messages">
              {messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} />
              ))}
              {chatLoading ? (
                <div className="ai-message-row ai-message-row-model">
                  <span className="ai-avatar" aria-hidden="true">AI</span>
                  <div className="ai-bubble ai-bubble-model ai-thinking">Thinking...</div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <div className="ai-chat-input-row">
              <textarea
                ref={chatInputRef}
                rows={2}
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Ask anything... Enter to send, Shift+Enter for new line"
                disabled={chatLoading}
              />
              <div className="actions-row ai-chat-actions">
                <button
                  type="button"
                  className="secondary btn-inline"
                  onClick={() => {
                    setMessages([WELCOME_MESSAGE]);
                    setChatInput("");
                  }}
                >
                  Clear
                </button>
                <button type="button" className="btn-inline" onClick={sendChat} disabled={!chatInput.trim() || chatLoading}>
                  Send
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="ai-tab-panel ai-generate-panel">
            <label>
              <span>Topic</span>
              <input
                type="text"
                value={genTopic}
                onChange={(event) => setGenTopic(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && runGenerate()}
                placeholder="e.g. Binary Search Trees, Recursion..."
              />
            </label>

            <div className="ai-generate-options">
              <label>
                <span>Type</span>
                <select
                  value={genType}
                  onChange={(event) => {
                    setGenType(event.target.value);
                    setGeneratedQuestions([]);
                    setAddedIdxs(new Set());
                  }}
                >
                  <option value="mcq">MCQ</option>
                  <option value="written">Written</option>
                  <option value="coding">Coding</option>
                </select>
              </label>
              <label>
                <span>Difficulty</span>
                <select value={genDifficulty} onChange={(event) => setGenDifficulty(event.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label>
                <span>Count</span>
                <select value={genCount} onChange={(event) => setGenCount(event.target.value)}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button type="button" onClick={runGenerate} disabled={!genTopic.trim() || genLoading}>
              {genLoading ? "Generating..." : "Generate"}
            </button>

            {genError ? <div className="error-box">{genError}</div> : null}

            {!genError && generatedQuestions.length === 0 && !genLoading ? (
              <div className="ai-hint-box">
                <p>
                  <strong>How it works:</strong> pick a topic, type, and difficulty, then click Generate. The AI drafts
                  ready-to-use questions you can preview and add to your exam with one click.
                </p>
                <ul>
                  <li>MCQ questions include 4 options and a marked correct answer.</li>
                  <li>Written questions include a reference answer for evaluation.</li>
                  <li>Coding questions include sample I/O and a reference solution.</li>
                </ul>
              </div>
            ) : null}

            {generatedQuestions.length > 0 ? (
              <div className="ai-generated-list">
                {!currentExamId ? (
                  <div className="error-box">Open an exam in the Questions view to enable Add-to-Exam.</div>
                ) : null}
                {generatedQuestions.map((q, idx) => (
                  <div key={idx} className="ai-question-card">
                    <div className="ai-question-meta">
                      <span className="teacher-chip teacher-chip-created">{String(q.question_type || "").toUpperCase()}</span>
                      <span className="teacher-chip teacher-chip-wait">{q.marks} marks</span>
                    </div>

                    <p className="ai-question-text">{q.question_text}</p>

                    {q.question_type === "mcq" && Array.isArray(q.options) ? (
                      <ul className="option-list">
                        {q.options.map((opt, oi) => (
                          <li key={oi} className={oi === Number(q.correct_answer) ? "correct-option" : ""}>
                            {String.fromCharCode(65 + oi)}. {opt}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {q.question_type === "written" && q.reference_answer ? (
                      <details className="ai-details">
                        <summary>Reference answer</summary>
                        <p>{q.reference_answer}</p>
                      </details>
                    ) : null}

                    {q.question_type === "coding" ? (
                      <div className="written-preview">
                        {q.sample_input ? (
                          <>
                            <p className="muted small">Sample Input:</p>
                            <pre>{q.sample_input}</pre>
                          </>
                        ) : null}
                        {q.sample_output ? (
                          <>
                            <p className="muted small">Sample Output:</p>
                            <pre>{q.sample_output}</pre>
                          </>
                        ) : null}
                        {q.reference_answer ? (
                          <details className="ai-details">
                            <summary>Reference solution</summary>
                            <pre>{q.reference_answer}</pre>
                          </details>
                        ) : null}
                      </div>
                    ) : null}

                    {currentExamId ? (
                      <div className="actions-row">
                        {addedIdxs.has(idx) ? (
                          <span className="teacher-chip teacher-chip-done">Added to exam</span>
                        ) : (
                          <button
                            type="button"
                            className="btn-inline"
                            onClick={() => addToExam(q, idx)}
                            disabled={addingIdx !== null}
                          >
                            {addingIdx === idx ? "Adding..." : "Add to exam"}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {!isOpen ? (
        <button type="button" className="ai-fab" onClick={() => setIsOpen(true)} aria-label="Open AI teaching assistant">
          AI Assistant
        </button>
      ) : null}
    </>
  );

  return createPortal(panel, document.body);
}
