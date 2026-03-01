import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const TOKEN_EXPIRY = "8h";

export function signAuthToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyAuthToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}
