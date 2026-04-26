require("dotenv").config({ path: "../../.env" });

const { connectDatabase } = require("../../common/database");
const { createConsumer, createProducer, parseMessage, publishJson } = require("../../common/kafka");
const { coordinatesForLocation, distance, staff } = require("../../common/staff");
const topics = require("../../common/topics");

let db;
let producer;
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
}

async function start() {
  db = await connectDatabase();
  producer = await createProducer("assignment-service-producer");
  const consumer = await createConsumer("assignment-service", "assignment-service-group");
  await consumer.subscribe({ topic: topics.ASSIGNMENTS, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      await handleAssignmentRequest(parseMessage(message));
    }
  });

  console.log("Assignment service consuming assignments");
}

start().catch((error) => {
  console.error("Assignment service failed", error);
  process.exit(1);
});
