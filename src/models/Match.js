import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const teamMemberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true }
  },
  { _id: false }
);

const teamSchema = new mongoose.Schema(
  {
    teamId: { type: String, required: true },
    index: { type: Number, required: true },
    members: { type: [teamMemberSchema], default: [] }
  },
  { _id: false }
);

const matchSchema = new mongoose.Schema(
  {
    mode: { type: mongoose.Schema.Types.ObjectId, ref: "Mode", required: true, index: true },
    modeKey: { type: String, required: true, index: true },
    modeType: { type: String, enum: ["standard", "quest"], required: true, index: true },
    configKey: { type: String, required: true, default: "1v1", index: true },
    selectedDifficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
    requiredPlayers: { type: Number, required: true },
    teamSize: { type: Number, required: true },
    teams: { type: [teamSchema], default: [] },
    game: { type: mongoose.Schema.Types.Mixed, default: {} },
    winnerTeamId: { type: String, default: null },
    status: { type: String, enum: ["active", "completed"], default: "active", index: true },
    startedAt: { type: Date, default: Date.now, index: true },
    endedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

matchSchema.index({ status: 1, startedAt: -1 });
matchSchema.plugin(toClientPlugin);

export const MatchModel = mongoose.model("Match", matchSchema);
