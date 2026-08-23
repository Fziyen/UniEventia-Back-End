module.exports = {
  mongoUri: process.env.MONGO_URI || process.env.MONGO_CLOUD_URI,
  jwtSecret: process.env.JWT_SECRET || "",
  frontendOrigins: String(
    process.env.FRONTEND_ORIGIN ||
      "http://localhost:3000,http://127.0.0.1:3000",
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
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
