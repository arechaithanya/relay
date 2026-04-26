require("dotenv").config({ path: "../../.env" });

const cors = require("cors");
const express = require("express");
const { nanoid } = require("nanoid");
const { connectDatabase } = require("../../common/database");
const { createProducer, publishJson } = require("../../common/kafka");
const { staff } = require("../../common/staff");
const topics = require("../../common/topics");
const { normalizeType } = require("../../common/rules");

const port = Number(process.env.PRODUCER_PORT || 4001);
const app = express();

app.use(cors());
app.use(express.json());

let producer;

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
  app.post(path, async (req, res, next) => {
    try {
      const event = buildEvent(type, req.body);
      await publishJson(producer, topics.EMERGENCY_EVENTS, event, event.id);
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

app.get("/staff", (_req, res) => {
  res.json(staff);
});

app.use((error, _req, res, _next) => {
  const status = /Unsupported emergency type/.test(error.message) ? 400 : 500;
  res.status(status).json({
    error: error.message
  });
});

async function start() {
  producer = await createProducer("producer-service");
  await connectDatabase();

  app.listen(port, () => {
    console.log(`Producer service listening on ${port}`);
  });
}

start().catch((error) => {
  console.error("Producer service failed to start", error);
  process.exit(1);
});
