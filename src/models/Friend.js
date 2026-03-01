import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const friendSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    friend: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["accepted", "pending", "blocked"],
      default: "accepted",
      index: true
    }
  },
  { timestamps: true }
);

friendSchema.index({ user: 1, friend: 1 }, { unique: true });
friendSchema.plugin(toClientPlugin);

export const FriendModel = mongoose.model("Friend", friendSchema);

