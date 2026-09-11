// routes/userRoutes.js
const express = require("express");
const {
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
  updateProfilePicture,
  getAllUsers,
  getProfilePicture,
} = require("../controllers/user.controller");
const auth = require("../middlewares/auth.middleware");
const upload = require("../middlewares/upload");

const router = express.Router();

router.get("/profile", auth, getUserProfile);
router.get("/:id/profile-picture", getProfilePicture);
router.put("/profile", auth, updateUserProfile);
router.delete("/profile", auth, deleteUserProfile);
router.get("/", auth, getAllUsers);

router.put(
  "/profile-picture",
  auth,
  upload.single("profilePicture"),
  updateProfilePicture,
);

module.exports = router;
