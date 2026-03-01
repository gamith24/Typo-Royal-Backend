import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const trendPointSchema = new mongoose.Schema(
  {
    round: { type: Number, required: true },
    value: { type: Number, required: true }
  },
  { _id: false }
);

const profileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    stats: {
      wpm: { type: Number, default: 0 },
      accuracy: { type: Number, default: 0 },
      iqScore: { type: Number, default: 0 },
      matches: { type: Number, default: 0, index: true },
      wins: { type: Number, default: 0 },
      losses: { type: Number, default: 0 }
    },
    trends: {
      wpm: { type: [trendPointSchema], default: [] },
      accuracy: { type: [trendPointSchema], default: [] },
      iq: { type: [trendPointSchema], default: [] }
    }
  },
  { timestamps: true }
);

profileSchema.plugin(toClientPlugin);

export const ProfileModel = mongoose.model("Profile", profileSchema);
