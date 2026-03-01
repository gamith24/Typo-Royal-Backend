import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const userAchievementSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    achievement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Achievement",
      required: true,
      index: true
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },
  { timestamps: true }
);

userAchievementSchema.index({ user: 1, achievement: 1 }, { unique: true });
userAchievementSchema.plugin(toClientPlugin);

export const UserAchievementModel = mongoose.model("UserAchievement", userAchievementSchema);

