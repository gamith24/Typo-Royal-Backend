import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const achievementSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    rarity: { type: String, enum: ["common", "rare", "epic", "legendary"], default: "common", index: true },
    description: { type: String, default: "", maxlength: 300 }
  },
  { timestamps: true }
);

achievementSchema.plugin(toClientPlugin);

export const AchievementModel = mongoose.model("Achievement", achievementSchema);

