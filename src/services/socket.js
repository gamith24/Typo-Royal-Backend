import mongoose from "mongoose";
import { LobbyModel, MatchModel, ModeModel, ChatMessageModel, ConversationModel, FriendModel, UserModel } from "../models/index.js";
import { verifyAuthToken } from "../utils/jwt.js";
import { sanitizeText } from "../utils/helpers.js";
import { buildAvatarUrl } from "../utils/serializers.js";
import { setUserOnline, setUserOffline } from "./presence.js";
import { queueLobby, removeLobbyFromQueue, sanitizeLobbyForBroadcast } from "./matchmaking.js";
import { pushNotification } from "./gameData.js";
import { MATCH_CONFIG_MAP } from "../constants/gameModes.js";
import { ensureLiveState, getLiveState, toClientLiveState, updateTypingProgress } from "./matchLiveState.js";
import { setRealtimeIO } from "./realtime.js";

const inviteExpiryTimers = new Map();

function socketAuth(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Unauthorized"));
      const payload = verifyAuthToken(token);
      const user = await UserModel.findById(payload.userId);
      if (!user) return next(new Error("Unauthorized"));
      socket.user = user;
      return next();
    } catch (error) {
      return next(new Error("Unauthorized"));
    }
  });
}

function inviteTimerKey(lobbyId, userId) {
  return `${String(lobbyId)}:${String(userId)}`;
}

function clearInviteTimer(lobbyId, userId) {
  const key = inviteTimerKey(lobbyId, userId);
  const timer = inviteExpiryTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    inviteExpiryTimers.delete(key);
  }
}

async function expireInvite(io, lobbyId, userId, emitExpired = true) {
  const lobby = await LobbyModel.findById(lobbyId);
  if (!lobby) {
    clearInviteTimer(lobbyId, userId);
    return;
  }
  const hadInvite = lobby.invites.some((id) => String(id) === String(userId));
  if (!hadInvite) {
    clearInviteTimer(lobbyId, userId);
    return;
  }

  lobby.invites = lobby.invites.filter((id) => String(id) !== String(userId));
  await lobby.save();
  clearInviteTimer(lobbyId, userId);
  await emitLobby(io, lobby._id);

  if (emitExpired) {
    io.to(`user:${userId}`).emit("lobby:inviteExpired", { lobbyId: String(lobby._id) });
  }
}

function scheduleInviteExpiry(io, lobbyId, userId) {
  clearInviteTimer(lobbyId, userId);
  const timer = setTimeout(() => {
    expireInvite(io, lobbyId, userId, true).catch(() => {});
  }, 30_000);
  inviteExpiryTimers.set(inviteTimerKey(lobbyId, userId), timer);
}

async function emitLobby(io, lobbyId) {
  const lobby = await LobbyModel.findById(lobbyId);
  if (!lobby) return;
  io.to(`lobby:${lobbyId}`).emit("lobby:update", await sanitizeLobbyForBroadcast(lobby));
}

function canJoinMatch(match, userId) {
  return match.teams.some((team) =>
    team.members.some((member) => String(member.user) === String(userId))
  );
}

function canJoinConversation(conversation, userId) {
  return conversation.members.some((memberId) => String(memberId) === String(userId));
}

function canStartQueue(lobby) {
  if (!lobby.players.length) return false;
  return lobby.players.every((slot) => slot.ready);
}

function onSocketAction(callback, action) {
  action().catch((error) => {
    callback({ ok: false, error: error?.message || "Unexpected socket error" });
  });
}

async function emitPresenceToFriends(io, userId, online) {
  const links = await FriendModel.find({
    status: "accepted",
    $or: [{ user: userId }, { friend: userId }]
  }).select("user friend").lean();

  const targets = new Set();
  for (const row of links) {
    const user = String(row.user);
    const friend = String(row.friend);
    if (user === String(userId)) targets.add(friend);
    if (friend === String(userId)) targets.add(user);
  }

  for (const targetId of targets) {
    io.to(`user:${targetId}`).emit("presence:update", { userId: String(userId), online });
  }
}

export function setupGameSocket(io) {
  setRealtimeIO(io);
  socketAuth(io);

  io.on("connection", (socket) => {
    const user = socket.user;
    const userId = String(user._id);
    const turnedOnline = setUserOnline(userId);
    socket.join(`user:${userId}`);
    socket.join("global:lobby");
    socket.emit("socket:ready", { userId, username: user.displayName });
    if (turnedOnline) {
      emitPresenceToFriends(io, user._id, true).catch(() => {});
    }

    socket.on("disconnect", () => {
      const turnedOffline = setUserOffline(userId);
      if (turnedOffline) {
        UserModel.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
        emitPresenceToFriends(io, user._id, false).catch(() => {});
      }
    });

    socket.on("lobby:create", (payload = {}, callback = () => {}) => {
      onSocketAction(callback, async () => {
        const mode = payload.modeKey
          ? await ModeModel.findOne({ key: payload.modeKey, active: true })
          : await ModeModel.findById(payload.modeId);
        if (!mode || !mode.active) {
          callback({ ok: false, error: "Invalid mode" });
          return;
        }

        const config = MATCH_CONFIG_MAP[payload.configKey] || MATCH_CONFIG_MAP["1v1"];
        const selectedDifficulty = ["easy", "medium", "hard"].includes(payload.difficulty)
          ? payload.difficulty
          : "medium";

        const lobby = await LobbyModel.create({
          mode: mode._id,
          modeType: mode.type,
          configKey: config.key,
          teamCount: config.teamCount,
          selectedDifficulty,
          leader: user._id,
          requiredPlayers: config.requiredPlayers,
          teamSize: config.teamSize,
          players: [{ user: user._id, username: user.displayName, ready: true }]
        });

        socket.join(`lobby:${lobby._id}`);
        callback({ ok: true, lobby: await sanitizeLobbyForBroadcast(lobby) });
      });
    });

    socket.on("lobby:join", ({ lobbyId } = {}, callback = () => {}) => {
      onSocketAction(callback, async () => {
        if (!mongoose.isValidObjectId(lobbyId)) {
          callback({ ok: false, error: "Invalid lobby id" });
          return;
        }

        const lobby = await LobbyModel.findById(lobbyId);
        if (!lobby) {
          callback({ ok: false, error: "Lobby not found" });
          return;
        }
        if (lobby.status !== "open") {
          callback({ ok: false, error: "Lobby already queueing or in match" });
          return;
        }

        const isAlreadyMember = lobby.players.some((slot) => String(slot.user) === userId);
        if (isAlreadyMember) {
          socket.join(`lobby:${lobby._id}`);
          callback({ ok: true, lobby: await sanitizeLobbyForBroadcast(lobby) });
          return;
        }
        if (lobby.players.length >= lobby.requiredPlayers) {
          callback({ ok: false, error: "Lobby full" });
          return;
        }

        const hasInviteGate = lobby.invites.length > 0;
        const hasInvite = lobby.invites.some((id) => String(id) === userId);
        if (hasInviteGate && !hasInvite) {
          callback({ ok: false, error: "Invite required for this lobby" });
          return;
        }

        lobby.players.push({ user: user._id, username: user.displayName, ready: false });
        lobby.invites = lobby.invites.filter((id) => String(id) !== userId);
        await lobby.save();
        clearInviteTimer(lobby._id, user._id);

        socket.join(`lobby:${lobby._id}`);
        await emitLobby(io, lobby._id);
        callback({ ok: true, lobby: await sanitizeLobbyForBroadcast(lobby) });
      });
    });

    socket.on("lobby:invite", ({ lobbyId, friendId } = {}, callback = () => {}) => {
      onSocketAction(callback, async () => {
        if (!mongoose.isValidObjectId(lobbyId) || !mongoose.isValidObjectId(friendId)) {
          callback({ ok: false, error: "Invalid ids" });
          return;
        }

        const [lobby, friend] = await Promise.all([
          LobbyModel.findById(lobbyId),
          UserModel.findById(friendId)
        ]);
        if (!lobby) {
          callback({ ok: false, error: "Lobby not found" });
          return;
        }
        if (String(lobby.leader) !== userId) {
          callback({ ok: false, error: "Only lobby leader can invite" });
          return;
        }
        if (lobby.requiredPlayers <= 1 || lobby.configKey === "solo") {
          callback({ ok: false, error: "Invites are disabled in single-player mode" });
          return;
        }
        if (!friend) {
          callback({ ok: false, error: "Friend not found" });
          return;
        }

        if (!lobby.invites.some((id) => String(id) === String(friend._id))) {
          lobby.invites.push(friend._id);
          await lobby.save();
        }
        scheduleInviteExpiry(io, lobby._id, friend._id);

        const mode = await ModeModel.findById(lobby.mode).lean();
        await pushNotification(
          friend._id,
          "invite",
          `${user.displayName} invited you to ${mode?.name || "a lobby"}.`
        );

        io.to(`user:${friend._id}`).emit("lobby:invited", {
          lobbyId: String(lobby._id),
          fromUser: { id: userId, username: user.displayName, avatarUrl: buildAvatarUrl(user) },
          modeId: String(lobby.mode),
          configKey: lobby.configKey,
          expiresAt: Date.now() + 30_000
        });

        await emitLobby(io, lobby._id);
        callback({ ok: true });
      });
    });

    socket.on("lobby:declineInvite", ({ lobbyId } = {}, callback = () => {}) => {
      onSocketAction(callback, async () => {
        if (!mongoose.isValidObjectId(lobbyId)) {
          callback({ ok: false, error: "Invalid lobby id" });
          return;
        }
        await expireInvite(io, lobbyId, user._id, false);
        callback({ ok: true });
      });
    });

    socket.on("lobby:ready", ({ lobbyId, ready } = {}, callback = () => {}) => {
      onSocketAction(callback, async () => {
        const lobby = await LobbyModel.findById(lobbyId);
        if (!lobby) {
          callback({ ok: false, error: "Lobby not found" });
          return;
        }

        const player = lobby.players.find((slot) => String(slot.user) === userId);
        if (!player) {
          callback({ ok: false, error: "You are not in this lobby" });
          return;
        }

        player.ready = Boolean(ready);
        await lobby.save();
        await emitLobby(io, lobby._id);
        callback({ ok: true, lobby: await sanitizeLobbyForBroadcast(lobby) });
      });
    });

    socket.on("lobby:chat", ({ lobbyId, message } = {}, callback = () => {}) => {
      onSocketAction(callback, async () => {
        const lobby = await LobbyModel.findById(lobbyId);
        if (!lobby) {
          callback({ ok: false, error: "Lobby not found" });
          return;
        }
        if (!lobby.players.some((slot) => String(slot.user) === userId)) {
          callback({ ok: false, error: "You are not in this lobby" });
          return;
        }

        const text = sanitizeText(message);
        if (!text) {
          callback({ ok: false, error: "Message is empty" });
          return;
        }

        await ChatMessageModel.create({
          scope: "lobby",
          lobby: lobby._id,
          user: user._id,
          username: user.displayName,
          message: text
        });

        await emitLobby(io, lobby._id);
        callback({ ok: true });
      });
    });

    socket.on("lobby:startMatchmaking", ({ lobbyId } = {}, callback = () => {}) => {
      onSocketAction(callback, async () => {
        const lobby = await LobbyModel.findById(lobbyId);
        if (!lobby) {
          callback({ ok: false, error: "Lobby not found" });
          return;
        }
        if (String(lobby.leader) !== userId) {
          callback({ ok: false, error: "Only leader can start matchmaking" });
          return;
        }
        if (!canStartQueue(lobby)) {
          callback({ ok: false, error: "All players must be ready" });
          return;
        }

        await queueLobby(io, lobby);
        const updated = await LobbyModel.findById(lobby._id);
        callback({ ok: true, lobby: updated ? await sanitizeLobbyForBroadcast(updated) : null });
      });
    });

    socket.on("lobby:leaveQueue", ({ lobbyId } = {}, callback = () => {}) => {
      onSocketAction(callback, async () => {
        const lobby = await LobbyModel.findById(lobbyId);
        if (!lobby) {
          callback({ ok: false, error: "Lobby not found" });
          return;
        }
        if (String(lobby.leader) !== userId) {
          callback({ ok: false, error: "Only leader can stop matchmaking" });
          return;
        }

        if (lobby.status === "queueing") {
          await removeLobbyFromQueue(lobby._id);
          const refreshed = await LobbyModel.findById(lobby._id);
          if (refreshed) {
            await emitLobby(io, refreshed._id);
          }
        }
        callback({ ok: true });
      });
    });

    socket.on("match:teamChat", ({ matchId, message } = {}, callback = () => {}) => {
      onSocketAction(callback, async () => {
        const match = await MatchModel.findById(matchId);
        if (!match) {
          callback({ ok: false, error: "Match not found" });
          return;
        }

        const team = match.teams.find((candidate) =>
          candidate.members.some((member) => String(member.user) === userId)
        );
        if (!team) {
          callback({ ok: false, error: "Not part of this match" });
          return;
        }

        const text = sanitizeText(message);
        if (!text) {
          callback({ ok: false, error: "Message is empty" });
          return;
        }

        const chatItem = await ChatMessageModel.create({
          scope: "team",
          match: match._id,
          teamId: team.teamId,
          user: user._id,
          username: user.displayName,
          message: text
        });

        for (const member of team.members) {
          io.to(`user:${member.user}`).emit("match:teamChat", {
            matchId: String(match._id),
            teamId: team.teamId,
            item: {
              id: String(chatItem._id),
              userId: userId,
              username: user.displayName,
              message: chatItem.message,
              ts: chatItem.createdAt
            }
          });
        }

        callback({ ok: true });
      });
    });

    socket.on("match:join", ({ matchId } = {}, callback = () => {}) => {
      onSocketAction(callback, async () => {
        if (!mongoose.isValidObjectId(matchId)) {
          callback({ ok: false, error: "Invalid match id" });
          return;
        }
        const match = await MatchModel.findById(matchId);
        if (!match) {
          callback({ ok: false, error: "Match not found" });
          return;
        }
        if (!canJoinMatch(match, user._id)) {
          callback({ ok: false, error: "Not part of this match" });
          return;
        }
        socket.join(`match:${matchId}`);
        const state = getLiveState(matchId) || ensureLiveState(match);
        callback({ ok: true, state: toClientLiveState(state) });
      });
    });

    socket.on("match:typingProgress", ({ matchId, progress, wpm, accuracy, remainingLength, finished } = {}, callback = () => {}) => {
      onSocketAction(callback, async () => {
        if (!mongoose.isValidObjectId(matchId)) {
          callback({ ok: false, error: "Invalid match id" });
          return;
        }
        const match = await MatchModel.findById(matchId);
        if (!match) {
          callback({ ok: false, error: "Match not found" });
          return;
        }
        if (!canJoinMatch(match, user._id)) {
          callback({ ok: false, error: "Not part of this match" });
          return;
        }
        const live = getLiveState(matchId) || ensureLiveState(match);
        const updated = updateTypingProgress(matchId, user._id, {
          progress,
          wpm,
          accuracy,
          remainingLength,
          finished
        });
        const snapshot = toClientLiveState(updated || live);
        io.to(`match:${matchId}`).emit("match:progress", snapshot);
        callback({ ok: true, state: snapshot });
      });
    });

    socket.on("conversation:join", ({ conversationId } = {}, callback = () => {}) => {
      onSocketAction(callback, async () => {
        if (!mongoose.isValidObjectId(conversationId)) {
          callback({ ok: false, error: "Invalid conversation id" });
          return;
        }
        const conversation = await ConversationModel.findById(conversationId);
        if (!conversation) {
          callback({ ok: false, error: "Conversation not found" });
          return;
        }
        if (!canJoinConversation(conversation, user._id)) {
          callback({ ok: false, error: "Not part of this conversation" });
          return;
        }
        socket.join(`conversation:${conversationId}`);
        callback({ ok: true });
      });
    });

    socket.on("conversation:message", ({ conversationId, message } = {}, callback = () => {}) => {
      onSocketAction(callback, async () => {
        if (!mongoose.isValidObjectId(conversationId)) {
          callback({ ok: false, error: "Invalid conversation id" });
          return;
        }
        const conversation = await ConversationModel.findById(conversationId);
        if (!conversation) {
          callback({ ok: false, error: "Conversation not found" });
          return;
        }
        if (!canJoinConversation(conversation, user._id)) {
          callback({ ok: false, error: "Not part of this conversation" });
          return;
        }
        const text = sanitizeText(message);
        if (!text) {
          callback({ ok: false, error: "Message is empty" });
          return;
        }

        const row = await ChatMessageModel.create({
          scope: "conversation",
          conversation: conversation._id,
          user: user._id,
          username: user.displayName,
          message: text
        });
        conversation.lastMessageAt = new Date();
        await conversation.save();

        const payload = {
          id: String(row._id),
          conversationId: String(conversation._id),
          userId: String(user._id),
          username: user.displayName,
          avatarUrl: buildAvatarUrl(user),
          message: row.message,
          createdAt: row.createdAt
        };

        io.to(`conversation:${conversationId}`).emit("conversation:message", payload);
        for (const memberId of conversation.members) {
          io.to(`user:${memberId}`).emit("conversation:message:notify", {
            conversationId: String(conversation._id),
            fromUserId: String(user._id),
            message: row.message,
            createdAt: row.createdAt
          });
        }
        callback({ ok: true, item: payload });
      });
    });
  });
}
