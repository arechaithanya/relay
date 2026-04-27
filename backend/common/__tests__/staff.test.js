const { distance, coordinatesForLocation, locationCoordinates } = require("../staff");

describe("distance", () => {
  test("same point is zero distance", () => {
    expect(distance({ x: 10, y: 20 }, { x: 10, y: 20 })).toBe(0);
  });

  test("pure horizontal distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3);
  });

  test("pure vertical distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 0, y: 4 })).toBe(4);
  });

  test("3-4-5 triangle", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  test("is symmetrical", () => {
    const a = { x: 12, y: 34 };
    const b = { x: 56, y: 78 };
    expect(distance(a, b)).toBe(distance(b, a));
  });

  test("result is rounded to 1 decimal", () => {
    const result = distance({ x: 0, y: 0 }, { x: 1, y: 2 });
    expect(result).toBe(Math.round(Math.hypot(1, 2) * 10) / 10);
  });
});

describe("coordinatesForLocation", () => {
  test("returns correct coordinates for known locations", () => {
    expect(coordinatesForLocation("Lobby")).toEqual({ x: 15, y: 20 });
    expect(coordinatesForLocation("Kitchen")).toEqual({ x: 82, y: 16 });
    expect(coordinatesForLocation("Ballroom")).toEqual({ x: 78, y: 30 });
    expect(coordinatesForLocation("Pool Deck")).toEqual({ x: 70, y: 60 });
    expect(coordinatesForLocation("North Entrance")).toEqual({ x: 20, y: 78 });
  });

  test("returns Lobby coordinates for unknown location", () => {
    expect(coordinatesForLocation("UnknownPlace")).toEqual(locationCoordinates.Lobby);
    expect(coordinatesForLocation(undefined)).toEqual(locationCoordinates.Lobby);
    expect(coordinatesForLocation("")).toEqual(locationCoordinates.Lobby);
  });

  test("all known locations return valid coordinate objects", () => {
    for (const [name, coords] of Object.entries(locationCoordinates)) {
      const result = coordinatesForLocation(name);
      expect(result).toHaveProperty("x");
      expect(result).toHaveProperty("y");
      expect(typeof result.x).toBe("number");
      expect(typeof result.y).toBe("number");
    }
  });
});
