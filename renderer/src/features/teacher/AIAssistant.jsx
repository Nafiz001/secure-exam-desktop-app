import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Bot,
  Send,
  Sparkles,
  X,
  MessageSquare,
  Wand2,
  Check,
  Plus,
  Loader2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import { apiRequest } from "../../api";
import {
  Button,
  IconButton,
  Input,
  Textarea,
  FormField,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../../components/ui";
import { cn } from "../../lib/cn";

const WELCOME_MESSAGE = {
  role: "model",
  text: "Hi! I'm your AI teaching assistant.\n\nI can help you:\n• Generate MCQ, Written, and Coding questions\n• Review your exam structure\n• Suggest difficulty balance and marks\n• Answer any teaching question\n\nWhat would you like help with?",
};

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div
      className={cn(
        "flex gap-2 max-w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser ? (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info-subtle text-info">
          <Bot className="h-4 w-4" />
        </div>
      ) : null}
      <div
        className={cn(
          "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words max-w-[85%]",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-bg border border-border text-ink rounded-bl-sm"
        )}
      >
        {msg.text}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-2 px-1">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-subtle animate-pulse" />
      <span className="h-1.5 w-1.5 rounded-full bg-ink-subtle animate-pulse [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-ink-subtle animate-pulse [animation-delay:300ms]" />
    </div>
  );
}

export default function AIAssistant({
  token,
  currentExamId,
  currentExamTitle,
  currentExamType,
  formDuration,
  onQuestionAdded,
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
        { role: "model", text: `Sorry, something went wrong: ${err.message || "Unknown error."}` },
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
            examContext,
          }),
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
        alert(err.message || "Failed to add question.");
      } finally {
        setAddingIdx(null);
      }
    },
    [currentExamId, addingIdx, addedIdxs, token, onQuestionAdded]
  );

  const panel = (
    <>
      {isOpen ? (
        <div
          className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
        />
      ) : null}

      <div
        className={cn(
          "fixed z-50 bg-surface border border-border shadow-lg rounded-xl flex flex-col overflow-hidden",
          "transition-all duration-200",
          "right-4 bottom-4 w-[calc(100vw-2rem)] md:w-[420px] h-[80vh] md:h-[640px] max-h-[calc(100vh-2rem)]",
          isOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-gradient-to-r from-info-subtle/60 to-primary-subtle/40">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-info text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink">AI Assistant</p>
            <p className="text-xs text-ink-muted truncate">
              {examContext ? examContext.title : "No exam selected"}
            </p>
          </div>
          <IconButton
            aria-label="Close AI assistant"
            tooltip="Close"
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
          <div className="px-4 pt-3">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="chat" className="justify-center">
                <MessageSquare className="h-4 w-4" /> Chat
              </TabsTrigger>
              <TabsTrigger value="generate" className="justify-center">
                <Wand2 className="h-4 w-4" /> Generate
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="chat" className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} />
              ))}
              {chatLoading ? (
                <div className="flex gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info-subtle text-info">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-lg bg-bg border border-border rounded-bl-sm">
                    <ThinkingDots />
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-border bg-bg/40 space-y-2">
              <Textarea
                ref={chatInputRef}
                rows={2}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything… Enter to send, Shift+Enter for new line"
                disabled={chatLoading}
                className="resize-none"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMessages([WELCOME_MESSAGE]);
                    setChatInput("");
                  }}
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={sendChat}
                  disabled={!chatInput.trim() || chatLoading}
                >
                  <Send className="h-4 w-4" /> Send
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="generate" className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 bg-bg/30">
            <div className="space-y-2">
              <FormField label="Topic" htmlFor="ai-topic">
                <Input
                  id="ai-topic"
                  type="text"
                  value={genTopic}
                  onChange={(e) => setGenTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runGenerate()}
                  placeholder="e.g. Binary Search Trees, Recursion…"
                />
              </FormField>

              <div className="grid grid-cols-3 gap-2">
                <FormField label="Type" htmlFor="ai-type">
                  <select
                    id="ai-type"
                    value={genType}
                    onChange={(e) => {
                      setGenType(e.target.value);
                      setGeneratedQuestions([]);
                      setAddedIdxs(new Set());
                    }}
                    className="h-10 w-full rounded-md bg-surface border border-border px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-ring"
                  >
                    <option value="mcq">MCQ</option>
                    <option value="written">Written</option>
                    <option value="coding">Coding</option>
                  </select>
                </FormField>
                <FormField label="Difficulty" htmlFor="ai-diff">
                  <select
                    id="ai-diff"
                    value={genDifficulty}
                    onChange={(e) => setGenDifficulty(e.target.value)}
                    className="h-10 w-full rounded-md bg-surface border border-border px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-ring"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </FormField>
                <FormField label="Count" htmlFor="ai-count">
                  <select
                    id="ai-count"
                    value={genCount}
                    onChange={(e) => setGenCount(e.target.value)}
                    className="h-10 w-full rounded-md bg-surface border border-border px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-ring"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              <Button
                className="w-full"
                onClick={runGenerate}
                disabled={!genTopic.trim() || genLoading}
              >
                {genLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Generate
                  </>
                )}
              </Button>
            </div>

            {genError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-danger-subtle bg-danger-subtle/40 px-3 py-2 text-sm text-danger"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{genError}</span>
              </div>
            ) : null}

            {genLoading ? (
              <div className="rounded-lg border border-border bg-surface/50 px-4 py-3 text-sm text-ink-muted flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating question set...
              </div>
            ) : null}

            {!genError && generatedQuestions.length === 0 && !genLoading ? (
              <div className="rounded-lg border border-dashed border-border bg-surface/60 p-4 text-xs text-ink-muted space-y-2">
                <div className="flex items-center gap-2 text-ink">
                  <Sparkles className="h-4 w-4 text-info" />
                  <span className="font-medium">How it works</span>
                </div>
                <p>
                  Pick a topic, type and difficulty, then click <strong>Generate</strong>. The AI
                  drafts ready-to-use questions you can preview and one-click add to your exam.
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>MCQ questions include 4 options and a marked correct answer.</li>
                  <li>Written questions include a reference answer for evaluation.</li>
                  <li>Coding questions include sample I/O and a reference solution.</li>
                </ul>
              </div>
            ) : null}

            {generatedQuestions.length > 0 ? (
              <div className="space-y-3">
                {!currentExamId ? (
                  <div className="rounded-md border border-warning-subtle bg-warning-subtle/40 px-3 py-2 text-xs text-warning">
                    Open an exam in the Questions view to enable Add-to-Exam.
                  </div>
                ) : null}
                {generatedQuestions.map((q, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-border bg-bg p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={q.question_type === "mcq" ? "info" : q.question_type === "coding" ? "warning" : "outline"}>
                        {String(q.question_type || "").toUpperCase()}
                      </Badge>
                      <Badge variant="neutral">{q.marks} marks</Badge>
                    </div>

                    <p className="text-sm text-ink whitespace-pre-wrap">{q.question_text}</p>

                    {q.question_type === "mcq" && Array.isArray(q.options) ? (
                      <ul className="space-y-1">
                        {q.options.map((opt, oi) => {
                          const correct = oi === Number(q.correct_answer);
                          return (
                            <li
                              key={oi}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs",
                                correct
                                  ? "bg-success-subtle/50 text-success"
                                  : "bg-surface text-ink-muted border border-border"
                              )}
                            >
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface border border-current text-[11px] font-semibold">
                                {String.fromCharCode(65 + oi)}
                              </span>
                              <span className="flex-1">{opt}</span>
                              {correct ? <Check className="h-3.5 w-3.5" /> : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}

                    {q.question_type === "written" && q.reference_answer ? (
                      <details className="rounded-md border border-border bg-surface overflow-hidden">
                        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink flex items-center gap-1 select-none">
                          <ChevronDown className="h-3.5 w-3.5" /> Reference answer
                        </summary>
                        <p className="px-3 pb-3 text-xs text-ink-muted whitespace-pre-wrap">
                          {q.reference_answer}
                        </p>
                      </details>
                    ) : null}

                    {q.question_type === "coding" ? (
                      <div className="space-y-2">
                        {q.sample_input ? (
                          <div className="flex gap-2 text-xs">
                            <span className="text-ink-subtle w-14 shrink-0">Input</span>
                            <code className="flex-1 bg-surface border border-border rounded px-2 py-1 text-ink font-mono">
                              {q.sample_input}
                            </code>
                          </div>
                        ) : null}
                        {q.sample_output ? (
                          <div className="flex gap-2 text-xs">
                            <span className="text-ink-subtle w-14 shrink-0">Output</span>
                            <code className="flex-1 bg-surface border border-border rounded px-2 py-1 text-ink font-mono">
                              {q.sample_output}
                            </code>
                          </div>
                        ) : null}
                        {q.reference_answer ? (
                          <details className="rounded-md border border-border bg-surface overflow-hidden">
                            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink flex items-center gap-1 select-none">
                              <ChevronDown className="h-3.5 w-3.5" /> Reference solution
                            </summary>
                            <pre className="px-3 pb-3 text-xs text-ink-muted font-mono whitespace-pre-wrap">
                              {q.reference_answer}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex justify-end pt-1">
                      {currentExamId ? (
                        addedIdxs.has(idx) ? (
                          <Badge variant="success">
                            <Check className="h-3 w-3" /> Added to exam
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => addToExam(q, idx)}
                            disabled={addingIdx !== null}
                          >
                            {addingIdx === idx ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" /> Adding…
                              </>
                            ) : (
                              <>
                                <Plus className="h-4 w-4" /> Add to exam
                              </>
                            )}
                          </Button>
                        )
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>

      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed z-40 bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-info text-white px-4 py-3 shadow-lg hover:bg-info/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          aria-label="Open AI teaching assistant"
        >
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-medium hidden sm:inline">AI Assistant</span>
        </button>
      ) : null}
    </>
  );

  return createPortal(panel, document.body);
}
