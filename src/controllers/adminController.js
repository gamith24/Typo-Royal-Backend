import mongoose from "mongoose";
import {
  LobbyModel,
  ModeModel,
  NewsItemModel,
  NotificationModel,
  ProfileModel,
  QuizQuestionModel,
  RankingModel,
  TypingTestModel,
  UserModel
} from "../models/index.js";
import { toClientMode } from "../utils/serializers.js";
import { badRequest } from "../utils/httpError.js";
import { mapBannerToClient } from "../utils/banner.js";
import { emitToRoom, emitToUser } from "../services/realtime.js";

function broadcastBannerUpdate() {
  emitToRoom("global:lobby", "banners:update", { ts: Date.now() });
}

export async function overview(req, res) {
  const [users, activeLobbies, queuedModes, tests, modes, eventBanners] = await Promise.all([
    UserModel.countDocuments(),
    LobbyModel.countDocuments({ status: { $in: ["open", "queueing"] } }),
    LobbyModel.aggregate([
      { $match: { status: "queueing" } },
      { $group: { _id: "$queueKey", waitingLobbies: { $sum: 1 } } },
      { $project: { _id: 0, key: "$_id", waitingLobbies: 1 } }
    ]),
    TypingTestModel.find().sort({ createdAt: -1 }).lean(),
    ModeModel.find().sort({ createdAt: -1 }).lean(),
    NewsItemModel.find({ kind: "event" }).sort({ createdAt: -1 }).limit(20).lean()
  ]);
  const now = new Date();

  res.json({
    users,
    activeLobbies,
    queuedModes,
    tests: tests.map((test) => ({
      id: String(test._id),
      title: test.title,
      content: test.content,
      rules: test.rules,
      difficulty: test.difficulty,
      type: test.type,
      timeLimitSec: test.timeLimitSec,
      active: test.active,
      lastUsedAt: test.lastUsedAt,
      createdAt: test.createdAt
    })),
    modes: modes.map(toClientMode),
    eventBanners: eventBanners.map((row) => mapBannerToClient(row, now))
  });
}

export async function createMode(req, res) {
  const {
    name,
    key,
    type = "standard",
    requiredPlayers,
    teamSize = 1,
    teamCount = 2,
    minPlayers = 1,
    maxPlayers = 48
  } = req.body || {};

  if (!name || !key) {
    throw badRequest("name and key are required");
  }

  const mode = await ModeModel.create({
    name: String(name).trim(),
    key: String(key).trim().toLowerCase(),
    type,
    requiredPlayers,
    teamSize,
    teamCount,
    minPlayers,
    maxPlayers,
    createdBy: req.user._id
  });
  res.status(201).json({ mode: toClientMode(mode) });
}

export async function createTest(req, res) {
  const { title, content, difficulty, type = "typing", rules = "", active = true, timeLimitSec } = req.body || {};
  const allowedDifficulty = ["easy", "medium", "hard"];
  const allowedType = ["typing", "quiz"];

  if (!title || !content) {
    throw badRequest("title and content are required");
  }
  if (!allowedDifficulty.includes(difficulty)) {
    throw badRequest("difficulty must be easy, medium, or hard");
  }
  if (!allowedType.includes(type)) {
    throw badRequest("type must be typing or quiz");
  }
  const parsedTimeLimit = Number(timeLimitSec);
  if (!Number.isFinite(parsedTimeLimit) || parsedTimeLimit < 20 || parsedTimeLimit > 600) {
    throw badRequest("timeLimitSec must be a number between 20 and 600");
  }

  const test = await TypingTestModel.create({
    title: String(title).trim(),
    content: String(content).trim(),
    rules: String(rules || "").trim(),
    difficulty,
    type,
    timeLimitSec: Math.round(parsedTimeLimit),
    active: Boolean(active),
    createdBy: req.user._id
  });

  res.status(201).json({
    test: {
      id: String(test._id),
      title: test.title,
      content: test.content,
      rules: test.rules,
      difficulty: test.difficulty,
      type: test.type,
      timeLimitSec: test.timeLimitSec,
      active: test.active,
      createdAt: test.createdAt
    }
  });
}

export async function listTests(req, res) {
  const tests = await TypingTestModel.find().sort({ createdAt: -1 }).lean();
  res.json({
    tests: tests.map((test) => ({
      id: String(test._id),
      title: test.title,
      content: test.content,
      rules: test.rules,
      difficulty: test.difficulty,
      type: test.type,
      timeLimitSec: test.timeLimitSec,
      active: test.active,
      lastUsedAt: test.lastUsedAt,
      createdAt: test.createdAt
    }))
  });
}

export async function listPlayers(req, res) {
  const users = await UserModel.find()
    .sort({ createdAt: -1 })
    .select("_id displayName username avatarUrl role createdAt")
    .lean();

  if (!users.length) {
    res.json({ players: [] });
    return;
  }

  const userIds = users.map((u) => u._id);
  const [profiles, rankings] = await Promise.all([
    ProfileModel.find({ user: { $in: userIds } }).lean(),
    RankingModel.find({ user: { $in: userIds } }).lean()
  ]);

  const profileMap = new Map(profiles.map((item) => [String(item.user), item]));
  const rankMap = new Map();
  for (const row of rankings) {
    const key = String(row.user);
    const current = rankMap.get(key) || { test: 500, quest: 500, trial: 500 };
    current[row.bucket] = row.points;
    rankMap.set(key, current);
  }

  res.json({
    players: users.map((user) => {
      const profile = profileMap.get(String(user._id));
      return {
        id: String(user._id),
        username: user.displayName || user.username,
        avatarUrl: user.avatarUrl || "",
        role: user.role,
        createdAt: user.createdAt,
        stats: profile?.stats || { wpm: 0, accuracy: 0, iqScore: 0, matches: 0, wins: 0, losses: 0 },
        rankBuckets: rankMap.get(String(user._id)) || { test: 500, quest: 500, trial: 500 }
      };
    })
  });
}

export async function playerDetail(req, res) {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) {
    throw badRequest("Invalid userId");
  }

  const [user, profile, rankings, notifications] = await Promise.all([
    UserModel.findById(userId).select("_id displayName username role avatarUrl createdAt").lean(),
    ProfileModel.findOne({ user: userId }).lean(),
    RankingModel.find({ user: userId }).lean(),
    NotificationModel.find({ user: userId }).sort({ createdAt: -1 }).limit(20).lean()
  ]);

  if (!user) {
    return res.status(404).json({ error: "Player not found" });
  }

  const rankBuckets = { test: 500, quest: 500, trial: 500 };
  for (const row of rankings) {
    rankBuckets[row.bucket] = row.points;
  }

  res.json({
    player: {
      id: String(user._id),
      username: user.displayName || user.username,
      avatarUrl: user.avatarUrl || "",
      role: user.role,
      createdAt: user.createdAt,
      stats: profile?.stats || { wpm: 0, accuracy: 0, iqScore: 0, matches: 0, wins: 0, losses: 0 },
      trends: profile?.trends || { wpm: [], accuracy: [], iq: [] },
      rankBuckets
    },
    notifications: notifications.map((item) => ({
      id: String(item._id),
      type: item.type,
      message: item.message,
      createdAt: item.createdAt
    }))
  });
}

function normalizeAdminType(kind) {
  if (kind === "mail") return "mail";
  return "notification";
}

export async function sendDirectMessage(req, res) {
  const { userId, title = "", message = "", kind = "notification" } = req.body || {};
  if (!mongoose.isValidObjectId(userId)) {
    throw badRequest("Invalid userId");
  }
  const safeMessage = String(message).trim();
  if (!safeMessage) {
    throw badRequest("message is required");
  }

  const recipient = await UserModel.findById(userId).lean();
  if (!recipient) {
    return res.status(404).json({ error: "Player not found" });
  }

  const msgType = normalizeAdminType(kind);
  const finalMessage = String(title || "").trim()
    ? `[${String(title).trim()}] ${safeMessage}`
    : safeMessage;
  const row = await NotificationModel.create({
    user: userId,
    type: msgType,
    message: finalMessage
  });

  emitToUser(String(userId), "admin:message", {
    id: String(row._id),
    type: row.type,
    message: row.message,
    createdAt: row.createdAt
  });

  res.status(201).json({ ok: true, id: String(row._id) });
}

export async function broadcastMessage(req, res) {
  const { title = "", message = "", kind = "notification" } = req.body || {};
  const safeMessage = String(message).trim();
  if (!safeMessage) {
    throw badRequest("message is required");
  }

  const users = await UserModel.find().select("_id").lean();
  if (!users.length) {
    res.json({ ok: true, count: 0 });
    return;
  }

  const msgType = normalizeAdminType(kind);
  const finalMessage = String(title || "").trim()
    ? `[${String(title).trim()}] ${safeMessage}`
    : safeMessage;

  const createdAt = new Date();
  const docs = users.map((user) => ({
    user: user._id,
    type: msgType,
    message: finalMessage,
    createdAt,
    updatedAt: createdAt
  }));
  await NotificationModel.insertMany(docs);

  for (const user of users) {
    emitToUser(String(user._id), "admin:message", {
      type: msgType,
      message: finalMessage,
      createdAt
    });
  }

  res.status(201).json({ ok: true, count: users.length });
}

export async function createEventBanner(req, res) {
  const {
    title = "",
    detail = "",
    startsAt = null,
    endsAt = null,
    pinned = false,
    bannerType = "text",
    bannerHtml = "",
    imageUrl = ""
  } = req.body || {};

  const safeTitle = String(title).trim();
  const safeDetail = String(detail).trim();
  if (!safeTitle || !safeDetail) {
    throw badRequest("title and detail are required");
  }
  if (!["text", "html", "image"].includes(bannerType)) {
    throw badRequest("bannerType must be text, html, or image");
  }

  const safeHtml = String(bannerHtml || "").trim();
  const safeImage = String(imageUrl || "").trim();
  if (bannerType === "html" && !safeHtml) {
    throw badRequest("bannerHtml is required when bannerType is html");
  }
  if (bannerType === "image" && !safeImage) {
    throw badRequest("imageUrl is required when bannerType is image");
  }
  if (safeImage && !/^https?:\/\/[^\s]+$/i.test(safeImage)) {
    throw badRequest("imageUrl must be a valid http/https URL");
  }

  const parsedStartsAt = startsAt ? new Date(startsAt) : null;
  const parsedEndsAt = endsAt ? new Date(endsAt) : null;
  if (parsedStartsAt && Number.isNaN(parsedStartsAt.getTime())) {
    throw badRequest("startsAt must be a valid date");
  }
  if (parsedEndsAt && Number.isNaN(parsedEndsAt.getTime())) {
    throw badRequest("endsAt must be a valid date");
  }
  if (parsedStartsAt && parsedEndsAt && parsedEndsAt <= parsedStartsAt) {
    throw badRequest("endsAt must be later than startsAt");
  }

  if (Boolean(pinned)) {
    await NewsItemModel.updateMany({ kind: "event", pinned: true }, { $set: { pinned: false } });
  }

  const row = await NewsItemModel.create({
    title: safeTitle,
    detail: safeDetail,
    kind: "event",
    active: true,
    pinned: Boolean(pinned),
    startsAt: parsedStartsAt,
    endsAt: parsedEndsAt,
    bannerType,
    bannerHtml: safeHtml,
    imageUrl: safeImage
  });
  broadcastBannerUpdate();
  const mapped = mapBannerToClient(row.toObject(), new Date());

  res.status(201).json({
    banner: mapped
  });
}

export async function updateEventBanner(req, res) {
  const { bannerId } = req.params;
  if (!mongoose.isValidObjectId(bannerId)) {
    throw badRequest("Invalid bannerId");
  }

  const existing = await NewsItemModel.findById(bannerId);
  if (!existing || existing.kind !== "event") {
    return res.status(404).json({ error: "Event banner not found" });
  }

  const {
    title = existing.title,
    detail = existing.detail,
    startsAt = existing.startsAt,
    endsAt = existing.endsAt,
    pinned = existing.pinned,
    bannerType = existing.bannerType || "text",
    bannerHtml = existing.bannerHtml || "",
    imageUrl = existing.imageUrl || "",
    active = existing.active !== false
  } = req.body || {};

  const safeTitle = String(title).trim();
  const safeDetail = String(detail).trim();
  if (!safeTitle || !safeDetail) {
    throw badRequest("title and detail are required");
  }
  if (!["text", "html", "image"].includes(bannerType)) {
    throw badRequest("bannerType must be text, html, or image");
  }

  const safeHtml = String(bannerHtml || "").trim();
  const safeImage = String(imageUrl || "").trim();
  if (bannerType === "html" && !safeHtml) {
    throw badRequest("bannerHtml is required when bannerType is html");
  }
  if (bannerType === "image" && !safeImage) {
    throw badRequest("imageUrl is required when bannerType is image");
  }
  if (safeImage && !/^https?:\/\/[^\s]+$/i.test(safeImage)) {
    throw badRequest("imageUrl must be a valid http/https URL");
  }

  const parsedStartsAt = startsAt ? new Date(startsAt) : null;
  const parsedEndsAt = endsAt ? new Date(endsAt) : null;
  if (parsedStartsAt && Number.isNaN(parsedStartsAt.getTime())) {
    throw badRequest("startsAt must be a valid date");
  }
  if (parsedEndsAt && Number.isNaN(parsedEndsAt.getTime())) {
    throw badRequest("endsAt must be a valid date");
  }
  if (parsedStartsAt && parsedEndsAt && parsedEndsAt <= parsedStartsAt) {
    throw badRequest("endsAt must be later than startsAt");
  }

  if (Boolean(pinned)) {
    await NewsItemModel.updateMany({ kind: "event", pinned: true, _id: { $ne: existing._id } }, { $set: { pinned: false } });
  }

  existing.title = safeTitle;
  existing.detail = safeDetail;
  existing.startsAt = parsedStartsAt;
  existing.endsAt = parsedEndsAt;
  existing.pinned = Boolean(pinned);
  existing.active = Boolean(active);
  existing.bannerType = bannerType;
  existing.bannerHtml = safeHtml;
  existing.imageUrl = safeImage;
  await existing.save();
  broadcastBannerUpdate();
  const mapped = mapBannerToClient(existing.toObject(), new Date());

  res.json({
    banner: mapped
  });
}

export async function setEventBannerActive(req, res) {
  const { bannerId } = req.params;
  if (!mongoose.isValidObjectId(bannerId)) {
    throw badRequest("Invalid bannerId");
  }
  const { active } = req.body || {};
  const row = await NewsItemModel.findById(bannerId);
  if (!row || row.kind !== "event") {
    return res.status(404).json({ error: "Event banner not found" });
  }
  row.active = Boolean(active);
  if (!row.active) {
    row.pinned = false;
  }
  await row.save();
  broadcastBannerUpdate();
  res.json({ ok: true, id: String(row._id), active: row.active });
}

export async function removeEventBanner(req, res) {
  const { bannerId } = req.params;
  if (!mongoose.isValidObjectId(bannerId)) {
    throw badRequest("Invalid bannerId");
  }
  const row = await NewsItemModel.findById(bannerId);
  if (!row || row.kind !== "event") {
    return res.status(404).json({ error: "Event banner not found" });
  }
  await NewsItemModel.deleteOne({ _id: row._id });
  broadcastBannerUpdate();
  res.json({ ok: true, id: String(row._id) });
}

export async function createQuizQuestion(req, res) {
  const { testId } = req.params;
  const { question, options, correctIndex, explanation = "" } = req.body || {};
  if (!mongoose.isValidObjectId(testId)) {
    throw badRequest("Invalid testId");
  }
  if (!question || !Array.isArray(options) || options.length < 2) {
    throw badRequest("question and options (min 2) are required");
  }

  const test = await TypingTestModel.findById(testId);
  if (!test || test.type !== "quiz") {
    throw badRequest("Quiz test not found");
  }

  if (Number(correctIndex) < 0 || Number(correctIndex) >= options.length) {
    throw badRequest("correctIndex is out of range");
  }

  const row = await QuizQuestionModel.create({
    typingTest: test._id,
    question: String(question).trim(),
    options,
    correctIndex,
    explanation: String(explanation).trim()
  });

  res.status(201).json({
    question: {
      id: String(row._id),
      testId: String(row.typingTest),
      question: row.question,
      options: row.options,
      correctIndex: row.correctIndex,
      explanation: row.explanation
    }
  });
}
