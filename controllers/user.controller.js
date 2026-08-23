const User = require("../models/User");
const path = require("path");

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
    res.status(200).json({
      items: users,
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
    const allowedFields = ["fname", "lname", "email"];
    const updates = Object.fromEntries(
      allowedFields
        .filter((field) => req.body[field] !== undefined)
        .map((field) => [field, req.body[field]]),
    );
    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    }).select("-password");
    if (!user) {
      return res.status(404).send("User not found");
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(400).send(error.message);
  }
};

// Delete User Profile
exports.deleteUserProfile = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.user.id);
    if (!user) {
      return res.status(404).send("User not found");
    }
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
    user.profilePicture = `/uploads/${req.file.filename}`;
    await user.save();
    res.status(200).json(user);
  } catch (error) {
    res.status(400).send(error);
  }
};
