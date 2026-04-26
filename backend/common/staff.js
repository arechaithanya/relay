const staff = [
  {
    id: "stf-101",
    name: "Avery Chen",
    role: "FIRE_WARDEN",
    status: "AVAILABLE",
    location: "Lobby",
    coordinates: { x: 12, y: 18 }
  },
  {
    id: "stf-102",
    name: "Maya Patel",
    role: "MEDICAL",
    status: "AVAILABLE",
    location: "Pool Deck",
    coordinates: { x: 70, y: 58 }
  },
  {
    id: "stf-103",
    name: "Noah Williams",
    role: "SECURITY",
    status: "AVAILABLE",
    location: "North Entrance",
    coordinates: { x: 22, y: 76 }
  },
  {
    id: "stf-104",
    name: "Sam Rivera",
    role: "FACILITIES",
    status: "AVAILABLE",
    location: "Service Corridor",
    coordinates: { x: 55, y: 30 }
  },
  {
    id: "stf-105",
    name: "Elena Moore",
    role: "SECURITY",
    status: "BUSY",
    location: "Ballroom",
    coordinates: { x: 84, y: 22 }
  }
];

const locationCoordinates = {
  Lobby: { x: 15, y: 20 },
  "Kitchen": { x: 82, y: 16 },
  "Ballroom": { x: 78, y: 30 },
  "Pool Deck": { x: 70, y: 60 },
  "North Entrance": { x: 20, y: 78 },
  "Conference Wing": { x: 40, y: 42 },
  "Guest Floor 3": { x: 34, y: 12 },
  "Guest Floor 7": { x: 58, y: 12 },
  "Service Corridor": { x: 54, y: 32 },
  "Parking Garage": { x: 14, y: 88 }
};

function distance(a, b) {
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 10) / 10;
}

function coordinatesForLocation(location) {
  return locationCoordinates[location] || locationCoordinates.Lobby;
}

module.exports = {
  coordinatesForLocation,
  distance,
  locationCoordinates,
  staff
};
