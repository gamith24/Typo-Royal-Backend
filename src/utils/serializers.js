export function buildAvatarUrl(userDocLike = {}) {
  const raw = String(userDocLike.avatarUrl || "").trim();
  if (raw) return raw;
  const seedSource = String(userDocLike.displayName || userDocLike.username || userDocLike._id || "player");
  const seed = encodeURIComponent(seedSource.toLowerCase());
  return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${seed}`;
}

export function serializeUser(userDoc) {
  return {
    id: String(userDoc._id),
    username: userDoc.displayName || userDoc.username,
    avatarUrl: buildAvatarUrl(userDoc),
    role: userDoc.role,
    createdAt: userDoc.createdAt
  };
}

export function toClientMode(modeDoc) {
  return {
    id: String(modeDoc._id),
    name: modeDoc.name,
    key: modeDoc.key,
    type: modeDoc.type,
    requiredPlayers: modeDoc.requiredPlayers,
    teamSize: modeDoc.teamSize,
    teamCount: modeDoc.teamCount,
    minPlayers: modeDoc.minPlayers,
    maxPlayers: modeDoc.maxPlayers
  };
}

export function toClientLobby(lobbyDoc, chatItems = []) {
  return {
    id: String(lobbyDoc._id),
    modeId: String(lobbyDoc.mode),
    modeType: lobbyDoc.modeType,
    configKey: lobbyDoc.configKey,
    teamCount: lobbyDoc.teamCount,
    selectedDifficulty: lobbyDoc.selectedDifficulty || "medium",
    leaderId: String(lobbyDoc.leader),
    requiredPlayers: lobbyDoc.requiredPlayers,
    teamSize: lobbyDoc.teamSize,
    status: lobbyDoc.status,
    players: lobbyDoc.players.map((player) => ({
      userId: String(player.user),
      username: player.username,
      ready: player.ready
    })),
    invites: lobbyDoc.invites.map((id) => String(id)),
    chat: chatItems.map((item) => ({
      id: String(item._id),
      userId: String(item.user),
      username: item.username,
      message: item.message,
      ts: item.createdAt
    })),
    createdAt: lobbyDoc.createdAt
  };
}

export function toClientMatch(matchDoc, viewerUserId) {
  const teams = matchDoc.teams.map((team) => ({
    id: team.teamId,
    index: team.index,
    members: team.members.map((member) => ({
      id: String(member.user),
      username: member.username
    }))
  }));
  const myTeam = teams.find((team) => team.members.some((member) => member.id === String(viewerUserId)));
  return {
    matchId: String(matchDoc._id),
    modeId: String(matchDoc.mode),
    modeKey: matchDoc.modeKey,
    modeType: matchDoc.modeType,
    configKey: matchDoc.configKey,
    selectedDifficulty: matchDoc.selectedDifficulty || "medium",
    teamId: myTeam?.id || null,
    teams,
    game: matchDoc.game || {},
    startedAt: matchDoc.startedAt,
    requiredPlayers: matchDoc.requiredPlayers
  };
}
