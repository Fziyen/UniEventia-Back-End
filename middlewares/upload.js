const multer = require("multer");

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/gif"]);
  const hasAllowedExtension = /\.(jpg|jpeg|png|gif)$/i.test(file.originalname);
  if (!allowedMimeTypes.has(file.mimetype) || !hasAllowedExtension) {
    return cb(new Error("Only image files are allowed!"), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = upload;
