const INCIDENT_TYPES = new Set(["FIRE", "MEDICAL", "SECURITY"]);

const DEFAULT_SEVERITY = {
  FIRE: 4,
  MEDICAL: 3,
  SECURITY: 4
};

const RESPONSE_TEAMS = {
  FIRE: ["FIRE_WARDEN", "FACILITIES", "SECURITY"],
  MEDICAL: ["MEDICAL", "SECURITY"],
  SECURITY: ["SECURITY"]
};

function normalizeType(type) {
  const normalized = String(type || "").trim().toUpperCase();
  if (!INCIDENT_TYPES.has(normalized)) {
    throw new Error(`Unsupported emergency type: ${type}`);
  }
  return normalized;
}

function classifyIncident(event) {
  const type = normalizeType(event.type);
  const severity = Number.isFinite(event.severity)
    ? Math.max(1, Math.min(5, Number(event.severity)))
    : DEFAULT_SEVERITY[type];

  const workflow = {
    FIRE: "EVACUATION",
    MEDICAL: "MEDICAL_RESPONSE",
    SECURITY: "SECURITY_LOCKDOWN"
  }[type];

  const summary = {
    FIRE: "Fire incident detected. Begin evacuation workflow and alert floor wardens.",
    MEDICAL: "Medical emergency reported. Dispatch nearest medical responder.",
    SECURITY: "Security threat reported. Notify security personnel and monitor affected area."
  }[type];

  return {
    type,
    severity,
    priority: severity >= 4 ? "HIGH" : severity === 3 ? "MEDIUM" : "LOW",
    workflow,
    summary,
    requiredRoles: RESPONSE_TEAMS[type]
  };
}

function escalationSeverity(currentSeverity) {
  return Math.min(5, Number(currentSeverity || 1) + 1);
}

module.exports = {
  classifyIncident,
  escalationSeverity,
  normalizeType,
  RESPONSE_TEAMS
};
