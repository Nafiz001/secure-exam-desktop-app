const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const pool = require('../config/database');

function normalizeLanguage(rawLanguage) {
  const normalized = String(rawLanguage || '').toLowerCase();
  if (normalized === 'javascript') return 'javascript';
  if (normalized === 'python') return 'python';
  if (normalized === 'cpp' || normalized === 'c++') return 'cpp';
  return null;
}

// Replaces 4 sequential DB round-trips with a single query
async function validateRunCodeRequest(examId, studentId, questionId) {
  const { rows } = await pool.query(
    `SELECT
       e.status                                    AS exam_status,
       ep.id                                       AS participant_id,
       s.id                                        AS submission_id,
       q.id                                        AS question_id
     FROM exams e
     LEFT JOIN exam_participants ep
            ON ep.exam_id = e.id AND ep.student_id = $2
     LEFT JOIN submissions s
            ON s.exam_id = e.id AND s.student_id = $2
     LEFT JOIN questions q
            ON q.id = $3 AND q.exam_id = e.id
               AND COALESCE(q.question_type, 'mcq') = 'coding'
     WHERE e.id = $1
     LIMIT 1`,
    [examId, studentId, questionId]
  );

  if (rows.length === 0)
    return { ok: false, statusCode: 404, message: 'Exam not found' };

  const row = rows[0];
  if (row.exam_status !== 'in_progress')
    return { ok: false, statusCode: 400, message: 'Code can be run only while exam is in progress' };
  if (!row.participant_id)
    return { ok: false, statusCode: 403, message: 'You have not joined this exam' };
  if (row.submission_id)
    return { ok: false, statusCode: 409, message: 'You already submitted this exam' };
  if (!row.question_id)
    return { ok: false, statusCode: 404, message: 'Coding question not found in this exam' };

  return { ok: true };
}

// spawn() instead of exec() — no shell spawned, stdin piped directly (no temp input file)
function spawnProcess(command, args, stdinData, timeoutMs = 8000, maxBuffer = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      const err = new Error(`Time limit exceeded (${timeoutMs / 1000}s)`);
      err.stderr = err.message;
      reject(err);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { if (stdout.length < maxBuffer) stdout += chunk; });
    child.stderr.on('data', (chunk) => { if (stderr.length < maxBuffer) stderr += chunk; });
    child.stdin.on('error', () => {}); // ignore broken pipe if program ignores stdin

    child.on('close', () => {
      if (!settled) { settled = true; clearTimeout(timer); resolve({ stdout, stderr }); }
    });
    child.on('error', (err) => {
      if (!settled) { settled = true; clearTimeout(timer); reject(err); }
    });

    child.stdin.write(stdinData || '');
    child.stdin.end();
  });
}

// Compile without shell — captures only stderr (stdout not needed for g++)
function compileSpawn(compiler, args, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const child = spawn(compiler, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error('Compilation timed out'));
    }, timeoutMs);

    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => {
      if (!settled) { settled = true; clearTimeout(timer); resolve({ code, stderr }); }
    });
    child.on('error', (err) => {
      if (!settled) { settled = true; clearTimeout(timer); reject(err); }
    });
  });
}

// Cache the working Python interpreter — probe happens once per server session
let _pythonEntry = null; // [cmd, extraArgs[]]

async function resolvePython() {
  if (_pythonEntry) return _pythonEntry;

  const candidates = [
    ['python', []],
    ['python3', []],
    ['py', ['-3']],
  ];

  for (const [cmd, extraArgs] of candidates) {
    const available = await new Promise((resolve) => {
      const proc = spawn(cmd, [...extraArgs, '--version'], { stdio: 'pipe' });
      proc.on('close', () => resolve(true));
      proc.on('error', (e) => resolve(e.code !== 'ENOENT'));
    });
    if (available) {
      _pythonEntry = [cmd, extraArgs];
      return _pythonEntry;
    }
  }

  throw new Error('Python interpreter not found on this system');
}

// Cache the working C++ compiler — probe happens once per server session
let _cppCompiler = null; // 'g++' | 'clang++'

async function resolveCppCompiler() {
  if (_cppCompiler) return _cppCompiler;

  for (const compiler of ['g++', 'clang++']) {
    const available = await new Promise((resolve) => {
      const proc = spawn(compiler, ['--version'], { stdio: 'pipe' });
      proc.on('close', () => resolve(true));
      proc.on('error', (e) => resolve(e.code !== 'ENOENT'));
    });
    if (available) {
      _cppCompiler = compiler;
      return compiler;
    }
  }

  throw new Error('C++ compiler (g++ or clang++) not found on this system');
}

async function runProgram({ language, code, stdin }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'invigilo-code-run-'));
  const sourceFile = path.join(
    tempDir,
    language === 'javascript' ? 'main.js' : language === 'python' ? 'main.py' : 'main.cpp'
  );

  try {
    await fs.writeFile(sourceFile, code || '', 'utf8');

    if (language === 'javascript') {
      return await spawnProcess('node', [sourceFile], stdin);
    }

    if (language === 'python') {
      const [cmd, extraArgs] = await resolvePython();
      return await spawnProcess(cmd, [...extraArgs, sourceFile], stdin);
    }

    // C++: compile then run
    const binaryFile = path.join(tempDir, 'main.exe');
    const compiler = await resolveCppCompiler();
    // -O0: skip optimization passes — 2-4x faster compilation for small exam programs,
    //      runtime difference is negligible for typical competitive-programming input sizes
    const compileResult = await compileSpawn(compiler, [sourceFile, '-std=c++17', '-O0', '-o', binaryFile]);

    if (compileResult.stderr && compileResult.stderr.trim()) {
      return { stdout: '', stderr: compileResult.stderr };
    }

    return await spawnProcess(binaryFile, [], stdin);
  } finally {
    // Non-blocking cleanup — doesn't delay the HTTP response
    fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
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
    return res.status(400).json({ success: false, message: 'Language must be javascript, python, or cpp' });
  }

  if (!Number.isInteger(Number(question_id))) {
    return res.status(400).json({ success: false, message: 'question_id is required' });
  }

  try {
    const access = await validateRunCodeRequest(examId, studentId, Number(question_id));
    if (!access.ok) {
      return res.status(access.statusCode).json({ success: false, message: access.message });
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
