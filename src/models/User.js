import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 24,
      index: true
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 24
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      enum: ["player", "admin"],
      default: "player",
      index: true
    },
    avatarUrl: {
      type: String,
      trim: true,
      default: ""
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

userSchema.plugin(toClientPlugin);

export const UserModel = mongoose.model("User", userSchema);
