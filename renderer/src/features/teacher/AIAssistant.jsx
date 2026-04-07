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
    <div className={`aip-msg ${isUser ? "aip-msg-user" : "aip-msg-ai"}`}>
      {!isUser && (
        <div className="aip-avatar">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7H3a7 7 0 017-7h1V5.73A2 2 0 0112 2zM3 16v1a7 7 0 0014 0v-1H3z"/>
          </svg>
        </div>
      )}
      <div className="aip-bubble">{msg.text}</div>
    </div>
  );
}

export default function AIAssistant({ token, currentExamId, currentExamTitle, currentExamType, formDuration, onQuestionAdded }) {
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

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  };

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

  const addToExam = useCallback(async (question, idx) => {
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
      alert(err.message || "Failed to add question.");
    } finally {
      setAddingIdx(null);
    }
  }, [currentExamId, addingIdx, addedIdxs, token, onQuestionAdded]);

  const panel = (
    <>
      {/* Backdrop (mobile) */}
      {isOpen && <div className="aip-backdrop" onClick={() => setIsOpen(false)} />}

      {/* Panel */}
      <div className={`aip-panel ${isOpen ? "aip-panel-open" : ""}`}>

        {/* Header */}
        <div className="aip-header">
          <div className="aip-header-icon">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7H3a7 7 0 017-7h1V5.73A2 2 0 0112 2zM3 16v1a7 7 0 0014 0v-1H3z"/>
            </svg>
          </div>
          <div className="aip-header-text">
            <span className="aip-header-title">AI Assistant</span>
            <span className="aip-header-sub">
              {examContext ? examContext.title : "No exam selected"}
            </span>
          </div>
          <button className="aip-close-btn" onClick={() => setIsOpen(false)} title="Close">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="aip-tabs">
          <button
            className={`aip-tab ${activeTab === "chat" ? "aip-tab-on" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            Chat
          </button>
          <button
            className={`aip-tab ${activeTab === "generate" ? "aip-tab-on" : ""}`}
            onClick={() => setActiveTab("generate")}
          >
            Generate Questions
          </button>
        </div>

        {/* ── CHAT ── */}
        {activeTab === "chat" && (
          <div className="aip-chat">
            <div className="aip-messages">
              {messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} />
              ))}
              {chatLoading && (
                <div className="aip-msg aip-msg-ai">
                  <div className="aip-avatar">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                      <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7H3a7 7 0 017-7h1V5.73A2 2 0 0112 2zM3 16v1a7 7 0 0014 0v-1H3z"/>
                    </svg>
                  </div>
                  <div className="aip-bubble aip-thinking">
                    <span className="aip-dot" /><span className="aip-dot" /><span className="aip-dot" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="aip-input-row">
              <textarea
                ref={chatInputRef}
                className="aip-textarea"
                rows={2}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything… Enter to send"
                disabled={chatLoading}
              />
              <div className="aip-input-actions">
                <button className="aip-clear" onClick={() => { setMessages([WELCOME_MESSAGE]); setChatInput(""); }}>
                  Clear
                </button>
                <button
                  className="aip-send"
                  onClick={sendChat}
                  disabled={!chatInput.trim() || chatLoading}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                  </svg>
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── GENERATE ── */}
        {activeTab === "generate" && (
          <div className="aip-generate">
            <div className="aip-gen-form">
              <div className="aip-field">
                <label className="aip-label">Topic</label>
                <input
                  className="aip-input"
                  type="text"
                  value={genTopic}
                  onChange={(e) => setGenTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runGenerate()}
                  placeholder="e.g. Binary Search Trees, Recursion…"
                />
              </div>

              <div className="aip-field-row">
                <div className="aip-field">
                  <label className="aip-label">Type</label>
                  <select className="aip-select" value={genType} onChange={(e) => { setGenType(e.target.value); setGeneratedQuestions([]); setAddedIdxs(new Set()); }}>
                    <option value="mcq">MCQ</option>
                    <option value="written">Written</option>
                    <option value="coding">Coding</option>
                  </select>
                </div>
                <div className="aip-field">
                  <label className="aip-label">Difficulty</label>
                  <select className="aip-select" value={genDifficulty} onChange={(e) => setGenDifficulty(e.target.value)}>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div className="aip-field">
                  <label className="aip-label">Count</label>
                  <select className="aip-select" value={genCount} onChange={(e) => setGenCount(e.target.value)}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              <button className="aip-gen-btn" onClick={runGenerate} disabled={!genTopic.trim() || genLoading}>
                {genLoading ? (
                  <><span className="aip-spinner" /> Generating…</>
                ) : (
                  <><svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813A3.75 3.75 0 007.466 7.89l.813-2.846A.75.75 0 019 4.5z" clipRule="evenodd" /></svg> Generate</>
                )}
              </button>
            </div>

            {genError && <div className="aip-error">{genError}</div>}

            {generatedQuestions.length > 0 && (
              <div className="aip-qlist">
                {!currentExamId && (
                  <div className="aip-notice">
                    Open an exam in the Questions view to enable "Add to Exam".
                  </div>
                )}
                {generatedQuestions.map((q, idx) => (
                  <div key={idx} className="aip-qcard">
                    <div className="aip-qcard-top">
                      <span className="aip-qtype">{q.question_type?.toUpperCase()}</span>
                      <span className="aip-qmarks">{q.marks} marks</span>
                    </div>

                    <p className="aip-qtext">{q.question_text}</p>

                    {q.question_type === "mcq" && Array.isArray(q.options) && (
                      <ul className="aip-opts">
                        {q.options.map((opt, oi) => (
                          <li key={oi} className={oi === Number(q.correct_answer) ? "aip-opt-correct" : "aip-opt"}>
                            <span className="aip-opt-letter">{String.fromCharCode(65 + oi)}</span>
                            {opt}
                            {oi === Number(q.correct_answer) && <span className="aip-tick">✓</span>}
                          </li>
                        ))}
                      </ul>
                    )}

                    {q.question_type === "written" && q.reference_answer && (
                      <details className="aip-details">
                        <summary>Reference Answer</summary>
                        <p className="aip-details-body">{q.reference_answer}</p>
                      </details>
                    )}

                    {q.question_type === "coding" && (
                      <div className="aip-coding-info">
                        {q.sample_input && (
                          <div className="aip-io-row">
                            <span className="aip-io-label">Input</span>
                            <code className="aip-io-code">{q.sample_input}</code>
                          </div>
                        )}
                        {q.sample_output && (
                          <div className="aip-io-row">
                            <span className="aip-io-label">Output</span>
                            <code className="aip-io-code">{q.sample_output}</code>
                          </div>
                        )}
                        {q.reference_answer && (
                          <details className="aip-details">
                            <summary>Reference Solution</summary>
                            <pre className="aip-code-block">{q.reference_answer}</pre>
                          </details>
                        )}
                      </div>
                    )}

                    <div className="aip-qcard-footer">
                      {currentExamId ? (
                        addedIdxs.has(idx) ? (
                          <span className="aip-added">Added to exam ✓</span>
                        ) : (
                          <button
                            className="aip-add-btn"
                            onClick={() => addToExam(q, idx)}
                            disabled={addingIdx !== null}
                          >
                            {addingIdx === idx ? "Adding…" : "+ Add to Exam"}
                          </button>
                        )
                      ) : <span />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <button
        className={`aip-fab ${isOpen ? "aip-fab-hidden" : ""}`}
        onClick={() => setIsOpen(true)}
        title="AI Teaching Assistant"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7H3a7 7 0 017-7h1V5.73A2 2 0 0112 2zM3 16v1a7 7 0 0014 0v-1H3z"/>
        </svg>
        <span>AI Assistant</span>
      </button>
    </>
  );

  // Portal: renders outside .teacher-ui (which has isolation:isolate) so z-index works correctly
  return createPortal(panel, document.body);
}
