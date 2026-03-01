import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const questSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    detail: { type: String, required: true, trim: true, maxlength: 500 },
    minPlayers: { type: Number, default: 1, min: 1, max: 48 },
    maxPlayers: { type: Number, default: 48, min: 1, max: 48 },
    rankedCategory: {
      type: String,
      enum: ["test", "quest", "trial"],
      default: "quest",
      index: true
    },
    active: { type: Boolean, default: true, index: true },
    startsAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

questSchema.plugin(toClientPlugin);

export const QuestModel = mongoose.model("Quest", questSchema);

