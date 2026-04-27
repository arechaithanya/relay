require("dotenv").config({ path: "../../.env" });

const cors = require("cors");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { nanoid } = require("nanoid");
const { connectDatabase, closeDatabase } = require("../../common/database");
const { createProducer, publishJson } = require("../../common/kafka");
const logger = require("../../common/logger");
const { staff } = require("../../common/staff");
const topics = require("../../common/topics");
const { normalizeType } = require("../../common/rules");

process.env.SERVICE_NAME = "producer-service";

const port = Number(process.env.PRODUCER_PORT || 4001);
const app = express();

app.use(cors());
app.use(express.json());

const emergencyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many emergency triggers — please wait before retrying" }
});

let producer;
let startedAt;

function buildEvent(type, body = {}) {
  return {
    id: body.id || `inc-${nanoid(10)}`,
    type: normalizeType(type),
    location: body.location || "Lobby",
    timestamp: body.timestamp || Date.now(),
    severity: body.severity === undefined ? undefined : Number(body.severity),
    source: body.source || "MANUAL_TRIGGER"
  };
}

function registerEmergencyRoute(path, type) {
  app.post(path, emergencyLimiter, async (req, res, next) => {
    try {
      const event = buildEvent(type, req.body);
      await publishJson(producer, topics.EMERGENCY_EVENTS, event, event.id);
      logger.info({ msg: "Emergency event published", type, location: event.location, id: event.id });
      res.status(202).json({
        accepted: true,
        topic: topics.EMERGENCY_EVENTS,
        event
      });
    } catch (error) {
      next(error);
    }
  });
}

registerEmergencyRoute("/emergency/fire", "FIRE");
registerEmergencyRoute("/emergency/medical", "MEDICAL");
registerEmergencyRoute("/emergency/security", "SECURITY");

app.get("/incidents", async (_req, res, next) => {
  try {
    const db = await connectDatabase();
    const incidents = await db
      .collection("incidents")
      .find({})
      .sort({ severity: -1, createdAt: -1 })
      .limit(100)
      .toArray();
    res.json(incidents);
  } catch (error) {
    next(error);
  }
});

app.get("/incidents/:id", async (req, res, next) => {
  try {
    const db = await connectDatabase();
    const incident = await db.collection("incidents").findOne({ id: req.params.id });
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    const timeline = await db
      .collection("timeline")
      .find({ incidentId: req.params.id })
      .sort({ timestamp: 1 })
      .toArray();
    res.json({ ...incident, timeline });
  } catch (error) {
    next(error);
  }
});

app.patch("/incidents/:id/acknowledge", async (req, res, next) => {
  try {
    const db = await connectDatabase();
    const result = await db.collection("incidents").findOneAndUpdate(
      { id: req.params.id, status: { $ne: "RESOLVED" } },
          acknowledgedAt: Date.now(),
          updatedAt: Date.now()
        }
      },
      { returnDocument: "after" }
    );
    if (!result) return res.status(404).json({ error: "Incident not found or already resolved" });
    await db.collection("timeline").insertOne({
      incidentId: req.params.id,
      stage: "ACKNOWLEDGED",
      details: { acknowledgedBy: req.body.acknowledgedBy || "operator" },
      timestamp: Date.now()
    });
    logger.info({ msg: "Incident acknowledged", id: req.params.id });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.patch("/incidents/:id/resolve", async (req, res, next) => {
  try {
    const db = await connectDatabase();
    const result = await db.collection("incidents").findOneAndUpdate(
      { id: req.params.id, status: { $ne: "RESOLVED" } },
      {
        $set: {
          status: "RESOLVED",
          resolvedAt: Date.now(),
          updatedAt: Date.now()
        }
      },
      { returnDocument: "after" }
    );
    if (!result) return res.status(404).json({ error: "Incident not found or already resolved" });
    await db.collection("timeline").insertOne({
      incidentId: req.params.id,
      stage: "RESOLVED",
      details: { resolvedBy: req.body.resolvedBy || "operator" },
      timestamp: Date.now()
    });
    logger.info({ msg: "Incident resolved", id: req.params.id });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/staff", (_req, res) => {
  res.json(staff);
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "producer-service",
    uptime: process.uptime(),
    startedAt
  });
});

app.use((error, _req, res, _next) => {
  const status = /Unsupported emergency type/.test(error.message) ? 400 : 500;
  logger.error({ msg: error.message, stack: error.stack });
  res.status(status).json({ error: error.message });
});

async function start() {
  producer = await createProducer("producer-service");
  await connectDatabase();
  startedAt = Date.now();

  const httpServer = app.listen(port, () => {
    logger.info({ msg: `Producer service listening on ${port}` });
  });

  async function shutdown(signal) {
    logger.info({ msg: `Received ${signal}, shutting down gracefully` });
    httpServer.close(async () => {
      await producer.disconnect().catch(() => {});
      await closeDatabase().catch(() => {});
      logger.info({ msg: "Producer service shutdown complete" });
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((error) => {
  logger.error({ msg: "Producer service failed to start", error: error.message });
  process.exit(1);
});
