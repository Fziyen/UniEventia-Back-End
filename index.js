require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const config = require("./config");
const authRoutes = require("./routes/auth.routes");
const eventRoutes = require("./routes/events.routes");
const userRoutes = require("./routes/users.routes");
const userNotification = require("./routes/notifications.routes");

const app = express();
app.disable("x-powered-by");
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || config.frontendOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin is not allowed."));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

if (!config.jwtSecret || config.jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters.");
}

if (!config.mongoUri) {
  throw new Error("MONGO_URI must be configured.");
}

mongoose
  .connect(config.mongoUri)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exitCode = 1;
  });

app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/users", userRoutes);
app.use("/api/notifications", userNotification);

app.use((error, req, res, next) => {
  console.error("Unhandled request error:", error);
  if (res.headersSent) return next(error);
  res.status(error.statusCode || 500).json({
    message:
      error.statusCode && error.statusCode < 500
        ? error.message
        : "An unexpected server error occurred.",
  });
});

const PORT = process.env.PORT || 5030;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
