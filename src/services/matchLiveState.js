const matchStateCache = new Map();

function flattenPlayers(matchDoc) {
  return matchDoc.teams.flatMap((team) =>
    team.members.map((member) => ({
      userId: String(member.user),
      username: member.username,
      teamId: team.teamId
    }))
  );
}

function computeDurationSeconds(matchDoc) {
  const byGame = Number(matchDoc.game?.durationSec || 0);
  if (byGame > 0) return byGame;
  if (matchDoc.selectedDifficulty === "easy") return 95;
  if (matchDoc.selectedDifficulty === "hard") return 70;
  return 82;
}

function buildInitialState(matchDoc) {
  const players = flattenPlayers(matchDoc);
  const textLength = (matchDoc.game?.content || "").length;
  const durationSec = computeDurationSeconds(matchDoc);
  const startedAt = new Date(matchDoc.startedAt || Date.now()).getTime();
  const endsAt = startedAt + durationSec * 1000;

  return {
    matchId: String(matchDoc._id),
    kind: matchDoc.game?.kind || "typing",
    durationSec,
    startedAt,
    endsAt,
    textLength,
    players: players.map((player) => ({
      userId: player.userId,
      username: player.username,
      teamId: player.teamId,
      progress: 0,
      wpm: 0,
      accuracy: 100,
      remainingLength: textLength,
      finished: false,
      updatedAt: Date.now()
    }))
  };
}

export function ensureLiveState(matchDoc) {
  const key = String(matchDoc._id);
  if (!matchStateCache.has(key)) {
    matchStateCache.set(key, buildInitialState(matchDoc));
  }
  return matchStateCache.get(key);
}

export function getLiveState(matchId) {
  return matchStateCache.get(String(matchId)) || null;
}

export function updateTypingProgress(matchId, userId, payload) {
  const state = matchStateCache.get(String(matchId));
  if (!state) return null;
  const player = state.players.find((entry) => entry.userId === String(userId));
  if (!player) return state;

  player.progress = Math.max(0, Math.min(100, Number(payload.progress ?? player.progress)));
  player.wpm = Math.max(0, Number(payload.wpm ?? player.wpm));
  player.accuracy = Math.max(0, Math.min(100, Number(payload.accuracy ?? player.accuracy)));
  player.remainingLength = Math.max(0, Number(payload.remainingLength ?? player.remainingLength));
  player.finished = Boolean(payload.finished || player.finished || player.remainingLength <= 0);
  player.updatedAt = Date.now();

  return state;
}

export function toClientLiveState(state) {
  if (!state) return null;
  return {
    matchId: state.matchId,
    kind: state.kind,
    durationSec: state.durationSec,
    startedAt: state.startedAt,
    endsAt: state.endsAt,
    textLength: state.textLength,
    players: state.players
      .map((player) => ({
        userId: player.userId,
        username: player.username,
        teamId: player.teamId,
        progress: player.progress,
        wpm: Math.round(player.wpm),
        accuracy: Number(player.accuracy.toFixed(1)),
        remainingLength: Math.max(0, Math.round(player.remainingLength)),
        finished: player.finished
      }))
      .sort((a, b) => b.progress - a.progress)
  };
}

