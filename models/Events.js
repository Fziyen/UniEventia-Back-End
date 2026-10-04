// const mongoose = require("mongoose");

// const eventSchema = new mongoose.Schema({
//   title: {
//     type: String,
//     required: true,
//   },
//   description: {
//     type: String,
//     required: true,
//   },
//   StartDate: {
//     type: Date,
//     required: true,
//   },
//   EndDate: {
//     type: Date,
//     required: true,
//   },
//   location: {
//     type: String,
//     required: true,
//   },
//   organizer: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "User",
//     required: true,
//   },
//   participants: [
//     {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//     },
//   ],
//   createdAt: {
//     type: Date,
//     default: Date.now,
//   },
// });

// const Event = mongoose.model("Event", eventSchema);
// module.exports = Event;

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// const mongoose = require("mongoose");

// const eventSchema = new mongoose.Schema({
//   title: { type: String, required: true },
//   description: { type: String },
//   startDate: { type: Date, required: true },
//   endDate: { type: Date, required: true },
//   location: { type: String, required: true },
//   organizer: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "User",
//     required: true,
//   },
//   participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
//   createdAt: { type: Date, default: Date.now },
// });

// const Event = mongoose.model("Event", eventSchema);
// module.exports = Event;

const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    location: { type: String, required: true },
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    waitlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    language: { type: String, maxlength: 100, default: "" },
    wheelchairAccess: { type: String, enum: ["unknown", "yes", "partial", "no"], default: "unknown" },
    cost: { type: String, maxlength: 200, default: "" },
    transport: { type: String, maxlength: 2000, default: "" },
    whatToBring: { type: String, maxlength: 2000, default: "" },
    maxParticipants: {
      type: Number,
      required: true,
      min: 1,
      default: 50,
    },
    coverImage: {
      type: String,
      default: null,
    },
    coverImageFileId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: "Review" }],
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "EventComment" }],
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  },
);

const Event = mongoose.model("Event", eventSchema);
module.exports = Event;
