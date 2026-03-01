import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const rankingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    bucket: {
      type: String,
      enum: ["test", "quest", "trial"],
      required: true,
      index: true
    },
    points: {
      type: Number,
      default: 500,
      index: true
    }
  },
  { timestamps: true }
);

rankingSchema.index({ user: 1, bucket: 1 }, { unique: true });
rankingSchema.index({ bucket: 1, points: -1 });
rankingSchema.plugin(toClientPlugin);

export const RankingModel = mongoose.model("Ranking", rankingSchema);

