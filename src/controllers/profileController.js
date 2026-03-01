import { buildPublicUserPayload } from "../services/gameData.js";
import { UserModel } from "../models/index.js";
import { badRequest } from "../utils/httpError.js";

export async function me(req, res) {
  const profile = await buildPublicUserPayload(req.user);
  res.json({ profile });
}

export async function updateAvatar(req, res) {
  const avatarUrl = String(req.body?.avatarUrl || "").trim();
  if (!avatarUrl) {
    throw badRequest("avatarUrl is required");
  }

  const isHttp = /^https?:\/\/[^\s]+$/i.test(avatarUrl);
  const isDataImage = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(avatarUrl);
  if (!isHttp && !isDataImage) {
    throw badRequest("avatarUrl must be a valid http/https URL or data image string");
  }
  if (avatarUrl.length > 4000) {
    throw badRequest("avatarUrl is too long");
  }

  await UserModel.findByIdAndUpdate(req.user._id, { $set: { avatarUrl } });
  const refreshed = await UserModel.findById(req.user._id);
  const profile = await buildPublicUserPayload(refreshed || req.user);
  res.json({ ok: true, profile });
}
