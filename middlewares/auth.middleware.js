const jwt = require("jsonwebtoken");
const config = require("../config");

const auth = (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader || !/^Bearer\s+\S+$/i.test(authHeader)) {
    return res.status(401).send("Access denied. No token provided.");
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (ex) {
    res.status(401).send("Invalid token.");
  }
};

module.exports = auth;
