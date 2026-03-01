import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const lobbyPlayerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true },
    ready: { type: Boolean, default: false }
  },
  { _id: false }
);

const lobbySchema = new mongoose.Schema(
  {
    mode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mode",
      required: true,
      index: true
    },
    modeType: {
      type: String,
      enum: ["standard", "quest"],
      required: true,
      index: true
    },
    configKey: {
      type: String,
      required: true,
      default: "1v1",
      index: true
    },
    teamCount: {
      type: Number,
      required: true,
      default: 2,
      min: 1,
      max: 16
    },
    selectedDifficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium"
    },
    leader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    requiredPlayers: {
      type: Number,
      required: true,
      min: 1,
      max: 48
    },
    teamSize: {
      type: Number,
      required: true,
      min: 1,
      max: 8
    },
    players: {
      type: [lobbyPlayerSchema],
      default: []
    },
    invites: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: []
    },
    status: {
      type: String,
      enum: ["open", "queueing", "in_match", "closed"],
      default: "open",
      index: true
    },
    queueKey: {
      type: String,
      default: "",
      index: true
    },
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      default: null
    }
  },
  { timestamps: true }
);

lobbySchema.index({ status: 1, queueKey: 1, createdAt: 1 });
lobbySchema.index({ mode: 1, configKey: 1, selectedDifficulty: 1, status: 1 });
lobbySchema.plugin(toClientPlugin);

export const LobbyModel = mongoose.model("Lobby", lobbySchema);
