// Requires backend/.env to exist (config/database.js loads it via dotenv),
// but no query is ever issued, so no real database connection is needed —
// pg's Pool connects lazily on first query.
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateRoomCode, normalizeQuestionType, normalizeExamType } = require('../controllers/examController');

test('generateRoomCode: is always exactly 6 characters', () => {
  for (let i = 0; i < 200; i++) {
    assert.equal(generateRoomCode().length, 6);
  }
});

test('generateRoomCode: only uses the unambiguous character set (no 0/O/1/I/L)', () => {
  const allowed = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
  for (let i = 0; i < 200; i++) {
    const code = generateRoomCode();
    assert.match(code, allowed, `"${code}" contains an excluded character`);
  }
});

test('generateRoomCode: excluded characters never appear', () => {
  const excluded = ['0', 'O', '1', 'I', 'L'];
  for (let i = 0; i < 200; i++) {
    const code = generateRoomCode();
    for (const ch of excluded) {
      assert.ok(!code.includes(ch), `code "${code}" contains excluded character "${ch}"`);
    }
  }
});

test('generateRoomCode: produces variation, not a constant', () => {
  const codes = new Set();
  for (let i = 0; i < 50; i++) codes.add(generateRoomCode());
  // 50 draws from a 33^6 space should essentially never collide down to 1 unique value.
  assert.ok(codes.size > 1, 'expected more than one distinct room code across 50 draws');
});

test('normalizeQuestionType: recognizes written and coding, defaults everything else to mcq', () => {
  assert.equal(normalizeQuestionType('written'), 'written');
  assert.equal(normalizeQuestionType('WRITTEN'), 'written');
  assert.equal(normalizeQuestionType('coding'), 'coding');
  assert.equal(normalizeQuestionType('CODING'), 'coding');
  assert.equal(normalizeQuestionType('mcq'), 'mcq');
  assert.equal(normalizeQuestionType('nonsense'), 'mcq');
  assert.equal(normalizeQuestionType(undefined), 'mcq');
  assert.equal(normalizeQuestionType(null), 'mcq');
  assert.equal(normalizeQuestionType(''), 'mcq');
});

test('normalizeExamType: only "lab_test" maps to lab_test, everything else defaults to lab_quiz', () => {
  assert.equal(normalizeExamType('lab_test'), 'lab_test');
  assert.equal(normalizeExamType('LAB_TEST'), 'lab_test');
  assert.equal(normalizeExamType('lab_quiz'), 'lab_quiz');
  assert.equal(normalizeExamType('anything_else'), 'lab_quiz');
  assert.equal(normalizeExamType(undefined), 'lab_quiz');
});
