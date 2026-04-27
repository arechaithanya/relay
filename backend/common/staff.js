const staff = [
  {
    id: "stf-101",
    name: "Avery Chen",
    role: "FIRE_WARDEN",
    status: "AVAILABLE",
    location: "Lobby",
    coordinates: { x: 20, y: 73 }
  },
  {
    id: "stf-102",
    name: "Maya Patel",
    role: "MEDICAL",
    status: "AVAILABLE",
    location: "Pool Deck",
    coordinates: { x: 78, y: 78 }
  },
  {
    id: "stf-103",
    name: "Noah Williams",
    role: "SECURITY",
    status: "AVAILABLE",
    location: "North Entrance",
    coordinates: { x: 8, y: 73 }
  },
  {
    id: "stf-104",
    name: "Sam Rivera",
    role: "FACILITIES",
    status: "AVAILABLE",
    location: "Service Corridor",
    coordinates: { x: 83, y: 49 }
  },
  {
    id: "stf-105",
    name: "Elena Moore",
    role: "SECURITY",
    status: "BUSY",
    location: "Ballroom",
    coordinates: { x: 73, y: 28 }
  }
];

const locationCoordinates = {
  Lobby: { x: 20, y: 73 },
  Reception: { x: 18, y: 53 },
  "North Entrance": { x: 8, y: 73 },
  Kitchen: { x: 89, y: 27 },
  Ballroom: { x: 73, y: 28 },
  "Pool Deck": { x: 78, y: 78 },
  "Conference Wing": { x: 39, y: 32 },
  "Guest Floor 3": { x: 31, y: 13 },
  "Guest Floor 7": { x: 55, y: 13 },
  "Room 301": { x: 17, y: 14 },
  "Room 302": { x: 31, y: 14 },
  "Room 303": { x: 45, y: 14 },
  "Room 304": { x: 59, y: 14 },
  "Room 305": { x: 73, y: 14 },
  "Service Corridor": { x: 83, y: 49 },
  "Parking Garage": { x: 35, y: 91 }
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
