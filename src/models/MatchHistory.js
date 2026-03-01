import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const participantSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true },
    teamId: { type: String, required: true },
    won: { type: Boolean, default: false }
  },
  { _id: false }
);

const matchHistorySchema = new mongoose.Schema(
  {
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      required: true,
      unique: true,
      index: true
    },
    mode: { type: mongoose.Schema.Types.ObjectId, ref: "Mode", required: true, index: true },
    modeType: { type: String, enum: ["standard", "quest"], required: true },
    participants: { type: [participantSchema], default: [] },
    winnerTeamId: { type: String, default: null },
    startedAt: { type: Date, required: true, index: true },
    endedAt: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);

matchHistorySchema.index({ "participants.user": 1, endedAt: -1 });
matchHistorySchema.plugin(toClientPlugin);

export const MatchHistoryModel = mongoose.model("MatchHistory", matchHistorySchema);

