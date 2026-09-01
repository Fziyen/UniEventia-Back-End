const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");

const auth = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader || !/^Bearer\s+\S+$/i.test(authHeader)) {
    return res.status(401).send("Access denied. No token provided.");
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.id).select("role");

    if (!user) {
      return res.status(401).send("User no longer exists.");
    }

    req.user = {
      ...decoded,
      role: user.role,
    };
    next();
  } catch (ex) {
    return res.status(401).send("Invalid token.");
  }
};

module.exports = auth;
