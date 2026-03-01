import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.js";
import gameRoutes from "./routes/game.js";
import profileRoutes from "./routes/profile.js";
import adminRoutes from "./routes/admin.js";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();
  const allowedOrigins = new Set(env.CLIENT_ORIGINS);

  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        // Allow non-browser tools (curl/postman/server-to-server) with no Origin header.
        if (!origin) {
          callback(null, true);
          return;
        }

        const isAllowed = allowedOrigins.has(origin);
        const isLocalDev = /^http:\/\/localhost:\d+$/.test(origin);
        if (isAllowed || isLocalDev) {
          callback(null, true);
          return;
        }

        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.get("/health", (_, res) => {
    res.json({ ok: true, service: "typo-err-game-server", db: "mongodb" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/game", gameRoutes);
  app.use("/api/profile", profileRoutes);
  app.use("/api/admin", adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
