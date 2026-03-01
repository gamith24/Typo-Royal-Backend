import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const quizQuestionSchema = new mongoose.Schema(
  {
    typingTest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TypingTest",
      required: true,
      index: true
    },
    question: { type: String, required: true, trim: true, maxlength: 300 },
    options: {
      type: [String],
      validate: {
        validator: (options) => Array.isArray(options) && options.length >= 2 && options.length <= 6,
        message: "Quiz question options must contain 2 to 6 entries"
      }
    },
    correctIndex: { type: Number, required: true, min: 0 },
    explanation: { type: String, default: "", maxlength: 500 }
  },
  { timestamps: true }
);

quizQuestionSchema.index({ typingTest: 1, createdAt: 1 });
quizQuestionSchema.plugin(toClientPlugin);

export const QuizQuestionModel = mongoose.model("QuizQuestion", quizQuestionSchema);

