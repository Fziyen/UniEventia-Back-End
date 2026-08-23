const multer = require("multer");
const fs = require("fs");
const path = require("path");

const uploadDirectory = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDirectory);
  },
  filename: function (req, file, cb) {
    const extension = path.extname(file.originalname).toLowerCase();
    const basename = path
      .basename(file.originalname, extension)
      .replace(/[^a-z0-9-_]/gi, "-");
    cb(null, `${Date.now()}-${basename}${extension}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/gif"]);
  const hasAllowedExtension = /\.(jpg|jpeg|png|gif)$/i.test(file.originalname);
  if (!allowedMimeTypes.has(file.mimetype) || !hasAllowedExtension) {
    return cb(new Error("Only image files are allowed!"), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = upload;
