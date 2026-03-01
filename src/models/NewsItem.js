import mongoose from "mongoose";
import { toClientPlugin } from "./plugins/toClient.js";

const newsItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    detail: { type: String, required: true, trim: true, maxlength: 400 },
    kind: { type: String, enum: ["news", "event"], default: "news", index: true },
    bannerType: { type: String, enum: ["text", "html", "image"], default: "text" },
    bannerHtml: { type: String, default: "", maxlength: 12000 },
    imageUrl: { type: String, default: "", trim: true, maxlength: 2000 },
    active: { type: Boolean, default: true, index: true },
    pinned: { type: Boolean, default: false, index: true },
    startsAt: { type: Date, default: null, index: true },
    endsAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

newsItemSchema.index({ pinned: 1, startsAt: -1, createdAt: -1 });
newsItemSchema.plugin(toClientPlugin);

export const NewsItemModel = mongoose.model("NewsItem", newsItemSchema);
