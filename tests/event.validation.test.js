const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateEventInput,
  getEventParticipationState,
} = require("../controllers/event.controller");

test("rejects events whose end date is not after the start date", () => {
  const result = validateEventInput({
    title: "Hack Night",
    description: "Hands-on workshop for the team.",
    startDate: "2026-09-10T18:00:00.000Z",
    endDate: "2026-09-08T18:00:00.000Z",
    location: "Helsinki",
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /after/i);
});

test("rejects events with identical start and end timestamps", () => {
  const result = validateEventInput({
    title: "Zero Length Event",
    description: "This event has no duration.",
    startDate: "2026-09-10T18:00:00.000Z",
    endDate: "2026-09-10T18:00:00.000Z",
    location: "Helsinki",
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /after/i);
});

test("accepts a valid future event payload", () => {
  const result = validateEventInput({
    title: "Design Meetup",
    description: "An evening of product storytelling and feedback.",
    startDate: "2026-09-10T18:00:00.000Z",
    endDate: "2026-09-11T18:00:00.000Z",
    location: "Espoo",
  });

  assert.equal(result.ok, true);
  assert.equal(result.message, "Validation successful");
  assert.equal(result.data.maxParticipants, 50);
});

test("rejects invalid participant capacity", () => {
  const result = validateEventInput({
    title: "Small Workshop",
    description: "A focused session.",
    startDate: "2026-09-10T18:00:00.000Z",
    endDate: "2026-09-11T18:00:00.000Z",
    location: "Espoo",
    maxParticipants: 0,
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /participants/i);
});

test("returns organizer state when the current user owns the event", () => {
  const state = getEventParticipationState(
    {
      organizer: "org-123",
      participants: ["user-456"],
      startDate: "2026-09-10T18:00:00.000Z",
    },
    "org-123",
  );

  assert.equal(state, "organizer");
});

test("returns joined state when the current user is already on the attendee list", () => {
  const state = getEventParticipationState(
    {
      organizer: "org-123",
      participants: ["user-456"],
      startDate: "2026-09-10T18:00:00.000Z",
    },
    "user-456",
  );

  assert.equal(state, "joined");
});

const practicalEvent = { title: 'Workshop', description: 'Learn together', location: 'Hall', startDate: '2099-01-01T18:00:00.000Z', endDate: '2099-01-02T18:00:00.000Z' };
test('validates and normalizes optional accessibility and practical details', () => {
  const result = validateEventInput({ ...practicalEvent, language: ' English ', wheelchairAccess: 'partial', cost: 'Free', transport: 'Bus 10', whatToBring: 'Laptop' });
  assert.equal(result.ok, true);
  assert.equal(result.data.language, 'English');
  assert.equal(result.data.whatToBring, 'Laptop');
  assert.equal(validateEventInput(practicalEvent).data.language, undefined);
});
test('rejects invalid accessibility options, objects and oversized practical details', () => {
  assert.equal(validateEventInput({ ...practicalEvent, wheelchairAccess: 'maybe' }).ok, false);
  assert.equal(validateEventInput({ ...practicalEvent, cost: { $gt: 0 } }).ok, false);
  assert.equal(validateEventInput({ ...practicalEvent, transport: 'x'.repeat(2001) }).ok, false);
});
test('recognizes waitlisted participation separately from confirmed attendance', () => {
  assert.equal(getEventParticipationState({ organizer: 'owner', participants: [], waitlist: ['visitor'] }, 'visitor'), 'waitlisted');
});

test('requires explicit start and end times with timezone', () => {
  for (const values of [
    { startDate: '2099-01-01', endDate: '2099-01-02' },
    { startDate: '2099-01-01T10:00:00Z', endDate: '2099-01-02' },
    { startDate: '2099-01-01', endDate: '2099-01-02T10:00:00Z' },
    { startDate: '2099-01-01T10:00', endDate: '2099-01-02T10:00' },
  ]) {
    const result = validateEventInput({ ...practicalEvent, ...values });
    assert.equal(result.ok, false);
    assert.match(result.message, /time and timezone/);
  }
  assert.equal(validateEventInput({ ...practicalEvent, startDate: '2099-01-01T00:00:00+02:00', endDate: '2099-01-01T01:00:00+02:00' }).ok, true);
});
