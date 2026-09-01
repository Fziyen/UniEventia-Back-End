const defaultFrontendOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://*.vercel.app",
  "https://*.netlify.app",
];

function normalizeOrigins(value) {
  if (!value) return defaultFrontendOrigins;

  return String(value)
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function isAllowedOrigin(origin, allowedOrigins = []) {
  if (!origin) return true;

  const normalizedOrigin = origin.trim().replace(/\/+$/, "");

  return allowedOrigins.some((allowedOrigin) => {
    if (!allowedOrigin) return false;

    const pattern = allowedOrigin.trim().replace(/\/+$/, "");

    if (pattern.includes("*")) {
      const escapedPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\\*/g, ".*");
      return new RegExp(`^${escapedPattern}$`, "i").test(normalizedOrigin);
    }

    return normalizedOrigin === pattern;
  });
}

module.exports = {
  mongoUri: process.env.MONGO_URI || process.env.MONGO_CLOUD_URI,
  jwtSecret: process.env.JWT_SECRET || "",
  normalizeOrigins,
  isAllowedOrigin,
  frontendOrigins: normalizeOrigins(
    process.env.FRONTEND_ORIGIN || defaultFrontendOrigins.join(","),
  ),
  recaptchaSiteKey:
    process.env.REACT_APP_RECAPTCHA_SITE_KEY ||
    process.env.ReCaptcha_SITE_KEY ||
    process.env.RECAPTCHA_SITE_KEY ||
    "",
  recaptchaSecretKey:
    process.env.RECAPTCHA_SECRET_KEY ||
    process.env.ReCaptcha_SECRET_KEY ||
    process.env.RECAPTCHA_SECRET ||
    "",
  recaptchaMinScore: Number.isFinite(Number(process.env.RECAPTCHA_MIN_SCORE))
    ? Math.min(0.9, Math.max(0.1, Number(process.env.RECAPTCHA_MIN_SCORE)))
    : 0.5,
};
