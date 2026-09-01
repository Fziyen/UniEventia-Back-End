const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateSignupInput,
  verifyRecaptchaToken,
  normalizeLoginIdentifier,
} = require("../controllers/auth.controller");
const { hashPublicEmail } = require("../controllers/user.controller");
const { normalizeOrigins } = require("../config");

test("normalizes username and email login identifiers consistently", () => {
  assert.equal(normalizeLoginIdentifier("  LenaFziyen  "), "lenafziyen");
  assert.equal(
    normalizeLoginIdentifier("  LENA@EXAMPLE.COM  "),
    "lena@example.com",
  );
});

test("rejects short passwords during signup validation", () => {
  const result = validateSignupInput({
    fname: "Ana",
    lname: "Doe",
    username: "ana_user",
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
    username: "lena_fziyen",
    email: "lena@unieventia.com",
    password: "StrongPass123",
    role: "Organizer",
  });

  assert.equal(result.ok, true);
  assert.equal(result.message, "Validation successful");
});

test("hashes public email addresses before exposing them in community listings", () => {
  const hashed = hashPublicEmail("user@example.com");

  assert.equal(typeof hashed, "string");
  assert.notEqual(hashed, "user@example.com");
  assert.equal(hashed, hashPublicEmail("USER@example.com"));
});

test("rejects empty captcha tokens before processing auth requests", async () => {
  const result = await verifyRecaptchaToken("");

  assert.equal(result.ok, false);
  assert.match(result.message, /captcha/i);
});

test("normalizes comma-separated frontend origins and trims whitespace", () => {
  const origins = normalizeOrigins(
    "https://unieventia-front-end.vercel.app, http://localhost:3000, https://127.0.0.1:3000 ",
  );

  assert.deepEqual(origins, [
    "https://unieventia-front-end.vercel.app",
    "http://localhost:3000",
    "https://127.0.0.1:3000",
  ]);
});
