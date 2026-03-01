import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const conversationSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["private", "group"],
      required: true,
      index: true
    },
    title: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80
    },
    members: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      required: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: true }
);

conversationSchema.index({ kind: 1, members: 1, createdAt: -1 });
conversationSchema.plugin(toClientPlugin);

export const ConversationModel = mongoose.model("Conversation", conversationSchema);
