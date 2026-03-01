import { Types } from "mongoose";
import {
  LobbyModel,
  MatchHistoryModel,
  MatchModel,
  ModeModel,
  NotificationModel,
  ProfileModel,
  QuizQuestionModel,
  RankingModel,
  TypingTestModel
} from "../models/index.js";
import { getLobbyChat } from "./gameData.js";
import { toClientLobby, toClientMatch } from "../utils/serializers.js";
import { ensureLiveState } from "./matchLiveState.js";

function findExactCombination(entries, target, start = 0, memo = new Map()) {
  if (target === 0) return [];
  if (target < 0 || start >= entries.length) return null;

  const memoKey = `${start}:${target}`;
  if (memo.has(memoKey)) return memo.get(memoKey);

  for (let i = start; i < entries.length; i += 1) {
    const entry = entries[i];
    const remainder = findExactCombination(entries, target - entry.size, i + 1, memo);
    if (remainder !== null) {
      const result = [entry.lobbyId, ...remainder];
      memo.set(memoKey, result);
      return result;
    }
  }

  memo.set(memoKey, null);
  return null;
}

export function assignTeams(players, teamCount, teamSize) {
  const teams = Array.from({ length: teamCount }, (_, idx) => ({
    teamId: `team-${idx + 1}`,
    index: idx,
    members: []
  }));

  if (teamCount === 1 && teamSize === 1 && players.length) {
    teams[0].members.push(players[0]);
    return teams;
  }

  const parties = new Map();
  for (const player of players) {
    const partyId = player.partyId || `solo:${player.user}`;
    const party = parties.get(partyId) || [];
    party.push(player);
    parties.set(partyId, party);
  }

  const sortedParties = [...parties.values()].sort((a, b) => b.length - a.length);

  for (const party of sortedParties) {
    let placedAsGroup = false;
    if (party.length <= teamSize) {
      for (const team of teams) {
        if (team.members.length + party.length <= teamSize) {
          team.members.push(...party);
          placedAsGroup = true;
          break;
        }
      }
    }

    if (placedAsGroup) continue;

    for (const player of party) {
      const target = teams
        .filter((team) => team.members.length < teamSize)
        .sort((a, b) => a.members.length - b.members.length)[0];
      if (!target) break;
      target.members.push(player);
    }
  }

  return teams;
}

export function computeQueueKey(lobby) {
  return `${lobby.mode}:${lobby.configKey}:${lobby.selectedDifficulty}:${lobby.requiredPlayers}:${lobby.teamSize}`;
}

export async function sanitizeLobbyForBroadcast(lobbyDoc) {
  const chat = await getLobbyChat(lobbyDoc._id, 40);
  return toClientLobby(lobbyDoc, chat.reverse());
}

async function emitLobby(io, lobbyDoc) {
  io.to(`lobby:${lobbyDoc._id}`).emit("lobby:update", await sanitizeLobbyForBroadcast(lobbyDoc));
}

export async function removeLobbyFromQueue(lobbyId) {
  await LobbyModel.findByIdAndUpdate(lobbyId, { $set: { status: "open", queueKey: "" } });
}

async function emitMatchFound(io, matchDoc) {
  for (const team of matchDoc.teams) {
    for (const member of team.members) {
      io.to(`user:${member.user}`).emit("match:found", toClientMatch(matchDoc, member.user));
    }
  }
}

async function applyWinnerStats(matchDoc) {
  const winner = matchDoc.teams[Math.floor(Math.random() * matchDoc.teams.length)];
  const winnerTeamId = winner.teamId;
  const now = new Date();

  const profileWrites = [];
  const rankingWrites = [];
  const notifications = [];
  const participants = [];

  for (const team of matchDoc.teams) {
    const won = team.teamId === winnerTeamId;
    for (const member of team.members) {
      profileWrites.push({
        updateOne: {
          filter: { user: member.user },
          update: {
            $inc: {
              "stats.matches": 1,
              "stats.wins": won ? 1 : 0,
              "stats.losses": won ? 0 : 1
            }
          }
        }
      });

      rankingWrites.push(
        {
          updateOne: {
            filter: { user: member.user, bucket: "test" },
            update: { $inc: { points: won ? 18 : 6 } },
            upsert: true
          }
        },
        {
          updateOne: {
            filter: { user: member.user, bucket: "quest" },
            update: { $inc: { points: won ? 24 : 8 } },
            upsert: true
          }
        },
        {
          updateOne: {
            filter: { user: member.user, bucket: "trial" },
            update: { $inc: { points: won ? 20 : 7 } },
            upsert: true
          }
        }
      );

      notifications.push({
        user: member.user,
        type: "rank",
        message: won
          ? `Victory in ${matchDoc.modeType === "quest" ? "Quest" : "Ranked"} match. +Rank points.`
          : "Match completed. Keep pushing for rank recovery."
      });

      participants.push({
        user: member.user,
        username: member.username,
        teamId: team.teamId,
        won
      });
    }
  }

  await Promise.all([
    profileWrites.length ? ProfileModel.bulkWrite(profileWrites) : Promise.resolve(),
    rankingWrites.length ? RankingModel.bulkWrite(rankingWrites) : Promise.resolve(),
    notifications.length ? NotificationModel.insertMany(notifications) : Promise.resolve(),
    MatchModel.findByIdAndUpdate(matchDoc._id, {
      $set: {
        status: "completed",
        winnerTeamId,
        endedAt: now
      }
    }),
    MatchHistoryModel.create({
      match: matchDoc._id,
      mode: matchDoc.mode,
      modeType: matchDoc.modeType,
      participants,
      winnerTeamId,
      startedAt: matchDoc.startedAt,
      endedAt: now
    })
  ]);
}

async function fetchNextTest({ type, preferredDifficulty }) {
  const baseQuery = { type, active: true };
  const withPreferred = await TypingTestModel.findOne({
    ...baseQuery,
    difficulty: preferredDifficulty
  })
    .sort({ lastUsedAt: 1, createdAt: 1 })
    .lean();

  if (withPreferred) return withPreferred;

  return TypingTestModel.findOne(baseQuery)
    .sort({ lastUsedAt: 1, createdAt: 1 })
    .lean();
}

async function assertGamePayloadAvailable(mode, difficulty) {
  if (mode.key === "typing-test") {
    const test = await fetchNextTest({ type: "typing", preferredDifficulty: difficulty });
    if (!test) {
      throw new Error("No active typing test is available for this queue.");
    }
    return;
  }

  const quiz = await fetchNextTest({ type: "quiz", preferredDifficulty: difficulty });
  if (!quiz) {
    throw new Error("No active quest test is available for this queue.");
  }

  const hasQuestions = await QuizQuestionModel.exists({ typingTest: quiz._id });
  if (!hasQuestions) {
    throw new Error("Selected quest test has no questions. Ask admin to add quiz questions.");
  }
}

async function buildGamePayload(mode, difficulty) {
  const durationSec = difficulty === "easy" ? 95 : difficulty === "hard" ? 70 : 82;
  if (mode.key === "typing-test") {
    const test = await fetchNextTest({ type: "typing", preferredDifficulty: difficulty });
    if (!test) {
      throw new Error("No active typing test is available for matchmaking.");
    }
    await TypingTestModel.updateOne({ _id: test._id }, { $set: { lastUsedAt: new Date() } });
    return {
      kind: "typing",
      testId: String(test._id),
      title: test.title,
      difficulty: test.difficulty,
      rules: test.rules || "Type accurately and quickly.",
      content: test.content,
      durationSec: Number(test.timeLimitSec) > 0 ? Number(test.timeLimitSec) : durationSec
    };
  }

  const quiz = await fetchNextTest({ type: "quiz", preferredDifficulty: difficulty });
  if (!quiz) {
    throw new Error("No active quest test is available for matchmaking.");
  }

  const questions = await QuizQuestionModel.find({ typingTest: quiz._id }).sort({ createdAt: 1 }).limit(12).lean();
  if (!questions.length) {
    throw new Error("Selected quest test has no quiz questions.");
  }
  await TypingTestModel.updateOne({ _id: quiz._id }, { $set: { lastUsedAt: new Date() } });

  return {
    kind: "quest",
    testId: String(quiz._id),
    title: quiz.title,
    difficulty: quiz.difficulty,
    rules: quiz.rules || "Answer all quest prompts.",
    content: quiz.content,
    durationSec: Number(quiz.timeLimitSec) > 0 ? Number(quiz.timeLimitSec) : durationSec,
    questions: questions.map((row) => ({
      id: String(row._id),
      question: row.question,
      options: row.options
    }))
  };
}

async function releaseLobbiesOnQueueError(io, lobbies, message) {
  if (!lobbies.length) return;

  const ids = lobbies.map((lobby) => lobby._id);
  await LobbyModel.updateMany(
    { _id: { $in: ids } },
    { $set: { status: "open", queueKey: "" } }
  );

  const refreshedLobbies = await LobbyModel.find({ _id: { $in: ids } });
  for (const lobby of refreshedLobbies) {
    await emitLobby(io, lobby);
    io.to(`lobby:${lobby._id}`).emit("lobby:queueError", { message });
  }
}

export async function queueLobby(io, lobbyDoc) {
  const mode = await ModeModel.findById(lobbyDoc.mode).lean();
  if (!mode) {
    throw new Error("Selected mode is unavailable.");
  }
  await assertGamePayloadAvailable(mode, lobbyDoc.selectedDifficulty);

  const queueKey = computeQueueKey(lobbyDoc);
  const lobby = await LobbyModel.findByIdAndUpdate(
    lobbyDoc._id,
    { $set: { status: "queueing", queueKey } },
    { new: true }
  );
  if (!lobby) return;

  await emitLobby(io, lobby);
  await tryBuildMatch(io, queueKey);
}

export async function tryBuildMatch(io, queueKey) {
  const queueLobbies = await LobbyModel.find({ status: "queueing", queueKey }).sort({ createdAt: 1 });
  if (!queueLobbies.length) return;

  const reference = queueLobbies[0];
  const requiredPlayers = reference.requiredPlayers;
  const directLobby = queueLobbies.find((lobby) => lobby.players.length === requiredPlayers);
  const entries = queueLobbies.map((lobby) => ({ lobbyId: String(lobby._id), size: lobby.players.length }));
  const selectedIds = directLobby
    ? [String(directLobby._id)]
    : findExactCombination(entries, requiredPlayers);
  if (!selectedIds) return;

  const selectedObjectIds = selectedIds.map((id) => new Types.ObjectId(id));
  const selectedLobbies = queueLobbies.filter((lobby) => selectedIds.includes(String(lobby._id)));
  const players = selectedLobbies.flatMap((lobby) =>
    lobby.players.map((slot) => ({
      user: slot.user,
      username: slot.username,
      partyId: String(lobby._id)
    }))
  );

  const mode = await ModeModel.findById(reference.mode);
  if (!mode) {
    await releaseLobbiesOnQueueError(io, selectedLobbies, "Selected mode is unavailable.");
    return;
  }

  const teamSize = reference.teamSize;
  const teamCount = reference.teamCount;
  const teams = assignTeams(players, teamCount, teamSize);
  let game;
  try {
    game = await buildGamePayload(mode, reference.selectedDifficulty);
  } catch (error) {
    await releaseLobbiesOnQueueError(
      io,
      selectedLobbies,
      error?.message || "Unable to prepare match payload."
    );
    return;
  }

  const match = await MatchModel.create({
    mode: mode._id,
    modeKey: mode.key,
    modeType: mode.type,
    configKey: reference.configKey,
    selectedDifficulty: reference.selectedDifficulty,
    requiredPlayers,
    teamSize,
    teams,
    game
  });
  ensureLiveState(match);

  await LobbyModel.updateMany(
    { _id: { $in: selectedObjectIds } },
    { $set: { status: "in_match", match: match._id } }
  );

  const refreshedLobbies = await LobbyModel.find({ _id: { $in: selectedObjectIds } });
  for (const lobby of refreshedLobbies) {
    await emitLobby(io, lobby);
  }

  await emitMatchFound(io, match);

  await tryBuildMatch(io, queueKey);
}
