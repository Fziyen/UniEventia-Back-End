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

const validateSignupInput = ({ fname, lname, email, password, role }) => {
  const firstName = String(fname || "").trim();
  const lastName = String(lname || "").trim();
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

exports.register = async (req, res) => {
  const validation = validateSignupInput(req.body);
  if (!validation.ok) {
    return res.status(400).json({ message: validation.message });
  }

  const captcha = await verifyRecaptchaToken(req.body.recaptcha, "register");
  if (!captcha.ok) {
    return res.status(400).json({ message: captcha.message });
  }

  const { fname, lname, email, password, role } = validation.data;

  try {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newUser = new User({
      fname,
      lname,
      email,
      password: hashedPassword,
      role,
    });

    await newUser.save();
    const safeUser = newUser.toObject();
    delete safeUser.password;

    console.log("User registered successfully:", safeUser);
    res.status(201).json({
      message: "User registered successfully",
      user: safeUser,
    });
  } catch (error) {
    console.error("Error during user registration:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.login = async (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "").trim();

  const captcha = await verifyRecaptchaToken(req.body.recaptcha, "login");
  if (!captcha.ok) {
    return res.status(400).json({ message: captcha.message });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.error("User not found with email:", email);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      config.jwtSecret,
      { expiresIn: "4h" },
    );

    const safeUser = user.toObject();
    delete safeUser.password;

    console.log("User logged in successfully:", safeUser);
    res.status(200).json({ token, user: safeUser });
  } catch (error) {
    console.error("Error during user login:", error);
    res.status(500).json({ message: "Server error" });
  }
};
