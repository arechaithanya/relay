const { classifyIncident, escalationSeverity, normalizeType } = require("../rules");

describe("normalizeType", () => {
  test("accepts valid types case-insensitively", () => {
    expect(normalizeType("fire")).toBe("FIRE");
    expect(normalizeType("MEDICAL")).toBe("MEDICAL");
    expect(normalizeType("security")).toBe("SECURITY");
  });

  test("trims whitespace", () => {
    expect(normalizeType("  FIRE  ")).toBe("FIRE");
  });

  test("throws on unsupported type", () => {
    expect(() => normalizeType("TORNADO")).toThrow("Unsupported emergency type: TORNADO");
  });

  test("throws on empty string", () => {
    expect(() => normalizeType("")).toThrow();
  });

  test("throws on null/undefined", () => {
    expect(() => normalizeType(null)).toThrow();
    expect(() => normalizeType(undefined)).toThrow();
  });
});

describe("classifyIncident", () => {
  test("FIRE incident has correct defaults", () => {
    const result = classifyIncident({ type: "FIRE", location: "Lobby" });
    expect(result.type).toBe("FIRE");
    expect(result.severity).toBe(4);
    expect(result.priority).toBe("HIGH");
    expect(result.workflow).toBe("EVACUATION");
    expect(result.requiredRoles).toEqual(["FIRE_WARDEN", "FACILITIES", "SECURITY"]);
  });

  test("MEDICAL incident has correct defaults", () => {
    const result = classifyIncident({ type: "MEDICAL", location: "Pool Deck" });
    expect(result.type).toBe("MEDICAL");
    expect(result.severity).toBe(3);
    expect(result.priority).toBe("MEDIUM");
    expect(result.workflow).toBe("MEDICAL_RESPONSE");
    expect(result.requiredRoles).toEqual(["MEDICAL", "SECURITY"]);
  });

  test("SECURITY incident has correct defaults", () => {
    const result = classifyIncident({ type: "SECURITY", location: "Ballroom" });
    expect(result.type).toBe("SECURITY");
    expect(result.severity).toBe(4);
    expect(result.priority).toBe("HIGH");
    expect(result.workflow).toBe("SECURITY_LOCKDOWN");
    expect(result.requiredRoles).toEqual(["SECURITY"]);
  });

  test("custom severity is clamped to 1-5", () => {
    expect(classifyIncident({ type: "FIRE", severity: 10 }).severity).toBe(5);
    expect(classifyIncident({ type: "FIRE", severity: 0 }).severity).toBe(1);
    expect(classifyIncident({ type: "FIRE", severity: -5 }).severity).toBe(1);
  });

  test("custom severity 2 produces LOW priority", () => {
    const result = classifyIncident({ type: "FIRE", severity: 2 });
    expect(result.severity).toBe(2);
    expect(result.priority).toBe("LOW");
  });

  test("custom severity 3 produces MEDIUM priority", () => {
    const result = classifyIncident({ type: "MEDICAL", severity: 3 });
    expect(result.priority).toBe("MEDIUM");
  });

  test("custom severity 4 produces HIGH priority", () => {
    const result = classifyIncident({ type: "SECURITY", severity: 4 });
    expect(result.priority).toBe("HIGH");
  });

  test("custom severity 5 produces HIGH priority", () => {
    const result = classifyIncident({ type: "FIRE", severity: 5 });
    expect(result.priority).toBe("HIGH");
  });

  test("non-finite severity falls back to default", () => {
    expect(classifyIncident({ type: "FIRE", severity: NaN }).severity).toBe(4);
    expect(classifyIncident({ type: "FIRE", severity: "bad" }).severity).toBe(4);
  });

  test("summary string is present and non-empty", () => {
    const result = classifyIncident({ type: "FIRE" });
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
  });

  test("throws on invalid type", () => {
    expect(() => classifyIncident({ type: "FLOOD" })).toThrow();
  });
});

describe("escalationSeverity", () => {
  test("increments severity by 1", () => {
    expect(escalationSeverity(2)).toBe(3);
    expect(escalationSeverity(4)).toBe(5);
  });

  test("caps at 5", () => {
    expect(escalationSeverity(5)).toBe(5);
    expect(escalationSeverity(100)).toBe(5);
  });

  test("defaults 0/null/undefined to minimum 2", () => {
    expect(escalationSeverity(0)).toBe(2);
    expect(escalationSeverity(null)).toBe(2);
    expect(escalationSeverity(undefined)).toBe(2);
  });
});
