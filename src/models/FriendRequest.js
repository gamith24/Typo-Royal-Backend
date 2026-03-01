import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const friendRequestSchema = new mongoose.Schema(
  {
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    toUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "canceled"],
      default: "pending",
      index: true
    }
  },
  { timestamps: true }
);

friendRequestSchema.index(
  { fromUser: 1, toUser: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);
friendRequestSchema.index({ toUser: 1, status: 1, createdAt: -1 });
friendRequestSchema.plugin(toClientPlugin);

export const FriendRequestModel = mongoose.model("FriendRequest", friendRequestSchema);

