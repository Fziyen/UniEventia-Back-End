// const mongoose = require("mongoose");
// const bcrypt = require("bcrypt");

// const userSchema = new mongoose.Schema({
//   fname: {
//     type: String,
//     required: true,
//   },
//   lname: {
//     type: String,
//     required: true,
//   },
//   Age: {
//     type: Number,
//     required: true,
//   },
//   email: {
//     type: String,
//     required: true,
//     unique: true,
//   },
//   password: {
//     type: String,
//     required: true,
//   },
//   role: {
//     type: String,
//     enum: ["Organizer", "Participant", "Admin"],
//     required: true,
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now,
//   },
// });

// const User = mongoose.model("User", userSchema);
// module.exports = User;

// const mongoose = require("mongoose");
// const bcrypt = require("bcrypt");

// const userSchema = new mongoose.Schema({
//   fname: { type: String, required: true },
//   lname: { type: String, required: true },
//   email: { type: String, required: true, unique: true },
//   password: { type: String, required: true },
//   role: {
//     type: String,
//     enum: ["Organizer", "Participant"],
//     required: true,
//   },
//   createdAt: { type: Date, default: Date.now },
// });

// // Hash password before saving
// userSchema.pre("save", async function (next) {
//   if (this.isModified("password") || this.isNew) {
//     const salt = await bcrypt.genSalt(10);
//     this.password = await bcrypt.hash(this.password, salt);
//   }
//   next();
// });

// const User = mongoose.model("User", userSchema);
// module.exports = User;

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  fname: { type: String, required: true },
  lname: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePicture: {
    type: String,
    default: null,
  },
  bio: {
    type: String,
    default: null,
  },
  role: {
    type: String,
    enum: ["Organizer", "Participant"],
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
  notifications: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Notifications" },
  ],
});

const User = mongoose.model("User", userSchema);
module.exports = User;
