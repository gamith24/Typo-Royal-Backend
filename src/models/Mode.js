import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const modeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    key: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    type: { type: String, enum: ["standard", "quest"], default: "standard", index: true },
    requiredPlayers: { type: Number, required: true, min: 1, max: 48 },
    teamSize: { type: Number, required: true, min: 1, max: 8 },
    teamCount: { type: Number, required: true, min: 1, max: 16 },
    minPlayers: { type: Number, default: 1, min: 1, max: 48 },
    maxPlayers: { type: Number, default: 48, min: 1, max: 48 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

modeSchema.index({ active: 1, type: 1 });
modeSchema.plugin(toClientPlugin);

export const ModeModel = mongoose.model("Mode", modeSchema);

