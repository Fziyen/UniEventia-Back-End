const crypto = require("crypto");
const User = require("../models/User");
const {
  getImage,
  storeImage,
  streamImage,
  deleteImage,
} = require("../services/imageStorage");
const path = require("path");

const normalizeRole = (role) => {
  const normalized = String(role || "").trim();
  if (normalized === "Organizer" || normalized === "Participant") {
    return normalized;
  }
  return "Participant";
};

const isValidEmail = (email) => {
  const emailRegex =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return emailRegex.test(email);
};

const hashPublicEmail = (email) => {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return "";
  }

  return crypto.createHash("sha256").update(normalized).digest("hex");
};

exports.hashPublicEmail = hashPublicEmail;

const validateProfileUpdateInput = (payload = {}) => {
  const updates = {};

  if (payload.fname !== undefined) {
    const fname = String(payload.fname || "").trim();
    if (!fname) {
      return { ok: false, message: "First name is required." };
    }
    updates.fname = fname;
  }

  if (payload.lname !== undefined) {
    const lname = String(payload.lname || "").trim();
    if (!lname) {
      return { ok: false, message: "Last name is required." };
    }
    updates.lname = lname;
  }

  if (payload.username !== undefined) {
    const username = String(payload.username || "").trim();
    if (!username) {
      return { ok: false, message: "Username is required." };
    }
    if (username.length < 3 || username.length > 30) {
      return {
        ok: false,
        message: "Username must be between 3 and 30 characters.",
      };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return {
        ok: false,
        message:
          "Username can only contain letters, numbers, underscores, and hyphens.",
      };
    }
    updates.username = username;
  }

  if (payload.email !== undefined) {
    const email = String(payload.email || "")
      .trim()
      .toLowerCase();
    if (!email || !isValidEmail(email)) {
      return { ok: false, message: "Invalid email format." };
    }
    updates.email = email;
  }

  if (payload.role !== undefined) {
    const role = normalizeRole(payload.role);
    if (role !== "Organizer" && role !== "Participant") {
      return { ok: false, message: "Role must be Organizer or Participant." };
    }
    updates.role = role;
  }

  if (payload.bio !== undefined) {
    updates.bio = String(payload.bio || "").trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, message: "No profile changes were provided." };
  }

  return { ok: true, data: updates };
};

exports.validateProfileUpdateInput = validateProfileUpdateInput;

// Get User Profile
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password"); // Exclude password field
    if (!user) {
      return res.status(404).send("User not found");
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(400).send(error);
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(15, Math.max(1, Number(req.query.limit || 15)));
    const search = String(req.query.search || "").trim();
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const query = search
      ? {
          $or: [
            { fname: { $regex: escapedSearch, $options: "i" } },
            { lname: { $regex: escapedSearch, $options: "i" } },
            { username: { $regex: escapedSearch, $options: "i" } },
          ],
        }
      : {};
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(query, "-password")
        .sort({ fname: 1, lname: 1, _id: 1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query),
    ]);

    const publicUsers = users.map((user) => {
      const safeUser = user.toObject ? user.toObject() : { ...user };
      safeUser.email = hashPublicEmail(safeUser.email);
      return safeUser;
    });

    res.status(200).json({
      items: publicUsers,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

// Update User Profile
exports.updateUserProfile = async (req, res) => {
  try {
    const validation = validateProfileUpdateInput(req.body);
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }

    const { username, email, role, ...rest } = validation.data;
    const duplicateCriteria = [];

    if (username !== undefined) duplicateCriteria.push({ username });
    if (email !== undefined) duplicateCriteria.push({ email });

    if (duplicateCriteria.length > 0) {
      const conflict = await User.findOne({
        _id: { $ne: req.user.id },
        $or: duplicateCriteria,
      });

      if (conflict) {
        if (username !== undefined && conflict.username === username) {
          return res
            .status(409)
            .json({ message: "Username is already taken." });
        }
        if (email !== undefined && conflict.email === email) {
          return res
            .status(409)
            .json({ message: "Email is already registered." });
        }
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        ...rest,
        ...(username !== undefined ? { username } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(role !== undefined ? { role } : {}),
      },
      {
        new: true,
        runValidators: true,
      },
    ).select("-password");

    if (!user) {
      return res.status(404).send("User not found");
    }
    res.status(200).json(user);
  } catch (error) {
    res
      .status(400)
      .json({ message: error.message || "Profile update failed." });
  }
};

// Delete User Profile
exports.deleteUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).send("User not found");
    }

    await user.deleteOne();
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(400).send(error.message);
  }
};

exports.updateProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("An image file is required");
    }
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).send("User not found");
    }
    const oldImageFileId = user.profilePictureFileId;
    user.profilePictureFileId = await storeImage({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    user.profilePicture = `/api/users/${user._id}/profile-picture`;
    await user.save();
    await deleteImage(oldImageFileId);
    res.status(200).json(user);
  } catch (error) {
    res.status(400).send(error);
  }
};

exports.getProfilePicture = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "profilePictureFileId",
    );
    if (!user || !user.profilePictureFileId) return res.status(404).end();

    const image = await getImage(user.profilePictureFileId);
    if (!image) return res.status(404).end();

    res.setHeader(
      "Content-Type",
      image.contentType || "application/octet-stream",
    );
    res.setHeader("Content-Length", image.length);
    streamImage(user.profilePictureFileId, res);
  } catch (error) {
    res.status(400).send(error.message);
  }
};
