import mongoose from "mongoose";
import {
  ChatMessageModel,
  ConversationModel,
  FriendModel,
  FriendRequestModel,
  MatchModel,
  ModeModel,
  NewsItemModel,
  NotificationModel,
  UserModel
} from "../models/index.js";
import {
  buildPublicUserPayload,
  leaderboardByBucket,
  listFriends,
  pushNotification
} from "../services/gameData.js";
import { buildAvatarUrl, toClientMatch, toClientMode } from "../utils/serializers.js";
import { mapBannerToClient } from "../utils/banner.js";
import { badRequest } from "../utils/httpError.js";
import { MATCH_CONFIGS, PRIMARY_MODE_KEYS } from "../constants/gameModes.js";
import { emitToUser } from "../services/realtime.js";
import { ensureLiveState, getLiveState, toClientLiveState } from "../services/matchLiveState.js";

const validBuckets = ["test", "quest", "trial"];

function isConversationMember(conversation, userId) {
  return conversation.members.some((memberId) => String(memberId) === String(userId));
}

function toClientConversation(conversation, members, viewerId) {
  const memberRows = (members || []).map((user) => ({
    id: String(user._id),
    username: user.displayName || user.username,
    avatarUrl: buildAvatarUrl(user),
    role: user.role
  }));
  const otherMembers = memberRows.filter((row) => row.id !== String(viewerId));
  return {
    id: String(conversation._id),
    kind: conversation.kind,
    title: conversation.title || (conversation.kind === "private" ? (otherMembers[0]?.username || "Direct Chat") : "Group Chat"),
    members: memberRows,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt
  };
}

function toClientConversationMessage(row) {
  return {
    id: String(row._id),
    conversationId: String(row.conversation),
    userId: String(row.user),
    username: row.username,
    message: row.message,
    createdAt: row.createdAt
  };
}

export async function home(req, res) {
  const user = req.user;
  const [profile, friends, modes, leaderboard, notifications, bannerItems, pendingRequests] = await Promise.all([
    buildPublicUserPayload(user),
    listFriends(user._id),
    ModeModel.find({ active: true, key: { $in: PRIMARY_MODE_KEYS } }).sort({ createdAt: 1 }).lean(),
    Promise.all(validBuckets.map((bucket) => leaderboardByBucket(bucket, 8))),
    NotificationModel.find({ user: user._id }).sort({ createdAt: -1 }).limit(8).lean(),
    NewsItemModel.find({ active: { $ne: false } }).sort({ createdAt: -1 }).limit(30).lean(),
    FriendRequestModel.find({ toUser: user._id, status: "pending" })
      .populate("fromUser", "displayName username avatarUrl")
      .sort({ createdAt: -1 })
      .limit(12)
      .lean()
  ]);
  const now = new Date();
  const activeBanners = bannerItems
    .map((row) => mapBannerToClient(row, now))
    .filter((row) => row.status === "active");
  const pinnedEvent = activeBanners.find((row) => row.kind === "event" && row.pinned) || null;
  const newsItems = activeBanners.filter((row) => row.kind === "news");

  res.json({
    profile,
    achievements: profile.achievements,
    leaderboard: {
      test: leaderboard[0],
      quest: leaderboard[1],
      trial: leaderboard[2]
    },
    friends,
    modes: modes.map(toClientMode),
    matchConfigs: MATCH_CONFIGS,
    news: newsItems,
    pinnedEvent: pinnedEvent
      ? {
        id: String(pinnedEvent.id),
        title: pinnedEvent.title,
        startsAt: pinnedEvent.startsAt,
        detail: pinnedEvent.detail,
        bannerType: pinnedEvent.bannerType || "text",
        bannerHtml: pinnedEvent.bannerHtml || "",
        imageUrl: pinnedEvent.imageUrl || ""
      }
      : null,
    notifications: notifications.map((item) => ({
      id: String(item._id),
      type: item.type,
      message: item.message,
      createdAt: item.createdAt
    })),
    pendingFriendRequests: pendingRequests.map((request) => ({
      id: String(request._id),
      fromUser: {
        id: String(request.fromUser?._id),
        username: request.fromUser?.displayName || request.fromUser?.username || "Unknown",
        avatarUrl: buildAvatarUrl(request.fromUser || {})
      },
      createdAt: request.createdAt
    }))
  });
}

export async function modes(req, res) {
  const modes = await ModeModel.find({ active: true, key: { $in: PRIMARY_MODE_KEYS } }).sort({ createdAt: 1 }).lean();
  res.json({ modes: modes.map(toClientMode), matchConfigs: MATCH_CONFIGS });
}

export async function leaderboard(req, res) {
  const bucket = req.params.bucket || "quest";
  if (!validBuckets.includes(bucket)) {
    throw badRequest("Invalid bucket");
  }
  const entries = await leaderboardByBucket(bucket, 20);
  res.json({ bucket, entries });
}

export async function friends(req, res) {
  const items = await listFriends(req.user._id);
  res.json({ friends: items });
}

export async function addFriend(req, res) {
  const { friendId } = req.params;
  const user = req.user;
  if (!mongoose.isValidObjectId(friendId)) {
    throw badRequest("Invalid friend id");
  }
  if (String(user._id) === String(friendId)) {
    throw badRequest("Cannot add yourself");
  }

  const friend = await UserModel.findById(friendId);
  if (!friend) {
    return res.status(404).json({ error: "User not found" });
  }

  await FriendModel.bulkWrite([
    {
      updateOne: {
        filter: { user: user._id, friend: friend._id },
        update: { $set: { status: "accepted" } },
        upsert: true
      }
    },
    {
      updateOne: {
        filter: { user: friend._id, friend: user._id },
        update: { $set: { status: "accepted" } },
        upsert: true
      }
    }
  ]);

  await pushNotification(friend._id, "friend", `${user.displayName} added you as a friend.`);
  res.json({ ok: true });
}

export async function searchPlayers(req, res) {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) {
    return res.json({ players: [] });
  }

  const users = await UserModel.find({
    _id: { $ne: req.user._id },
    $or: [
      { displayName: { $regex: q, $options: "i" } },
      { username: { $regex: q, $options: "i" } }
    ]
  })
    .limit(12)
    .select("_id displayName username role avatarUrl")
    .lean();

  res.json({
    players: users.map((row) => ({
      id: String(row._id),
      username: row.displayName || row.username,
      avatarUrl: buildAvatarUrl(row),
      role: row.role
    }))
  });
}

export async function sendFriendRequest(req, res) {
  const targetId = req.params.userId;
  if (!mongoose.isValidObjectId(targetId)) {
    throw badRequest("Invalid user id");
  }
  if (String(req.user._id) === String(targetId)) {
    throw badRequest("Cannot send a friend request to yourself");
  }

  const target = await UserModel.findById(targetId);
  if (!target) {
    return res.status(404).json({ error: "User not found" });
  }

  const existingFriend = await FriendModel.findOne({
    user: req.user._id,
    friend: target._id,
    status: "accepted"
  }).lean();
  if (existingFriend) {
    throw badRequest("You are already friends with this player");
  }

  const duplicatePending = await FriendRequestModel.findOne({
    fromUser: req.user._id,
    toUser: target._id,
    status: "pending"
  }).lean();
  if (duplicatePending) {
    throw badRequest("Friend request already sent");
  }

  const reversePending = await FriendRequestModel.findOne({
    fromUser: target._id,
    toUser: req.user._id,
    status: "pending"
  });
  if (reversePending) {
    reversePending.status = "accepted";
    await reversePending.save();
    await FriendModel.bulkWrite([
      {
        updateOne: {
          filter: { user: req.user._id, friend: target._id },
          update: { $set: { status: "accepted" } },
          upsert: true
        }
      },
      {
        updateOne: {
          filter: { user: target._id, friend: req.user._id },
          update: { $set: { status: "accepted" } },
          upsert: true
        }
      }
    ]);
    emitToUser(String(target._id), "friend:request:accepted", {
      user: { id: String(req.user._id), username: req.user.displayName, avatarUrl: buildAvatarUrl(req.user) }
    });
    return res.json({ ok: true, autoAccepted: true });
  }

  const request = await FriendRequestModel.create({
    fromUser: req.user._id,
    toUser: target._id,
    status: "pending"
  });

  emitToUser(String(target._id), "friend:request", {
    requestId: String(request._id),
    fromUser: { id: String(req.user._id), username: req.user.displayName, avatarUrl: buildAvatarUrl(req.user) }
  });

  res.status(201).json({ ok: true, requestId: String(request._id) });
}

export async function listFriendRequests(req, res) {
  const [incoming, outgoing] = await Promise.all([
    FriendRequestModel.find({ toUser: req.user._id, status: "pending" })
      .populate("fromUser", "displayName username avatarUrl")
      .sort({ createdAt: -1 })
      .lean(),
    FriendRequestModel.find({ fromUser: req.user._id, status: "pending" })
      .populate("toUser", "displayName username avatarUrl")
      .sort({ createdAt: -1 })
      .lean()
  ]);

  res.json({
    incoming: incoming.map((request) => ({
      id: String(request._id),
      user: {
        id: String(request.fromUser?._id),
        username: request.fromUser?.displayName || request.fromUser?.username || "Unknown",
        avatarUrl: buildAvatarUrl(request.fromUser || {})
      },
      createdAt: request.createdAt
    })),
    outgoing: outgoing.map((request) => ({
      id: String(request._id),
      user: {
        id: String(request.toUser?._id),
        username: request.toUser?.displayName || request.toUser?.username || "Unknown",
        avatarUrl: buildAvatarUrl(request.toUser || {})
      },
      createdAt: request.createdAt
    }))
  });
}

export async function respondFriendRequest(req, res) {
  const requestId = req.params.requestId;
  const action = req.params.action;
  if (!mongoose.isValidObjectId(requestId)) {
    throw badRequest("Invalid request id");
  }
  if (!["accept", "decline"].includes(action)) {
    throw badRequest("Invalid friend request action");
  }

  const request = await FriendRequestModel.findOne({
    _id: requestId,
    toUser: req.user._id,
    status: "pending"
  });

  if (!request) {
    return res.status(404).json({ error: "Friend request not found" });
  }

  const requester = await UserModel.findById(request.fromUser).lean();
  if (!requester) {
    return res.status(404).json({ error: "Requester no longer exists" });
  }

  if (action === "accept") {
    request.status = "accepted";
    await request.save();

    await FriendModel.bulkWrite([
      {
        updateOne: {
          filter: { user: req.user._id, friend: request.fromUser },
          update: { $set: { status: "accepted" } },
          upsert: true
        }
      },
      {
        updateOne: {
          filter: { user: request.fromUser, friend: req.user._id },
          update: { $set: { status: "accepted" } },
          upsert: true
        }
      }
    ]);

    emitToUser(String(request.fromUser), "friend:request:accepted", {
      user: { id: String(req.user._id), username: req.user.displayName, avatarUrl: buildAvatarUrl(req.user) }
    });
    return res.json({ ok: true, status: "accepted" });
  }

  request.status = "declined";
  await request.save();
  emitToUser(String(request.fromUser), "friend:request:declined", {
    user: { id: String(req.user._id), username: req.user.displayName, avatarUrl: buildAvatarUrl(req.user) }
  });
  res.json({ ok: true, status: "declined" });
}

export async function getMatchSession(req, res) {
  const match = await MatchModel.findById(req.params.matchId).lean();
  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }

  const userId = String(req.user._id);
  const isParticipant = match.teams.some((team) =>
    team.members.some((member) => String(member.user) === userId)
  );
  if (!isParticipant) {
    return res.status(403).json({ error: "You are not part of this match" });
  }

  const hydrated = {
    ...match,
    _id: match._id,
    teams: match.teams.map((team) => ({
      ...team,
      members: team.members.map((member) => ({
        ...member,
        user: member.user
      }))
    }))
  };
  const live = getLiveState(match._id) || ensureLiveState(hydrated);

  res.json({
    match: toClientMatch(hydrated, req.user._id),
    live: toClientLiveState(live)
  });
}

export async function publicProfile(req, res) {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) {
    throw badRequest("Invalid user id");
  }
  const user = await UserModel.findById(userId);
  if (!user) {
    return res.status(404).json({ error: "Player not found" });
  }
  const profile = await buildPublicUserPayload(user);
  res.json({ profile });
}

export async function listConversations(req, res) {
  const userId = req.user._id;
  const conversations = await ConversationModel.find({ members: userId })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(60)
    .lean();

  if (!conversations.length) {
    res.json({ conversations: [] });
    return;
  }

  const memberIds = [...new Set(conversations.flatMap((row) => row.members.map((id) => String(id))))];
  const users = await UserModel.find({ _id: { $in: memberIds } })
    .select("_id displayName username avatarUrl role")
    .lean();
  const userMap = new Map(users.map((row) => [String(row._id), row]));

  const mapped = conversations.map((conversation) => {
    const members = conversation.members
      .map((id) => userMap.get(String(id)))
      .filter(Boolean);
    return toClientConversation(conversation, members, userId);
  });
  res.json({ conversations: mapped });
}

export async function createPrivateConversation(req, res) {
  const targetId = req.params.userId;
  if (!mongoose.isValidObjectId(targetId)) {
    throw badRequest("Invalid user id");
  }
  if (String(targetId) === String(req.user._id)) {
    throw badRequest("Cannot create a private chat with yourself");
  }

  const target = await UserModel.findById(targetId).lean();
  if (!target) {
    return res.status(404).json({ error: "Player not found" });
  }

  const memberIds = [String(req.user._id), String(targetId)].sort();
  let conversation = await ConversationModel.findOne({
    kind: "private",
    members: { $all: memberIds, $size: 2 }
  }).lean();

  if (!conversation) {
    conversation = await ConversationModel.create({
      kind: "private",
      title: "",
      members: memberIds.map((id) => new mongoose.Types.ObjectId(id)),
      createdBy: req.user._id
    });
    conversation = conversation.toObject();
  }

  const users = await UserModel.find({ _id: { $in: conversation.members } })
    .select("_id displayName username avatarUrl role")
    .lean();
  res.status(201).json({ conversation: toClientConversation(conversation, users, req.user._id) });
}

export async function createGroupConversation(req, res) {
  const title = String(req.body?.title || "").trim();
  const inputMembers = Array.isArray(req.body?.members) ? req.body.members : [];
  if (!title) {
    throw badRequest("Group title is required");
  }

  const unique = new Set([String(req.user._id)]);
  for (const id of inputMembers) {
    if (mongoose.isValidObjectId(id)) unique.add(String(id));
  }
  if (unique.size < 3) {
    throw badRequest("Group chat requires at least 3 total members");
  }

  const memberIds = [...unique];
  const memberCount = await UserModel.countDocuments({ _id: { $in: memberIds } });
  if (memberCount !== memberIds.length) {
    throw badRequest("One or more selected members were not found");
  }

  const conversation = await ConversationModel.create({
    kind: "group",
    title,
    members: memberIds.map((id) => new mongoose.Types.ObjectId(id)),
    createdBy: req.user._id
  });

  const users = await UserModel.find({ _id: { $in: conversation.members } })
    .select("_id displayName username avatarUrl role")
    .lean();
  res.status(201).json({ conversation: toClientConversation(conversation.toObject(), users, req.user._id) });
}

export async function conversationMessages(req, res) {
  const { conversationId } = req.params;
  if (!mongoose.isValidObjectId(conversationId)) {
    throw badRequest("Invalid conversation id");
  }
  const conversation = await ConversationModel.findById(conversationId).lean();
  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  if (!isConversationMember(conversation, req.user._id)) {
    return res.status(403).json({ error: "You are not in this conversation" });
  }

  const items = await ChatMessageModel.find({
    scope: "conversation",
    conversation: conversation._id
  })
    .sort({ createdAt: -1 })
    .limit(120)
    .lean();

  res.json({ messages: items.reverse().map(toClientConversationMessage) });
}

export async function notifications(req, res) {
  const items = await NotificationModel.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  res.json({
    items: items.map((item) => ({
      id: String(item._id),
      type: item.type,
      message: item.message,
      createdAt: item.createdAt
    }))
  });
}

export async function news(req, res) {
  const [items, pinned] = await Promise.all([
    NewsItemModel.find({ kind: "news", active: { $ne: false } }).sort({ createdAt: -1 }).limit(40).lean(),
    NewsItemModel.findOne({ kind: "event", pinned: true, active: { $ne: false } }).sort({ startsAt: -1 }).lean()
  ]);
  const now = new Date();
  const mappedItems = items
    .map((item) => mapBannerToClient(item, now))
    .filter((item) => item.status === "active");
  const mappedPinned = pinned ? mapBannerToClient(pinned, now) : null;
  res.json({
    items: mappedItems,
    pinnedEvent: mappedPinned && mappedPinned.status === "active"
      ? {
        id: mappedPinned.id,
        title: mappedPinned.title,
        detail: mappedPinned.detail,
        startsAt: mappedPinned.startsAt,
        bannerType: mappedPinned.bannerType || "text",
        bannerHtml: mappedPinned.bannerHtml || "",
        imageUrl: mappedPinned.imageUrl || ""
      }
      : null
  });
}

export async function banners(req, res) {
  const status = String(req.query.status || "active").toLowerCase();
  const kind = String(req.query.kind || "all").toLowerCase();
  if (!["all", "active", "scheduled", "expired"].includes(status)) {
    throw badRequest("Invalid status filter");
  }
  if (!["all", "event", "news"].includes(kind)) {
    throw badRequest("Invalid kind filter");
  }

  const query = {};
  if (status === "active" || status === "scheduled") {
    query.active = { $ne: false };
  }
  if (kind !== "all") query.kind = kind;
  const rows = await NewsItemModel.find(query).sort({ createdAt: -1 }).limit(120).lean();
  const now = new Date();
  const mapped = rows.map((row) => mapBannerToClient(row, now));
  const filtered = status === "all"
    ? mapped
    : mapped.filter((row) => row.status === status);

  const grouped = {
    event: filtered.filter((row) => row.kind === "event"),
    news: filtered.filter((row) => row.kind === "news")
  };

  res.json({
    status,
    kind,
    total: filtered.length,
    banners: filtered,
    grouped
  });
}
