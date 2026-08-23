const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  registeredAt: {
    type: Date,
    default: Date.now,
  },
});
const Registration = mongoose.model("Registration", registrationSchema);
module.exports = Registration;
