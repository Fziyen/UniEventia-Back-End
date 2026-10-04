const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middlewares/auth.middleware');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; }, json(body) { this.body = body; return this; } });
const req = () => ({ header: () => 'Bearer token' });
test('database outages return 503 instead of invalidating sessions', async t => {
  t.mock.method(jwt, 'verify', () => ({ id: '507f1f77bcf86cd799439011' }));
  t.mock.method(User, 'findById', () => ({ select: async () => { throw new Error('Unavailable'); } }));
  const res = response();
  await auth(req(), res, () => assert.fail('Must not authorize'));
  assert.equal(res.code, 503);
});
test('expired tokens still return 401', async t => {
  t.mock.method(jwt, 'verify', () => { throw new Error('Expired token'); });
  const res = response();
  await auth(req(), res, () => assert.fail('Must not authorize'));
  assert.equal(res.code, 401);
});
test('deleted users return 401', async t => {
  t.mock.method(jwt, 'verify', () => ({ id: '507f1f77bcf86cd799439011' }));
  t.mock.method(User, 'findById', () => ({ select: async () => null }));
  const res = response();
  await auth(req(), res, () => assert.fail('Must not authorize'));
  assert.equal(res.code, 401);
});
