import {
  ChatMessageModel,
  FriendModel,
  NotificationModel,
  ProfileModel,
  RankingModel,
  UserAchievementModel,
  UserModel
} from "../models/index.js";
import { buildAvatarUrl, serializeUser } from "../utils/serializers.js";
import { isUserOnline } from "./presence.js";

export async function buildRankBuckets(userId) {
  const rankings = await RankingModel.find({ user: userId }).lean();
  return rankings.reduce(
    (acc, item) => {
      acc[item.bucket] = item.points;
      return acc;
    },
    { test: 500, quest: 500, trial: 500 }
  );
}

export async function buildAchievements(userId) {
  const records = await UserAchievementModel.find({ user: userId })
    .populate("achievement")
    .lean();
  return records.map((record) => ({
    id: String(record.achievement?._id || record._id),
    title: record.achievement?.title || "Unknown Achievement",
    progress: record.progress,
    rarity: record.achievement?.rarity || "common"
  }));
}

export async function buildPublicUserPayload(userDoc) {
  const [profile, rankBuckets, achievements, friends] = await Promise.all([
    ProfileModel.findOne({ user: userDoc._id }).lean(),
    buildRankBuckets(userDoc._id),
    buildAchievements(userDoc._id),
    FriendModel.find({ user: userDoc._id, status: "accepted" }).select("friend -_id").lean()
  ]);

  return {
    ...serializeUser(userDoc),
    friends: friends.map((row) => String(row.friend)),
    achievements,
    rankBuckets,
    stats: {
      ...(profile?.stats || {
        wpm: 0,
        accuracy: 0,
        iqScore: 0,
        matches: 0,
        wins: 0,
        losses: 0
      }),
      trends: profile?.trends || { wpm: [], accuracy: [], iq: [] }
    },
    trends: profile?.trends || { wpm: [], accuracy: [], iq: [] }
  };
}

export async function leaderboardByBucket(bucket, limit = 20) {
  const rows = await RankingModel.aggregate([
    { $match: { bucket } },
    { $sort: { points: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: "$user" },
    {
      $lookup: {
        from: "profiles",
        localField: "user._id",
        foreignField: "user",
        as: "profile"
      }
    },
    { $unwind: { path: "$profile", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        id: { $toString: "$user._id" },
        username: "$user.displayName",
        points: "$points",
        wpm: "$profile.stats.wpm",
        accuracy: "$profile.stats.accuracy",
        wins: "$profile.stats.wins"
      }
    }
  ]);

  return rows.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}

export async function listFriends(userId) {
  const friendLinks = await FriendModel.find({ user: userId, status: "accepted" }).lean();
  const friendIds = friendLinks.map((item) => item.friend);
  if (!friendIds.length) return [];

  const [users, profiles, rankingRows] = await Promise.all([
    UserModel.find({ _id: { $in: friendIds } }).lean(),
    ProfileModel.find({ user: { $in: friendIds } }).lean(),
    RankingModel.find({ user: { $in: friendIds } }).lean()
  ]);

  const profileMap = new Map(profiles.map((p) => [String(p.user), p]));
  const rankingMap = new Map();
  for (const row of rankingRows) {
    const key = String(row.user);
    const existing = rankingMap.get(key) || { test: 500, quest: 500, trial: 500 };
    existing[row.bucket] = row.points;
    rankingMap.set(key, existing);
  }

  return users.map((user) => ({
    id: String(user._id),
    username: user.displayName,
    avatarUrl: buildAvatarUrl(user),
    role: user.role,
    online: isUserOnline(user._id),
    stats: profileMap.get(String(user._id))?.stats || {},
    rankBuckets: rankingMap.get(String(user._id)) || { test: 500, quest: 500, trial: 500 }
  }));
}

export async function pushNotification(userId, type, message) {
  return NotificationModel.create({
    user: userId,
    type,
    message
  });
}

export async function getNotifications(userId, limit = 20) {
  return NotificationModel.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

export async function getLobbyChat(lobbyId, limit = 40) {
  return ChatMessageModel.find({
    scope: "lobby",
    lobby: lobbyId
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}
