const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");

const auth = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader || !/^Bearer\s+\S+$/i.test(authHeader)) {
    return res.status(401).send("Access denied. No token provided.");
  }
  const token = authHeader.replace(/^Bearer\s+/i, "");
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
    if (typeof decoded.id !== "string" || !/^[a-f0-9]{24}$/i.test(decoded.id)) {
      return res.status(401).send("Invalid token.");
    }
  } catch {
    return res.status(401).send("Invalid or expired token.");
  }

  // Database availability problems must not be reported as invalid sessions.
  try {
    const user = await User.findById(decoded.id).select("role");
    if (!user) return res.status(401).send("User no longer exists.");
    req.user = { ...decoded, role: user.role };
  } catch {
    return res.status(503).json({ message: "Unable to verify your session right now. Please try again shortly." });
  }
  next();
};
module.exports = auth;
