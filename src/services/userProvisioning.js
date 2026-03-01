import {
  AchievementModel,
  ProfileModel,
  RankingModel,
  UserAchievementModel
} from "../models/index.js";

export async function initializeUserProgress(userId) {
  await Promise.all([
    ProfileModel.create({
      user: userId,
      stats: {
        wpm: 0,
        accuracy: 0,
        iqScore: 0,
        matches: 0,
        wins: 0,
        losses: 0
      },
      trends: {
        wpm: [],
        accuracy: [],
        iq: []
      }
    }),
    RankingModel.insertMany([
      { user: userId, bucket: "test", points: 500 },
      { user: userId, bucket: "quest", points: 500 },
      { user: userId, bucket: "trial", points: 500 }
    ])
  ]);

  const achievements = await AchievementModel.find().select("_id").lean();
  if (achievements.length) {
    await UserAchievementModel.insertMany(
      achievements.map((achievement) => ({
        user: userId,
        achievement: achievement._id,
        progress: 0
      }))
    );
  }
}
