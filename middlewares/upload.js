const multer = require("multer");

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/gif"]);
  const hasAllowedExtension = /\.(jpg|jpeg|png|gif)$/i.test(file.originalname);
  if (!allowedMimeTypes.has(file.mimetype) || !hasAllowedExtension) {
    return cb(Object.assign(new Error("Only image files are allowed!"), { statusCode: 400 }), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 2, fields: 16, parts: 18, fieldSize: 10000 },
});

module.exports = upload;
