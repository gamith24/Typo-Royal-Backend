import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const configDir = dirname(currentFile);
const serverDir = resolve(configDir, "..", "..");
const repoRootDir = resolve(serverDir, "..");

const envCandidates = [
  resolve(repoRootDir, ".env"),
  resolve(serverDir, ".env")
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

function required(name, fallback = "") {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 4000),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  CLIENT_ORIGINS: (process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || "http://localhost:5173,http://localhost:5174")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  JWT_SECRET: required("JWT_SECRET", "dev-super-secret-key-change-me"),
  MONGODB_URI: required("MONGODB_URI")
};
