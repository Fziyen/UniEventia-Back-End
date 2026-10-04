const test = require('node:test');
const assert = require('node:assert/strict');
const Event = require('../models/Events');
const { deleteEvent, updateCoverImage } = require('../controllers/event.controller');
const { validateImage } = require('../services/imageStorage');
const { isAllowedOrigin } = require('../config');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } });
test('another user cannot delete an event or replace its image', async () => {
  const original = Event.findById;
  Event.findById = async () => ({ organizer: 'owner' });
  try {
    for (const handler of [deleteEvent, updateCoverImage]) {
      const res = response();
      await handler({ params: { id: 'event' }, user: { id: 'attacker' }, file: { buffer: Buffer.from('fake') } }, res);
      assert.equal(res.code, 403);
    }
  } finally { Event.findById = original; }
});
test('uploads reject disguised HTML and mismatched MIME types', () => {
  assert.equal(validateImage(Buffer.from('<script>alert(1)</script>'), 'image/png'), false);
  assert.equal(validateImage(Buffer.from('GIF89a1234'), 'image/png'), false);
  assert.equal(validateImage(Buffer.from('GIF89a1234'), 'image/gif'), true);
});
test('CORS accepts exact origins only', () => {
  assert.equal(isAllowedOrigin('https://evil.vercel.app', ['https://*.vercel.app']), false);
  assert.equal(isAllowedOrigin('https://app.example.com', ['https://app.example.com']), true);
  assert.equal(isAllowedOrigin('https://app.example.com.evil.com', ['https://app.example.com']), false);
});
test('bulk cleanup has no public HTTP route', () => {
  const router = require('../routes/events.routes');
  assert.equal(router.stack.some(layer => layer.route?.path.includes('cleanup')), false);
});
test('password hashes are excluded from queries by default', () => {
  assert.equal(require('../models/User').schema.path('password').options.select, false);
});

test('registration enforces bcrypt byte limit without trimming passwords', () => {
  const { validateSignupInput } = require('../controllers/auth.controller');
  const input = { fname: 'Ana', lname: 'Doe', username: 'ana_user', email: 'ana@example.com', password: ' StrongPass123 ' };
  assert.equal(validateSignupInput(input).data.password, input.password);
  assert.equal(validateSignupInput({ ...input, password: 'StrongPass123' + 'é'.repeat(40) }).ok, false);
});
test('invalid profile roles are rejected explicitly', () => {
  assert.equal(require('../controllers/user.controller').validateProfileUpdateInput({ role: 'Admin' }).ok, false);
});
