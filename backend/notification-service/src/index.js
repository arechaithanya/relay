require("dotenv").config({ path: "../../.env" });

const cors = require("cors");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { connectDatabase, closeDatabase } = require("../../common/database");
const { frontendOrigin } = require("../../common/config");
const { createConsumer, parseMessage } = require("../../common/kafka");
const logger = require("../../common/logger");
const { staff } = require("../../common/staff");
const topics = require("../../common/topics");

process.env.SERVICE_NAME = "notification-service";

const port = Number(process.env.NOTIFICATION_PORT || 4004);
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: frontendOrigin,
    methods: ["GET", "POST"]
  }
});

let db;
let startedAt;
const recentEvents = [];
const consumers = [];

app.use(cors({ origin: frontendOrigin }));

async function snapshot() {
  const [incidents, assignments, timeline] = await Promise.all([
    db.collection("incidents").find({}).sort({ severity: -1, createdAt: -1 }).limit(100).toArray(),
    db.collection("assignments").find({}).sort({ assignedAt: -1 }).limit(50).toArray(),
    db.collection("timeline").find({}).sort({ timestamp: -1 }).limit(100).toArray()
  ]);
  return { incidents, assignments, timeline, staff, events: recentEvents.slice(-50) };
}

async function broadcast(kind, payload) {
  recentEvents.push({ kind, payload, timestamp: Date.now() });
  if (recentEvents.length > 100) recentEvents.shift();
  io.emit(kind, payload);
  io.emit("snapshot", await snapshot());
}

io.on("connection", async (socket) => {
  socket.emit("snapshot", await snapshot());
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "notification-service",
    uptime: process.uptime(),
    startedAt,
    connectedClients: io.engine.clientsCount
  });
});

async function startConsumer(topic, groupId, eventName) {
  const consumer = await createConsumer(`notification-${topic}`, groupId);
  await consumer.subscribe({ topic, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      const payload = parseMessage(message);
      logger.info({ msg: `Notify ${topic}`, kind: payload.kind || payload.type, incidentId: payload.incidentId || payload.id });
      await broadcast(eventName, payload);
    }
  });
  consumers.push(consumer);
}

async function start() {
  db = await connectDatabase();
  await Promise.all([
    startConsumer(topics.ALERTS, "notification-alerts-group", "alert"),
    startConsumer(topics.ASSIGNMENTS, "notification-assignments-group", "assignment")
  ]);

  startedAt = Date.now();
  server.listen(port, () => {
    logger.info({ msg: `Notification service listening on ${port}` });
  });

  async function shutdown(signal) {
    logger.info({ msg: `Received ${signal}, shutting down gracefully` });
    server.close(async () => {
    await Promise.all(consumers.map((c) => c.disconnect().catch(() => {})));
      await closeDatabase().catch(() => {});
      logger.info({ msg: "Notification service shutdown complete" });
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((error) => {
  logger.error({ msg: "Notification service failed", error: error.message });
  process.exit(1);
});
