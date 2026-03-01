import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const chatMessageSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: ["lobby", "match", "team", "conversation"],
      required: true,
      index: true
    },
    lobby: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lobby",
      default: null,
      index: true
    },
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      default: null,
      index: true
    },
    teamId: {
      type: String,
      default: null,
      index: true
    },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
      index: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    username: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300
    }
  },
  { timestamps: true }
);

chatMessageSchema.index({ scope: 1, lobby: 1, createdAt: -1 });
chatMessageSchema.index({ scope: 1, match: 1, teamId: 1, createdAt: -1 });
chatMessageSchema.index({ scope: 1, conversation: 1, createdAt: -1 });
chatMessageSchema.plugin(toClientPlugin);

export const ChatMessageModel = mongoose.model("ChatMessage", chatMessageSchema);
