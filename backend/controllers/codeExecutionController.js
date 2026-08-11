const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const pool = require('../config/database');

const execAsync = promisify(exec);

function normalizeLanguage(rawLanguage) {
  const normalized = String(rawLanguage || '').toLowerCase();
  if (normalized === 'javascript') return 'javascript';
  if (normalized === 'python') return 'python';
  if (normalized === 'cpp' || normalized === 'c++') return 'cpp';
  if (normalized === 'c') return 'c';
  return null;
}

async function ensureStudentExamAccess(examId, studentId) {
  const examResult = await pool.query(
    'SELECT id, status FROM exams WHERE id = $1',
    [examId]
  );

  if (examResult.rows.length === 0) {
    return { ok: false, statusCode: 404, message: 'Exam not found' };
  }

  const exam = examResult.rows[0];
  if (exam.status !== 'in_progress') {
    return { ok: false, statusCode: 400, message: 'Code can be run only while exam is in progress' };
  }

  const participantResult = await pool.query(
    'SELECT id FROM exam_participants WHERE exam_id = $1 AND student_id = $2',
    [examId, studentId]
  );

  if (participantResult.rows.length === 0) {
    return { ok: false, statusCode: 403, message: 'You have not joined this exam' };
  }

  const submissionResult = await pool.query(
    'SELECT id FROM submissions WHERE exam_id = $1 AND student_id = $2',
    [examId, studentId]
  );

  if (submissionResult.rows.length > 0) {
    return { ok: false, statusCode: 409, message: 'You already submitted this exam' };
  }

  return { ok: true };
}

async function runProgram({ language, code, stdin }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'invigilo-code-run-'));

  const inputPath = path.join(tempDir, 'input.txt');
  const sourceMap = {
    javascript: { sourceFile: path.join(tempDir, 'main.js') },
    python: { sourceFile: path.join(tempDir, 'main.py') },
    cpp: { sourceFile: path.join(tempDir, 'main.cpp'), binaryFile: path.join(tempDir, 'main.exe') },
    c: { sourceFile: path.join(tempDir, 'main.c'), binaryFile: path.join(tempDir, 'main.exe') }
  };

  const selected = sourceMap[language];

  try {
    await fs.writeFile(selected.sourceFile, code || '', 'utf8');
    await fs.writeFile(inputPath, stdin || '', 'utf8');

    if (language === 'javascript') {
      const { stdout, stderr } = await execAsync(
        `node "${selected.sourceFile}" < "${inputPath}"`,
        { timeout: 8000, maxBuffer: 1024 * 1024 }
      );
      return { stdout, stderr };
    }

    if (language === 'python') {
      const { stdout, stderr } = await execAsync(
        `python "${selected.sourceFile}" < "${inputPath}"`,
        { timeout: 8000, maxBuffer: 1024 * 1024 }
      );
      return { stdout, stderr };
    }

    const compileCommand = language === 'c'
      ? `gcc "${selected.sourceFile}" -std=c11 -O2 -o "${selected.binaryFile}"`
      : `g++ "${selected.sourceFile}" -std=c++17 -O2 -o "${selected.binaryFile}"`;

    const compileResult = await execAsync(
      compileCommand,
      { timeout: 12000, maxBuffer: 1024 * 1024 }
    );

    if (compileResult.stderr && compileResult.stderr.trim()) {
      return { stdout: '', stderr: compileResult.stderr };
    }

    const { stdout, stderr } = await execAsync(
      `"${selected.binaryFile}" < "${inputPath}"`,
      { timeout: 8000, maxBuffer: 1024 * 1024 }
    );

    return { stdout, stderr };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

const runCode = async (req, res) => {
  const examId = Number(req.params.id);
  const studentId = req.user.userId;
  const { question_id, language, code, stdin } = req.body;

  if (!Number.isInteger(examId)) {
    return res.status(400).json({ success: false, message: 'Invalid exam id' });
  }

  const normalizedLanguage = normalizeLanguage(language);
  if (!normalizedLanguage) {
    return res.status(400).json({ success: false, message: 'Language must be javascript, python, c, or cpp' });
  }

  if (!Number.isInteger(Number(question_id))) {
    return res.status(400).json({ success: false, message: 'question_id is required' });
  }

  try {
    const access = await ensureStudentExamAccess(examId, studentId);
    if (!access.ok) {
      return res.status(access.statusCode).json({ success: false, message: access.message });
    }

    const questionResult = await pool.query(
      `SELECT id
       FROM questions
       WHERE id = $1 AND exam_id = $2 AND COALESCE(question_type, 'mcq') = 'coding'`,
      [Number(question_id), examId]
    );

    if (questionResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Coding question not found in this exam' });
    }

    const execution = await runProgram({
      language: normalizedLanguage,
      code: String(code || ''),
      stdin: String(stdin || '')
    });

    res.status(200).json({
      success: true,
      data: {
        stdout: execution.stdout || '',
        stderr: execution.stderr || ''
      }
    });
  } catch (error) {
    console.error('Run code error:', error);
    res.status(200).json({
      success: true,
      data: {
        stdout: '',
        stderr: error.stderr || error.message || 'Execution failed'
      }
    });
  }
};

module.exports = { runCode };
