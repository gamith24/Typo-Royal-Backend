import bcrypt from "bcryptjs";
import { UserModel } from "../models/index.js";
import { signAuthToken } from "../utils/jwt.js";
import { buildPublicUserPayload } from "../services/gameData.js";
import { initializeUserProgress } from "../services/userProvisioning.js";
import { badRequest } from "../utils/httpError.js";

export async function register(req, res) {
  const { username, password } = req.body || {};
  const rawName = String(username || "").trim();
  const normalized = rawName.toLowerCase();
  if (!normalized || !password || password.length < 6) {
    throw badRequest("Username and password (min 6 chars) are required");
  }

  const existing = await UserModel.findOne({ username: normalized }).lean();
  if (existing) {
    throw badRequest("Username already exists");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await UserModel.create({
    username: normalized,
    displayName: rawName,
    passwordHash
  });
  await initializeUserProgress(user._id);

  const token = signAuthToken({
    userId: String(user._id),
    username: user.displayName,
    role: user.role
  });
  const payload = await buildPublicUserPayload(user);
  res.status(201).json({ token, user: payload });
}

export async function login(req, res) {
  const { username, password } = req.body || {};
  const normalized = String(username || "").trim().toLowerCase();
  if (!normalized || !password) {
    throw badRequest("Username and password are required");
  }

  const user = await UserModel.findOne({ username: normalized }).select("+passwordHash");
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  user.lastSeenAt = new Date();
  await user.save();

  const token = signAuthToken({
    userId: String(user._id),
    username: user.displayName,
    role: user.role
  });
  const payload = await buildPublicUserPayload(user);
  res.json({ token, user: payload });
}

export async function me(req, res) {
  const payload = await buildPublicUserPayload(req.user);
  res.json({ user: payload });
}
