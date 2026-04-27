require("dotenv").config({ path: "../../.env" });

const { connectDatabase, closeDatabase } = require("../../common/database");
const { createConsumer, createProducer, parseMessage, publishJson } = require("../../common/kafka");
const { classifyIncident, escalationSeverity } = require("../../common/rules");
const logger = require("../../common/logger");
const topics = require("../../common/topics");

process.env.SERVICE_NAME = "processing-service";

const escalationTimers = new Map();
let db;
let producer;
let consumer;

function alertPayload(incident, kind = "INITIAL_ALERT") {
  return {
    id: `${incident.id}-${kind.toLowerCase()}-${Date.now()}`,
    kind,
    incidentId: incident.id,
    type: incident.type,
    location: incident.location,
    severity: incident.severity,
    priority: incident.priority,
    workflow: incident.workflow,
    summary: incident.summary,
    timestamp: Date.now()
  };
}

async function writeTimeline(incidentId, stage, details) {
  await db.collection("timeline").insertOne({
    incidentId,
    stage,
    details,
    timestamp: Date.now()
  });
}

async function processEmergencyEvent(event) {
  const decision = classifyIncident(event);
  const incident = {
    id: event.id,
    type: decision.type,
    location: event.location,
    severity: decision.severity,
    priority: decision.priority,
    workflow: decision.workflow,
    summary: decision.summary,
    requiredRoles: decision.requiredRoles,
    status: "OPEN",
    createdAt: event.timestamp || Date.now(),
    updatedAt: Date.now(),
    respondedAt: null,
    source: event.source || "UNKNOWN"
  };

  const result = await db.collection("incidents").updateOne(
    { id: incident.id },
    { $set: incident, $setOnInsert: { firstSeenAt: Date.now() } },
    { upsert: true }
  );

  // Idempotency: skip downstream work if this event was already processed
  if (result.upsertedCount === 0 && result.matchedCount > 0) {
    logger.info({ msg: "Duplicate event skipped", incidentId: incident.id });
    return;
  }

  await writeTimeline(incident.id, "CLASSIFIED", {
    severity: incident.severity,
    workflow: incident.workflow
  });

  const alert = alertPayload(incident);
  const assignmentRequest = {
    id: `${incident.id}-assignment-request`,
    kind: "ASSIGNMENT_REQUEST",
    incidentId: incident.id,
    type: incident.type,
    location: incident.location,
    requiredRoles: incident.requiredRoles,
    severity: incident.severity,
    timestamp: Date.now()
  };

  await publishJson(producer, topics.ALERTS, alert, incident.id);
  await publishJson(producer, topics.ASSIGNMENTS, assignmentRequest, incident.id);
  scheduleEscalation(incident);
  logger.info({ msg: "Emergency event processed", incidentId: incident.id, type: incident.type });
}

function scheduleEscalation(incident) {
  if (escalationTimers.has(incident.id)) {
    clearTimeout(escalationTimers.get(incident.id));
  }

  const timer = setTimeout(async () => {
    const current = await db.collection("incidents").findOne({ id: incident.id });
    if (!current || current.status === "ACKNOWLEDGED" || current.status === "RESOLVED") {
      return;
    }

    const severity = escalationSeverity(current.severity);
    const priority = severity >= 4 ? "HIGH" : "MEDIUM";
    await db.collection("incidents").updateOne(
      { id: incident.id },
      {
        $set: {
          severity,
          priority,
          status: "ESCALATED",
          updatedAt: Date.now()
        }
      }
    );
    await writeTimeline(incident.id, "ESCALATED", {
      previousSeverity: current.severity,
      severity
    });

    await publishJson(
      producer,
      topics.ALERTS,
      alertPayload({ ...current, severity, priority }, "ESCALATION_ALERT"),
      incident.id
    );
    logger.warn({ msg: "Incident escalated", incidentId: incident.id, severity });
  }, 20000);

  escalationTimers.set(incident.id, timer);
}

async function start() {
  db = await connectDatabase();
  producer = await createProducer("processing-service-producer");
  consumer = await createConsumer("processing-service", "processing-service-group");
  await consumer.subscribe({ topic: topics.EMERGENCY_EVENTS, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      const raw = parseMessage(message);
      try {
        await processEmergencyEvent(raw);
      } catch (error) {
        logger.error({ msg: "Failed to process event, routing to DLQ", incidentId: raw.id, error: error.message });
        await publishJson(producer, topics.DLQ, {
          originalTopic: topics.EMERGENCY_EVENTS,
          payload: raw,
          error: error.message,
          failedAt: Date.now()
        }, raw.id).catch((dlqErr) => logger.error({ msg: "DLQ publish failed", error: dlqErr.message }));
      }
    }
  });

  logger.info({ msg: "Processing service consuming emergency-events" });

  async function shutdown(signal) {
    logger.info({ msg: `Received ${signal}, shutting down gracefully` });
    for (const timer of escalationTimers.values()) clearTimeout(timer);
    escalationTimers.clear();
    await consumer.disconnect().catch(() => {});
    await producer.disconnect().catch(() => {});
    await closeDatabase().catch(() => {});
    logger.info({ msg: "Processing service shutdown complete" });
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((error) => {
  logger.error({ msg: "Processing service failed", error: error.message });
  process.exit(1);
});
