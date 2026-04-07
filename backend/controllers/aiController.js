const { GoogleGenerativeAI } = require('@google/generative-ai');

const SYSTEM_INSTRUCTION = `You are an expert educational assistant helping university teachers create and manage exams at KUET (Khulna University of Engineering & Technology).

You help with:
- Creating high-quality exam questions (MCQ, written, coding/programming)
- Advising on exam structure, difficulty balance, and marks distribution
- Reviewing and improving existing questions for clarity and fairness
- Answering any academic or teaching-related questions
- Generating test cases for coding problems

Be concise, practical, and helpful. Use clear formatting with bullet points or numbered lists where appropriate.`;

function getModel() {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is not configured. Please add it to your .env file.');
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_INSTRUCTION
  });
}

/**
 * POST /api/ai/chat
 * Body: { messages: [{role, text}], examContext?: {title, type, duration} }
 */
const chat = async (req, res) => {
  const { messages, examContext } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, message: 'messages array is required' });
  }

  try {
    const model = getModel();

    // Build Gemini-format history from all messages except the last one
    let history = messages.slice(0, -1).map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: String(msg.text || '') }]
    }));

    // Gemini requires history to start with a 'user' turn — drop any leading model messages
    while (history.length > 0 && history[0].role !== 'user') {
      history.shift();
    }

    // Attach exam context to the first user message in history (if any)
    if (history.length > 0 && examContext?.title) {
      history[0].parts[0].text =
        `[Exam context: "${examContext.title}", type: ${examContext.type || 'lab_quiz'}, duration: ${examContext.duration || '?'} min]\n\n` +
        history[0].parts[0].text;
    }

    const lastMsg = messages[messages.length - 1];
    let lastText = String(lastMsg.text || '');

    // If no history at all, attach context to the first real user message instead
    if (history.length === 0 && examContext?.title) {
      lastText =
        `[Exam context: "${examContext.title}", type: ${examContext.type || 'lab_quiz'}, duration: ${examContext.duration || '?'} min]\n\n` +
        lastText;
    }

    const chatSession = model.startChat({ history });
    const result = await chatSession.sendMessage(lastText);
    const reply = result.response.text();

    res.json({ success: true, data: { reply } });
  } catch (error) {
    console.error('AI chat error:', error.message);
    res.status(500).json({ success: false, message: error.message || 'AI service error' });
  }
};

/**
 * POST /api/ai/generate-questions
 * Body: { topic, type, difficulty, count, examContext? }
 */
const generateQuestions = async (req, res) => {
  const { topic, type, difficulty, count, examContext } = req.body;

  if (!topic || !topic.trim()) {
    return res.status(400).json({ success: false, message: 'topic is required' });
  }

  const normalizedType = ['mcq', 'written', 'coding'].includes(String(type).toLowerCase())
    ? String(type).toLowerCase()
    : 'mcq';
  const normalizedDifficulty = ['easy', 'medium', 'hard'].includes(String(difficulty).toLowerCase())
    ? String(difficulty).toLowerCase()
    : 'medium';
  const normalizedCount = Math.min(Math.max(Number(count) || 3, 1), 8);

  const examCtx = examContext?.title
    ? ` for an exam titled "${examContext.title}" (${examContext.type || 'lab_quiz'})`
    : '';

  const formatGuide = {
    mcq: `{
  "question_text": "The full question text here",
  "question_type": "mcq",
  "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
  "correct_answer": 0,
  "marks": 2
}
Rules: correct_answer is the 0-based index of the correct option. options must have exactly 4 strings.`,

    written: `{
  "question_text": "The full question text here",
  "question_type": "written",
  "reference_answer": "A detailed model answer for the teacher's reference",
  "marks": 5
}`,

    coding: `{
  "question_text": "Full problem description including input/output format",
  "question_type": "coding",
  "sample_input": "5\\n1 2 3 4 5",
  "sample_output": "15",
  "starter_code": "# Write your solution here\\n",
  "reference_answer": "Complete reference solution code",
  "marks": 10
}`
  };

  const prompt = `Generate exactly ${normalizedCount} ${normalizedDifficulty}-difficulty ${normalizedType} question(s) about "${topic.trim()}"${examCtx}.

Return ONLY a raw JSON array. No markdown fences, no explanation, no extra text — just the JSON array starting with [ and ending with ].

Each object in the array must match this exact structure:
${formatGuide[normalizedType]}

Important:
- All string values must be properly JSON-escaped
- marks must be a positive number
- Generate exactly ${normalizedCount} question(s)`;

  try {
    const model = getModel();
    const result = await model.generateContent(prompt);
    let raw = result.response.text().trim();

    // Strip any accidental markdown code fences
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // Extract JSON array if there's surrounding text
    const arrayStart = raw.indexOf('[');
    const arrayEnd = raw.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd !== -1) {
      raw = raw.slice(arrayStart, arrayEnd + 1);
    }

    let questions;
    try {
      questions = JSON.parse(raw);
      if (!Array.isArray(questions)) throw new Error('Response is not a JSON array');
    } catch (parseErr) {
      console.error('AI JSON parse error. Raw response:', raw);
      return res.status(500).json({
        success: false,
        message: 'AI returned an unexpected format. Please try again.'
      });
    }

    // Sanitize each question
    questions = questions.slice(0, normalizedCount).map((q) => {
      const base = {
        question_text: String(q.question_text || '').trim(),
        question_type: normalizedType,
        marks: Number(q.marks) > 0 ? Number(q.marks) : normalizedType === 'coding' ? 10 : normalizedType === 'written' ? 5 : 2
      };

      if (normalizedType === 'mcq') {
        const opts = Array.isArray(q.options) ? q.options.map(String) : ['', '', '', ''];
        return { ...base, options: opts.slice(0, 4), correct_answer: Number(q.correct_answer) || 0 };
      }
      if (normalizedType === 'written') {
        return { ...base, reference_answer: String(q.reference_answer || '').trim() };
      }
      return {
        ...base,
        sample_input: String(q.sample_input || '').trim(),
        sample_output: String(q.sample_output || '').trim(),
        starter_code: String(q.starter_code || '').trim(),
        reference_answer: String(q.reference_answer || '').trim()
      };
    }).filter((q) => q.question_text.length > 0);

    res.json({ success: true, data: { questions } });
  } catch (error) {
    console.error('AI generate-questions error:', error.message);
    res.status(500).json({ success: false, message: error.message || 'AI service error' });
  }
};

module.exports = { chat, generateQuestions };
