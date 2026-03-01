import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ["system", "event", "friend", "invite", "rank", "admin", "mail", "notification"],
      default: "system"
    },
    message: {
      type: String,
      required: true,
      maxlength: 300
    },
    readAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.plugin(toClientPlugin);

export const NotificationModel = mongoose.model("Notification", notificationSchema);
