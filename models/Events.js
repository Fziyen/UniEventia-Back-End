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

const eventSchema = new mongoose.Schema({
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
  maxParticipants: {
    type: Number,
    required: true,
    min: 1,
    default: 50,
  },
  coverImage: {
    type: String,
    default: "../uploads/events-default.jpg", // Default cover image path
  },
  reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: "Review" }],
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "EventComment" }],
});

const Event = mongoose.model("Event", eventSchema);
module.exports = Event;
