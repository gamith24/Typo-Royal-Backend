import { ModeModel } from "../models/index.js";
import { PRIMARY_MODE_KEYS } from "../constants/gameModes.js";

const primaryModes = [
  {
    name: "Typing Test",
    key: "typing-test",
    type: "standard",
    requiredPlayers: 2,
    teamSize: 1,
    teamCount: 2,
    minPlayers: 2,
    maxPlayers: 16
  },
  {
    name: "Quest Test",
    key: "quest-test",
    type: "quest",
    requiredPlayers: 4,
    teamSize: 2,
    teamCount: 2,
    minPlayers: 2,
    maxPlayers: 16
  }
];

export async function bootstrapSystemData() {
  for (const mode of primaryModes) {
    await ModeModel.updateOne(
      { key: mode.key },
      { $set: { ...mode, active: true } },
      { upsert: true }
    );
  }
  await ModeModel.updateMany(
    { key: { $nin: PRIMARY_MODE_KEYS } },
    { $set: { active: false } }
  );
}

export const seedDatabase = bootstrapSystemData;
