import http from "http";
import { Server as SocketServer } from "socket.io";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/db.js";
import { bootstrapSystemData } from "./services/seed.js";
import { setupGameSocket } from "./services/socket.js";

const app = createApp();
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: {
    origin: env.CLIENT_ORIGIN,
    methods: ["GET", "POST"]
  }
});

setupGameSocket(io);

async function start() {
  await connectDatabase();
  await bootstrapSystemData();
  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://localhost:${env.PORT}`);
  });
}

async function gracefulShutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}. Closing server...`);
  server.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  gracefulShutdown("SIGINT");
});
process.on("SIGTERM", () => {
  gracefulShutdown("SIGTERM");
});

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server", error);
  process.exit(1);
});
