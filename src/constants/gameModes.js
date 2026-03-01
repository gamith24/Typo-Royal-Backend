export const PRIMARY_MODE_KEYS = ["typing-test", "quest-test"];

export const MATCH_CONFIGS = [
  { key: "solo", name: "Single Player", requiredPlayers: 1, teamSize: 1, teamCount: 1 },
  { key: "1v1", name: "1v1", requiredPlayers: 2, teamSize: 1, teamCount: 2 },
  { key: "2v2", name: "2v2", requiredPlayers: 4, teamSize: 2, teamCount: 2 },
  { key: "4v4", name: "4v4", requiredPlayers: 8, teamSize: 4, teamCount: 2 },
  { key: "1v1v1v1", name: "1v1v1v1", requiredPlayers: 4, teamSize: 1, teamCount: 4 },
  { key: "2v2v2v2", name: "2v2v2v2", requiredPlayers: 8, teamSize: 2, teamCount: 4 },
  { key: "4v4v4v4", name: "4v4v4v4", requiredPlayers: 16, teamSize: 4, teamCount: 4 }
];

export const MATCH_CONFIG_MAP = Object.fromEntries(
  MATCH_CONFIGS.map((cfg) => [cfg.key, cfg])
);
