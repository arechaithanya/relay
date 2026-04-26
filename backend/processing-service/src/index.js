require("dotenv").config({ path: "../../.env" });

const { connectDatabase } = require("../../common/database");
const { createConsumer, createProducer, parseMessage, publishJson } = require("../../common/kafka");
const { classifyIncident, escalationSeverity } = require("../../common/rules");
const topics = require("../../common/topics");

const escalationTimers = new Map();
let db;
let producer;

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

  await db.collection("incidents").updateOne(
    { id: incident.id },
    { $set: incident, $setOnInsert: { firstSeenAt: Date.now() } },
    { upsert: true }
  );
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
  }, 20000);

  escalationTimers.set(incident.id, timer);
}

async function start() {
  db = await connectDatabase();
  producer = await createProducer("processing-service-producer");
  const consumer = await createConsumer("processing-service", "processing-service-group");
  await consumer.subscribe({ topic: topics.EMERGENCY_EVENTS, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      await processEmergencyEvent(parseMessage(message));
    }
  });

  console.log("Processing service consuming emergency-events");
}

start().catch((error) => {
  console.error("Processing service failed", error);
  process.exit(1);
});
