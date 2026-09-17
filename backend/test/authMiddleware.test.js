const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');
const { protect, authorize } = require('../middleware/auth');

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

function signToken(payload, opts = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h', ...opts });
}

test('protect: rejects a request with no Authorization header', async () => {
  const req = { headers: {} };
  const res = mockRes();
  let nextCalled = false;
  await protect(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
});

test('protect: rejects a header that is not a Bearer token', async () => {
  const req = { headers: { authorization: 'Basic somevalue' } };
  const res = mockRes();
  let nextCalled = false;
  await protect(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('protect: rejects a syntactically invalid token', async () => {
  const req = { headers: { authorization: 'Bearer not-a-real-jwt' } };
  const res = mockRes();
  let nextCalled = false;
  await protect(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.match(res.body.message, /invalid token/i);
});

test('protect: rejects an expired token with a distinct message', async () => {
  const expired = signToken({ userId: 1, email: 'a@b.com', role: 'student' }, { expiresIn: '-10s' });
  const req = { headers: { authorization: `Bearer ${expired}` } };
  const res = mockRes();
  let nextCalled = false;
  await protect(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.match(res.body.message, /expired/i);
});

test('protect: rejects a token signed with the wrong secret', async () => {
  const forged = jwt.sign({ userId: 1, role: 'teacher' }, 'not-the-real-secret', { expiresIn: '1h' });
  const req = { headers: { authorization: `Bearer ${forged}` } };
  const res = mockRes();
  let nextCalled = false;
  await protect(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('protect: accepts a valid token and attaches userId/email/role to req.user', async () => {
  const token = signToken({ userId: 42, email: 'student@kuet.ac.bd', role: 'student' });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  let nextCalled = false;
  await protect(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null, 'protect() must not touch the response on success');
  assert.deepEqual(req.user, { userId: 42, email: 'student@kuet.ac.bd', role: 'student' });
});

test('authorize: blocks a role not in the allow-list with 403', () => {
  const req = { user: { userId: 1, role: 'student' } };
  const res = mockRes();
  let nextCalled = false;
  authorize('teacher')(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('authorize: allows a role that is in the allow-list', () => {
  const req = { user: { userId: 1, role: 'teacher' } };
  const res = mockRes();
  let nextCalled = false;
  authorize('teacher', 'admin')(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('authorize: rejects with 401 (not 403) when req.user is missing entirely', () => {
  // Guards against authorize() being wired in without protect() running first.
  const req = {};
  const res = mockRes();
  let nextCalled = false;
  authorize('teacher')(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});
