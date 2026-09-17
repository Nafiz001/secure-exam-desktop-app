// Integration-style test for submitExam()'s scoring logic. Real database
// access is replaced with a scripted mock queued onto the `pg` Pool module
// (via require.cache injection — examController.js does
// `const pool = require('../config/database')` at module load, so swapping
// that cache entry before the first require() redirects every pool.query()
// call the controller makes).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const DB_PATH = require.resolve('../config/database');

function installMockPool(responses) {
  let callIndex = 0;
  const calls = [];
  const mockPool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (callIndex >= responses.length) {
        throw new Error(`mock pool: no scripted response for call #${callIndex} (sql: ${sql.slice(0, 60)}...)`);
      }
      const response = responses[callIndex];
      callIndex += 1;
      return response;
    }
  };
  require.cache[DB_PATH] = {
    id: DB_PATH,
    filename: DB_PATH,
    loaded: true,
    exports: mockPool
  };
  return { calls };
}

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

// Fresh require of the controller under test, per test, with the mock pool
// already installed in the require cache and the controller's own cache
// entry cleared so it re-reads `pool` from the mock.
function loadExamController() {
  const controllerPath = require.resolve('../controllers/examController');
  delete require.cache[controllerPath];
  return require('../controllers/examController');
}

test('submitExam: all-MCQ exam is fully auto-graded and marked completed', async () => {
  const { calls } = installMockPool([
    // 1. exam meta (allow_multiple_attempts, show_results_to_students)
    { rows: [{ allow_multiple_attempts: false, show_results_to_students: true }] },
    // 2. already-submitted check
    { rows: [] },
    // 3. questions for this exam
    {
      rows: [
        { id: 1, question_type: 'mcq', correct_answer: 2, marks: 5 },
        { id: 2, question_type: 'mcq', correct_answer: 0, marks: 3 }
      ]
    },
    // 4. INSERT INTO submissions ... RETURNING
    {
      rows: [{
        id: 99, exam_id: 10, student_id: 7,
        auto_score: 5, manual_score: 0, score: 5,
        evaluation_status: 'completed', submitted_at: '2026-09-17T00:00:00Z'
      }]
    },
    // 5. UPDATE exam_participants SET status = 'completed'
    { rows: [] }
  ]);

  const { submitExam } = loadExamController();
  const req = {
    params: { id: '10' },
    user: { userId: 7 },
    body: {
      answers: [
        { question_id: 1, selected_answer: 2 }, // correct, +5
        { question_id: 2, selected_answer: 1 }  // wrong (correct is 0), +0
      ],
      violations: []
    }
  };
  const res = mockRes();
  await submitExam(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.submission.results_hidden, false);

  // The INSERT call (index 3) carries the computed score as its 5th bound param.
  const insertCall = calls[3];
  assert.match(insertCall.sql, /INSERT INTO submissions/);
  const [, , answersJson, , autoScore, manualScore, totalScore, evalStatus] = insertCall.params;
  assert.equal(autoScore, 5, 'only the correct MCQ (5 marks) should count');
  assert.equal(manualScore, 0);
  assert.equal(totalScore, 5);
  assert.equal(evalStatus, 'completed', 'an all-MCQ exam needs no manual evaluation');

  const storedAnswers = JSON.parse(answersJson);
  assert.equal(storedAnswers[0].is_correct, true);
  assert.equal(storedAnswers[0].awarded_marks, 5);
  assert.equal(storedAnswers[1].is_correct, false);
  assert.equal(storedAnswers[1].awarded_marks, 0);
});

test('submitExam: written/coding answers are never auto-scored and leave evaluation pending', async () => {
  installMockPool([
    { rows: [{ allow_multiple_attempts: false, show_results_to_students: true }] },
    { rows: [] },
    {
      rows: [
        { id: 1, question_type: 'mcq', correct_answer: 0, marks: 2 },
        { id: 2, question_type: 'written', correct_answer: null, marks: 8 },
        { id: 3, question_type: 'coding', correct_answer: null, marks: 10 }
      ]
    },
    {
      rows: [{
        id: 100, exam_id: 11, student_id: 8,
        auto_score: 2, manual_score: 0, score: 2,
        evaluation_status: 'pending', submitted_at: '2026-09-17T00:00:00Z'
      }]
    },
    { rows: [] }
  ]);

  const { submitExam } = loadExamController();
  const req = {
    params: { id: '11' },
    user: { userId: 8 },
    body: {
      answers: [
        { question_id: 1, selected_answer: 0 },
        { question_id: 2, written_answer: 'DFS uses a stack; BFS uses a queue.' },
        { question_id: 3, written_answer: 'console.log(1)', language: 'javascript' }
      ],
      violations: []
    }
  };
  const res = mockRes();
  await submitExam(req, res);

  assert.equal(res.statusCode, 201);
  assert.match(res.body.message, /pending teacher evaluation/i);
  assert.equal(res.body.data.submission.evaluation_status, 'pending');
});

test('submitExam: rejects a second submission when multiple attempts are not allowed', async () => {
  installMockPool([
    { rows: [{ allow_multiple_attempts: false, show_results_to_students: true }] },
    { rows: [{ id: 555 }] } // already has a submission
  ]);

  const { submitExam } = loadExamController();
  const req = {
    params: { id: '12' },
    user: { userId: 9 },
    body: { answers: [], violations: [] }
  };
  const res = mockRes();
  await submitExam(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
});

test('submitExam: hides scores from the response when show_results_to_students is false', async () => {
  installMockPool([
    { rows: [{ allow_multiple_attempts: false, show_results_to_students: false }] },
    { rows: [] },
    { rows: [{ id: 1, question_type: 'mcq', correct_answer: 0, marks: 4 }] },
    {
      rows: [{
        id: 101, exam_id: 13, student_id: 10,
        auto_score: 4, manual_score: 0, score: 4,
        evaluation_status: 'completed', submitted_at: '2026-09-17T00:00:00Z'
      }]
    },
    { rows: [] }
  ]);

  const { submitExam } = loadExamController();
  const req = {
    params: { id: '13' },
    user: { userId: 10 },
    body: { answers: [{ question_id: 1, selected_answer: 0 }], violations: [] }
  };
  const res = mockRes();
  await submitExam(req, res);

  assert.equal(res.statusCode, 201);
  const sub = res.body.data.submission;
  assert.equal(sub.results_hidden, true);
  assert.equal(sub.score, null);
  assert.equal(sub.auto_score, null);
});

test('submitExam: rejects a request whose body has no answers array', async () => {
  installMockPool([]); // no query should even be attempted
  const { submitExam } = loadExamController();
  const req = { params: { id: '14' }, user: { userId: 1 }, body: {} };
  const res = mockRes();
  await submitExam(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});
