import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const typingTestSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80, index: true },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    rules: { type: String, default: "", trim: true, maxlength: 800 },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], required: true, index: true },
    type: { type: String, enum: ["typing", "quiz"], default: "typing", index: true },
    timeLimitSec: { type: Number, default: 82, min: 20, max: 600 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    active: { type: Boolean, default: true, index: true },
    lastUsedAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

typingTestSchema.plugin(toClientPlugin);

export const TypingTestModel = mongoose.model("TypingTest", typingTestSchema);
