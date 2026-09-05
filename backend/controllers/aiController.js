const Groq = require('groq-sdk');

// Groq retired the old llama-3.3-70b-versatile model. Verified against
// Groq's live /models endpoint + a real completions call (chat and JSON
// mode) on 2026-09-05 — update here if Groq retires this one too.
const GROQ_MODEL = 'openai/gpt-oss-120b';

const SYSTEM_INSTRUCTION = `You are an expert educational assistant helping university teachers create and manage exams at KUET (Khulna University of Engineering & Technology).

You help with:
- Creating high-quality exam questions (MCQ, written, coding/programming)
- Advising on exam structure, difficulty balance, and marks distribution
- Reviewing and improving existing questions for clarity and fairness
- Answering any academic or teaching-related questions
- Generating test cases for coding problems

Be concise, practical, and helpful. Use clear formatting with bullet points or numbered lists where appropriate.`;

function getGroqClient() {
  const key = process.env.GROQ_API_KEY;
  if (!key || key === 'your_groq_api_key_here') {
    const err = new Error('GROQ_API_KEY is not configured. Add it to backend/.env and restart.');
    err.statusCode = 500;
    throw err;
  }
  return new Groq({ apiKey: key });
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
    const groq = getGroqClient();

    // Build OpenAI-format message array
    const groqMessages = [{ role: 'system', content: SYSTEM_INSTRUCTION }];

    // Attach exam context as a prefix on the first user message
    let contextPrefix = '';
    if (examContext?.title) {
      contextPrefix = `[Exam context: "${examContext.title}", type: ${examContext.type || 'lab_quiz'}, duration: ${examContext.duration || '?'} min]\n\n`;
    }

    messages.forEach((msg, i) => {
      const role    = msg.role === 'user' ? 'user' : 'assistant';
      const content = (i === 0 && contextPrefix)
        ? contextPrefix + String(msg.text || '')
        : String(msg.text || '');
      groqMessages.push({ role, content });
    });

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: groqMessages,
      temperature: 0.7,
      max_tokens: 2048
    });

    const reply = completion.choices[0].message.content;
    res.json({ success: true, data: { reply } });

  } catch (error) {
    console.error('[AI] chat error:', error.message);
    const statusCode = Number(error?.statusCode) || 500;
    res.status(statusCode).json({ success: false, message: error.message || 'AI service error' });
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

  const normalizedType       = ['mcq', 'written', 'coding'].includes(String(type).toLowerCase()) ? String(type).toLowerCase() : 'mcq';
  const normalizedDifficulty = ['easy', 'medium', 'hard'].includes(String(difficulty).toLowerCase()) ? String(difficulty).toLowerCase() : 'medium';
  const normalizedCount      = Math.min(Math.max(Number(count) || 3, 1), 8);

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
  "starter_code": "",
  "reference_answer": "Complete reference solution code",
  "marks": 10
}
Rules: leave starter_code as an empty string. Students pick their own language
(JavaScript, Python, C or C++) and the app supplies the right boilerplate for
whichever they choose — starter code written for one language breaks the others.`
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
    const groq = getGroqClient();

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'You are a JSON-only API. Return only valid JSON, no prose.' },
        { role: 'user',   content: prompt }
      ],
      temperature: 0.6,
      max_tokens: 4096,
      response_format: { type: 'json_object' } // Groq guarantees valid JSON
    });

    let raw = completion.choices[0].message.content.trim();

    // response_format json_object forces a top-level object, so Groq sometimes
    // returns a single bare question object (esp. when count=1) instead of an
    // array. Detect that case before falling back to "find a nested array",
    // otherwise a single question's own "options" array gets mistaken for the
    // questions array.
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        raw = JSON.stringify(parsed);
      } else if (parsed && typeof parsed === 'object' && typeof parsed.question_text === 'string') {
        raw = JSON.stringify([parsed]);
      } else {
        // Find the array value inside the object whose entries look like questions
        const arrayVal = Object.values(parsed).find(
          (v) => Array.isArray(v) && v.every((item) => item && typeof item === 'object' && !Array.isArray(item))
        );
        if (arrayVal) raw = JSON.stringify(arrayVal);
      }
    } catch {
      // Strip markdown fences just in case
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const arrayStart = raw.indexOf('[');
      const arrayEnd   = raw.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1) raw = raw.slice(arrayStart, arrayEnd + 1);
    }

    let questions;
    try {
      questions = JSON.parse(raw);
      if (!Array.isArray(questions)) throw new Error('Response is not a JSON array');
    } catch (parseErr) {
      console.error('[AI] JSON parse error. Raw:', raw);
      return res.status(500).json({ success: false, message: 'AI returned an unexpected format. Please try again.' });
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
        sample_input:    String(q.sample_input    || '').trim(),
        sample_output:   String(q.sample_output   || '').trim(),
        starter_code:    String(q.starter_code    || '').trim(),
        reference_answer: String(q.reference_answer || '').trim()
      };
    }).filter((q) => q.question_text.length > 0);

    res.json({ success: true, data: { questions } });

  } catch (error) {
    console.error('[AI] generate-questions error:', error.message);
    const statusCode = Number(error?.statusCode) || 500;
    res.status(statusCode).json({ success: false, message: error.message || 'AI service error' });
  }
};

module.exports = { chat, generateQuestions };
