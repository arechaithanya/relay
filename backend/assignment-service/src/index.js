require("dotenv").config({ path: "../../.env" });

const { connectDatabase, closeDatabase } = require("../../common/database");
const { createConsumer, createProducer, parseMessage, publishJson } = require("../../common/kafka");
const { coordinatesForLocation, distance, staff } = require("../../common/staff");
const logger = require("../../common/logger");
const topics = require("../../common/topics");

process.env.SERVICE_NAME = "assignment-service";

let db;
let producer;
let consumer;
const staffState = new Map(staff.map((member) => [member.id, { ...member }]));

function selectNearestStaff(request) {
  const target = coordinatesForLocation(request.location);
  const requiredRoles = new Set(request.requiredRoles || []);

  return [...staffState.values()]
    .filter((member) => member.status === "AVAILABLE" && requiredRoles.has(member.role))
    .map((member) => ({
      ...member,
      distance: distance(member.coordinates, target)
    }))
    .sort((a, b) => a.distance - b.distance)[0];
}

async function handleAssignmentRequest(request) {
  if (request.kind !== "ASSIGNMENT_REQUEST") return;

  const assignee = selectNearestStaff(request);
  const now = Date.now();
  const assignment = {
    id: `asg-${request.incidentId}-${now}`,
    kind: assignee ? "ASSIGNMENT_CREATED" : "ASSIGNMENT_UNAVAILABLE",
    incidentId: request.incidentId,
    incidentType: request.type,
    location: request.location,
    severity: request.severity,
    assignedAt: now,
    staff: assignee
      ? {
          id: assignee.id,
          name: assignee.name,
          role: assignee.role,
          location: assignee.location,
          distance: assignee.distance
        }
      : null,
    message: assignee
      ? `${assignee.name} assigned as nearest ${assignee.role.toLowerCase().replace("_", " ")}`
      : "No available qualified staff found"
  };

  if (assignee) {
    staffState.set(assignee.id, { ...assignee, status: "ASSIGNED" });
    setTimeout(() => {
      const current = staffState.get(assignee.id);
      if (current) staffState.set(assignee.id, { ...current, status: "AVAILABLE" });
    }, 45000);
  }

  await db.collection("assignments").insertOne(assignment);
  await db.collection("timeline").insertOne({
    incidentId: request.incidentId,
    stage: assignment.kind,
    details: assignment,
    timestamp: now
  });
  await db.collection("incidents").updateOne(
    { id: request.incidentId },
    {
      $set: {
        assignment,
        status: assignee ? "ASSIGNED" : "AWAITING_STAFF",
        updatedAt: now
      }
    }
  );

  await publishJson(producer, topics.ASSIGNMENTS, assignment, request.incidentId);
  logger.info({ msg: assignment.message, incidentId: request.incidentId, assignee: assignee?.id });
}

async function start() {
  db = await connectDatabase();
  producer = await createProducer("assignment-service-producer");
  consumer = await createConsumer("assignment-service", "assignment-service-group");
  await consumer.subscribe({ topic: topics.ASSIGNMENTS, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      const raw = parseMessage(message);
      try {
        await handleAssignmentRequest(raw);
      } catch (error) {
        logger.error({ msg: "Failed to handle assignment, routing to DLQ", incidentId: raw.incidentId, error: error.message });
        await publishJson(producer, topics.DLQ, {
          originalTopic: topics.ASSIGNMENTS,
          payload: raw,
          error: error.message,
          failedAt: Date.now()
        }, raw.incidentId).catch((dlqErr) => logger.error({ msg: "DLQ publish failed", error: dlqErr.message }));
      }
    }
  });

  logger.info({ msg: "Assignment service consuming assignments" });

  async function shutdown(signal) {
    logger.info({ msg: `Received ${signal}, shutting down gracefully` });
    await consumer.disconnect().catch(() => {});
    await producer.disconnect().catch(() => {});
    await closeDatabase().catch(() => {});
    logger.info({ msg: "Assignment service shutdown complete" });
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((error) => {
  logger.error({ msg: "Assignment service failed", error: error.message });
  process.exit(1);
});
