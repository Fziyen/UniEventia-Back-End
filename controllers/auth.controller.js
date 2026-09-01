const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const config = require("../config");

const saltRounds = 10;

const isValidEmail = (email) => {
  const emailRegex =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return emailRegex.test(email);
};

const normalizeRole = (role) => {
  const normalized = String(role || "").trim();
  if (normalized === "Organizer" || normalized === "Participant") {
    return normalized;
  }
  return "Participant";
};

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeLoginIdentifier = (identifier) => {
  const normalized = String(identifier || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.toLowerCase();
};

exports.normalizeLoginIdentifier = normalizeLoginIdentifier;

const validateSignupInput = ({
  fname,
  lname,
  username,
  email,
  password,
  role,
}) => {
  const firstName = String(fname || "").trim();
  const lastName = String(lname || "").trim();
  const normalizedUsername = String(username || "").trim();
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const normalizedPassword = String(password || "").trim();
  const normalizedRole = normalizeRole(role);

  if (!firstName || !lastName) {
    return {
      ok: false,
      message: "First name and last name are required.",
    };
  }

  if (!normalizedUsername) {
    return {
      ok: false,
      message: "Username is required.",
    };
  }

  if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
    return {
      ok: false,
      message: "Username must be between 3 and 30 characters.",
    };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(normalizedUsername)) {
    return {
      ok: false,
      message:
        "Username can only contain letters, numbers, underscores, and hyphens.",
    };
  }

  if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
    return {
      ok: false,
      message: "Invalid email format.",
    };
  }

  if (normalizedPassword.length < 8) {
    return {
      ok: false,
      message: "Password must be at least 8 characters long.",
    };
  }

  if (
    !/[A-Z]/.test(normalizedPassword) ||
    !/[a-z]/.test(normalizedPassword) ||
    !/\d/.test(normalizedPassword)
  ) {
    return {
      ok: false,
      message: "Password must include uppercase, lowercase, and a number.",
    };
  }

  return {
    ok: true,
    message: "Validation successful",
    data: {
      fname: firstName,
      lname: lastName,
      username: normalizedUsername,
      email: normalizedEmail,
      password: normalizedPassword,
      role: normalizedRole,
    },
  };
};

exports.validateSignupInput = validateSignupInput;

const verifyRecaptchaToken = async (token, expectedAction) => {
  const responseToken = String(token || "").trim();

  if (!responseToken) {
    return {
      ok: false,
      message: "reCAPTCHA verification is required.",
    };
  }

  if (!config.recaptchaSecretKey) {
    return {
      ok: false,
      message: "reCAPTCHA is not configured on the server.",
    };
  }

  try {
    const response = await fetch(
      "https://www.google.com/recaptcha/api/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        },
        body: new URLSearchParams({
          secret: config.recaptchaSecretKey,
          response: responseToken,
        }).toString(),
      },
    );

    const payload = await response.json();

    if (
      !response.ok ||
      !payload.success ||
      payload.action !== expectedAction ||
      Number(payload.score) < config.recaptchaMinScore
    ) {
      console.warn("reCAPTCHA rejected authentication request", {
        action: payload.action,
        score: payload.score,
        errorCodes: payload["error-codes"],
      });
      return {
        ok: false,
        message: "reCAPTCHA verification failed. Please try again.",
      };
    }

    return { ok: true, message: "reCAPTCHA verified successfully." };
  } catch (error) {
    console.error("reCAPTCHA verification error:", error);
    return {
      ok: false,
      message: "reCAPTCHA verification is unavailable right now.",
    };
  }
};

exports.verifyRecaptchaToken = verifyRecaptchaToken;

const createAuthSession = (user) => {
  const safeUser = user.toObject ? user.toObject() : { ...user };
  delete safeUser.password;

  const jwtSecret =
    config.jwtSecret || "development-test-secret-must-be-at-least-32-chars";

  const token = jwt.sign({ id: safeUser._id, role: safeUser.role }, jwtSecret, {
    expiresIn: "4h",
  });

  return {
    token,
    user: safeUser,
  };
};

exports.createAuthSession = createAuthSession;

exports.register = async (req, res) => {
  const validation = validateSignupInput(req.body);
  if (!validation.ok) {
    return res.status(400).json({ message: validation.message });
  }

  const captcha = await verifyRecaptchaToken(req.body.recaptcha, "register");
  if (!captcha.ok) {
    return res.status(400).json({ message: captcha.message });
  }

  const { fname, lname, username, email, password, role } = validation.data;

  try {
    // Check if email or username already exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }],
    });
    if (existingUser) {
      return res.status(400).json({
        message:
          existingUser.email === email.toLowerCase()
            ? "Email already registered"
            : "Username already taken",
      });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newUser = new User({
      fname,
      lname,
      username,
      email,
      password: hashedPassword,
      role,
    });

    await newUser.save();
    const session = createAuthSession(newUser);

    console.log("User registered successfully:", session.user);
    res.status(201).json({
      message: "User registered successfully",
      token: session.token,
      user: session.user,
    });
  } catch (error) {
    console.error("Error during user registration:", error);
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        message: `${field === "username" ? "Username" : "Email"} already in use`,
      });
    }
    res.status(500).json({ message: "Server error" });
  }
};

exports.login = async (req, res) => {
  const identifier = normalizeLoginIdentifier(
    req.body.identifier ?? req.body.email ?? req.body.username,
  );
  const password = String(req.body.password || "").trim();

  const captcha = await verifyRecaptchaToken(req.body.recaptcha, "login");
  if (!captcha.ok) {
    return res.status(400).json({ message: captcha.message });
  }

  try {
    const user = await User.findOne({
      $or: [
        { email: identifier },
        {
          username: {
            $regex: `^${escapeRegex(identifier)}$`,
            $options: "i",
          },
        },
      ],
    });

    if (!user) {
      console.error("User not found with identifier:", identifier);
      return res
        .status(401)
        .json({ message: "Invalid username/email or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ message: "Invalid username/email or password" });
    }

    const session = createAuthSession(user);

    console.log("User logged in successfully:", session.user);
    res.status(200).json({
      token: session.token,
      user: session.user,
    });
  } catch (error) {
    console.error("Error during user login:", error);
    res.status(500).json({ message: "Server error" });
  }
};
