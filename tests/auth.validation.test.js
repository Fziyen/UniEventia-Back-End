const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateSignupInput,
  verifyRecaptchaToken,
} = require("../controllers/auth.controller");

test("rejects short passwords during signup validation", () => {
  const result = validateSignupInput({
    fname: "Ana",
    lname: "Doe",
    email: "ana@example.com",
    password: "123",
    role: "Participant",
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /at least 8/i);
});

test("accepts valid organizer signup input", () => {
  const result = validateSignupInput({
    fname: "Lena",
    lname: "Fziyen",
    email: "Lena@centria.fi",
    password: "StrongPass123",
    role: "Organizer",
  });

  assert.equal(result.ok, true);
  assert.equal(result.message, "Validation successful");
});

test("rejects empty captcha tokens before processing auth requests", async () => {
  const result = await verifyRecaptchaToken("");

  assert.equal(result.ok, false);
  assert.match(result.message, /captcha/i);
});
