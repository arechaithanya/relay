require("dotenv").config({ path: "../../.env" });

const cors = require("cors");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { connectDatabase } = require("../../common/database");
const { frontendOrigin } = require("../../common/config");
const { createConsumer, parseMessage } = require("../../common/kafka");
const { staff } = require("../../common/staff");
const topics = require("../../common/topics");

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
const recentEvents = [];

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

async function startConsumer(topic, groupId, eventName) {
  const consumer = await createConsumer(`notification-${topic}`, groupId);
  await consumer.subscribe({ topic, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      const payload = parseMessage(message);
      console.log(`[notify:${topic}]`, payload.kind || payload.type, payload.incidentId || payload.id);
      await broadcast(eventName, payload);
    }
  });
}

async function start() {
  db = await connectDatabase();
  await Promise.all([
    startConsumer(topics.ALERTS, "notification-alerts-group", "alert"),
    startConsumer(topics.ASSIGNMENTS, "notification-assignments-group", "assignment")
  ]);

  server.listen(port, () => {
    console.log(`Notification service listening on ${port}`);
  });
}

start().catch((error) => {
  console.error("Notification service failed", error);
  process.exit(1);
});
