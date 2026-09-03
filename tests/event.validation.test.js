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
    startDate: "2026-09-10",
    endDate: "2026-09-08",
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
    startDate: "2026-09-10",
    endDate: "2026-09-11",
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
    startDate: "2026-09-10",
    endDate: "2026-09-11",
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
