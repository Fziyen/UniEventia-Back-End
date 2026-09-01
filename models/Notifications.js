const mongoose = require("mongoose");

const ALLOWED_TYPES = [
  "review",
  "participation",
  "invitation",
  "reminder",
  "system",
  "event_update",
];
const normalizeType = (v) => {
  const t = String(v || "")
    .toLowerCase()
    .trim();
  return ALLOWED_TYPES.includes(t) ? t : "system";
};

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    // Normalize type and clamp to a known value to prevent validation failures
    type: {
      type: String,
      enum: ALLOWED_TYPES,
      set: normalizeType,
      default: "system",
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    // removed manual createdAt; timestamps below will manage it
  },
  {
    // keep createdAt field name for compatibility, and add updatedAt
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
    versionKey: false,
  },
);

// Helpful indexes for common queries
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ event: 1, type: 1 });

// Normalize API output: expose id instead of _id
notificationSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

// Convenience creator to ensure consistent writes across the app
notificationSchema.statics.notify = function ({
  recipient,
  event,
  message,
  type,
}) {
  return this.create({ recipient, event, message, type });
};

const Notification = mongoose.model("Notification", notificationSchema);
module.exports = Notification;
