const test = require('node:test');
const assert = require('node:assert/strict');
const Event = require('../models/Events');
const { updateEvent, updateCoverImage, removeParticipant } = require('../controllers/event.controller');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } });
const body = { title: 'Changed', description: 'Updated', location: 'Hall', startDate: '2099-01-01T10:00:00Z', endDate: '2099-01-01T11:00:00Z', maxParticipants: 50 };

test('an owner cannot reopen an ended event by submitting future dates', async t => {
  const now = Date.now();
  t.mock.method(Date, 'now', () => now);
  for (const endDate of [new Date(now - 1000), new Date(now)]) {
    const event = { organizer: { _id: 'owner' }, endDate, participants: [] };
    t.mock.method(Event, 'findById', () => ({ populate: async () => event }));
    const write = t.mock.method(Event, 'findOneAndUpdate', async () => { throw new Error('Unexpected write'); });
    const res = response();
    await updateEvent({ params: { id: 'event' }, user: { id: 'owner' }, body }, res);
    assert.equal(res.code, 403);
    assert.match(res.body.message, /ended/);
    assert.equal(write.mock.callCount(), 0);
  }
});

test('an owner cannot replace an ended event cover', async t => {
  t.mock.method(Event, 'findById', async () => ({ organizer: 'owner', endDate: new Date(Date.now() - 1000) }));
  const res = response();
  await updateCoverImage({ params: { id: 'event' }, user: { id: 'owner' }, file: { buffer: Buffer.from('unused') } }, res);
  assert.equal(res.code, 403);
  assert.match(res.body.message, /ended/);
});

test('final event update checks stored end time again at the database write', async t => {
  const event = { _id: 'event', organizer: { _id: 'owner' }, participants: [], title: 'Old', description: 'Old', location: 'Hall', startDate: '2099-01-01T10:00:00Z', endDate: '2099-01-01T11:00:00Z', maxParticipants: 50 };
  t.mock.method(Event, 'findById', () => ({ populate: async () => event }));
  const write = t.mock.method(Event, 'findOneAndUpdate', async query => {
    assert.ok(query.endDate.$gt instanceof Date);
    return null; // Event expired between reading it and writing the change.
  });
  const res = response();
  await updateEvent({ params: { id: 'event' }, user: { id: 'owner' }, body }, res);
  assert.equal(write.mock.callCount(), 1);
  assert.equal(res.code, 409);
  assert.match(res.body.message, /ended/);
});

test('organizer participant removal also excludes ended events', async t => {
  t.mock.method(Event, 'findOneAndUpdate', async query => {
    assert.ok(query.endDate.$gt instanceof Date);
    assert.equal(query.organizer, 'owner');
    return null;
  });
  const res = response();
  await removeParticipant({ params: { id: 'event', participantId: 'person' }, user: { id: 'owner' } }, res);
  assert.equal(res.code, 404);
});
