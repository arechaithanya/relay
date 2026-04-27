import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import axios from "axios";
import { io } from "socket.io-client";
import {
  Activity,
  Bell,
  Flame,
  HeartPulse,
  Radio,
  ShieldAlert,
  Users,
  Wifi,
  WifiOff
} from "lucide-react";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4001";
const socketUrl = import.meta.env.VITE_SOCKET_URL || "http://localhost:4004";

const incidentMeta = {
  FIRE: { label: "Fire", icon: Flame },
  MEDICAL: { label: "Medical", icon: HeartPulse },
  SECURITY: { label: "Security", icon: ShieldAlert }
};

const locations = [
  { name: "Lobby", x: 20, y: 73 },
  { name: "Reception", x: 18, y: 53 },
  { name: "North Entrance", x: 8, y: 73 },
  { name: "Conference Wing", x: 39, y: 32 },
  { name: "Ballroom", x: 73, y: 28 },
  { name: "Kitchen", x: 89, y: 27 },
  { name: "Service Corridor", x: 83, y: 49 },
  { name: "Guest Floor 3", x: 31, y: 13 },
  { name: "Guest Floor 7", x: 55, y: 13 },
  { name: "Room 301", x: 17, y: 14 },
  { name: "Room 302", x: 31, y: 14 },
  { name: "Room 303", x: 45, y: 14 },
  { name: "Room 304", x: 59, y: 14 },
  { name: "Room 305", x: 73, y: 14 },
  { name: "Pool Deck", x: 78, y: 78 },
  { name: "Parking Garage", x: 35, y: 91 }
];

const hotelRooms = [
  { name: "Room 301", type: "guest", x: 10, y: 7, w: 13, h: 15 },
  { name: "Room 302", type: "guest", x: 24, y: 7, w: 13, h: 15 },
  { name: "Room 303", type: "guest", x: 38, y: 7, w: 13, h: 15 },
  { name: "Room 304", type: "guest", x: 52, y: 7, w: 13, h: 15 },
  { name: "Room 305", type: "guest", x: 66, y: 7, w: 13, h: 15 },
  { name: "Housekeeping", type: "service", x: 80, y: 7, w: 10, h: 15 },
  { name: "Conference A", type: "meeting", x: 14, y: 27, w: 21, h: 18 },
  { name: "Conference B", type: "meeting", x: 37, y: 27, w: 18, h: 18 },
  { name: "Ballroom", type: "event", x: 61, y: 27, w: 24, h: 25 },
  { name: "Kitchen", type: "service", x: 86, y: 21, w: 10, h: 25 },
  { name: "Security Office", type: "service", x: 4, y: 48, w: 14, h: 14 },
  { name: "Reception", type: "public", x: 19, y: 50, w: 19, h: 13 },
  { name: "Lobby", type: "public", x: 10, y: 65, w: 32, h: 20 },
  { name: "Lounge", type: "public", x: 44, y: 64, w: 18, h: 17 },
  { name: "Pool Deck", type: "amenity", x: 69, y: 64, w: 23, h: 25 },
  { name: "Parking Garage", type: "parking", x: 20, y: 88, w: 32, h: 8 }
];

const floorDoors = [
  { x: 7.6, y: 72, rotate: 90, label: "North Entrance" },
  { x: 20, y: 64.8, rotate: 0, label: "Lobby doors" },
  { x: 29, y: 49.5, rotate: 0, label: "Reception door" },
  { x: 25, y: 45.5, rotate: 0, label: "Conference A door" },
  { x: 45, y: 45.5, rotate: 0, label: "Conference B door" },
  { x: 72, y: 52.3, rotate: 0, label: "Ballroom door" },
  { x: 85.5, y: 35, rotate: 90, label: "Kitchen service door" },
  { x: 82, y: 63.5, rotate: 0, label: "Pool access" },
  { x: 17, y: 22.4, rotate: 0, label: "Room 301 door" },
  { x: 31, y: 22.4, rotate: 0, label: "Room 302 door" },
  { x: 45, y: 22.4, rotate: 0, label: "Room 303 door" },
  { x: 59, y: 22.4, rotate: 0, label: "Room 304 door" },
  { x: 73, y: 22.4, rotate: 0, label: "Room 305 door" }
];

function formatTime(timestamp) {
  if (!timestamp) return "--";
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestamp));
}

function ageSeconds(timestamp) {
  if (!timestamp) return 0;
  return Math.max(0, Math.round((Date.now() - timestamp) / 1000));
}

function severityClass(severity) {
  if (severity >= 5) return "critical";
  if (severity >= 4) return "high";
  if (severity >= 3) return "medium";
  return "low";
}

function App() {
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState({
    incidents: [],
    assignments: [],
    timeline: [],
    staff: [],
    events: []
  });
  const [triggering, setTriggering] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState("Kitchen");
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    Promise.all([axios.get(`${apiBaseUrl}/incidents`), axios.get(`${apiBaseUrl}/staff`)])
      .then(([incidentsResponse, staffResponse]) => {
        setSnapshot((current) => ({
          ...current,
          incidents: incidentsResponse.data,
          staff: staffResponse.data
        }));
      })
      .catch(() => {});

    const socket = io(socketUrl, { transports: ["websocket"] });
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("snapshot", (nextSnapshot) => setSnapshot(nextSnapshot));
    return () => socket.close();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const activeIncidents = useMemo(
    () => snapshot.incidents.filter((incident) => incident.status !== "RESOLVED"),
    [snapshot.incidents]
  );

  const responseAverage = useMemo(() => {
    if (!activeIncidents.length) return 0;
    const total = activeIncidents.reduce(
      (sum, incident) => sum + ageSeconds(incident.createdAt),
      0
    );
    return Math.round(total / activeIncidents.length);
  }, [activeIncidents, clock]);

  async function trigger(type) {
    setTriggering(type);
    try {
      await axios.post(`${apiBaseUrl}/emergency/${type.toLowerCase()}`, {
        location: selectedLocation
      });
    } finally {
      setTriggering(null);
    }
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">CrisisSync AI</p>
          <h1>Emergency response operations</h1>
        </div>
        <div className={`connection ${connected ? "online" : "offline"}`}>
          {connected ? <Wifi size={18} /> : <WifiOff size={18} />}
          <span>{connected ? "Live WebSocket" : "Connecting"}</span>
        </div>
      </section>

      <section className="metrics" aria-label="Operational metrics">
        <Metric icon={Bell} label="Active incidents" value={activeIncidents.length} />
        <Metric icon={Activity} label="Avg open time" value={`${responseAverage}s`} />
        <Metric icon={Users} label="Staff tracked" value={snapshot.staff.length} />
        <Metric icon={Radio} label="Kafka events" value={snapshot.events.length} />
      </section>

      <section className="control-strip">
        <label>
          Trigger location
          <select value={selectedLocation} onChange={(event) => setSelectedLocation(event.target.value)}>
            {locations.map((location) => (
              <option key={location.name} value={location.name}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => trigger("fire")} disabled={Boolean(triggering)}>
          <Flame size={17} /> Fire
        </button>
        <button type="button" onClick={() => trigger("medical")} disabled={Boolean(triggering)}>
          <HeartPulse size={17} /> Medical
        </button>
        <button type="button" onClick={() => trigger("security")} disabled={Boolean(triggering)}>
          <ShieldAlert size={17} /> Security
        </button>
      </section>

      <section className="workspace">
        <Panel title="Live Incident Feed" className="feed">
          {activeIncidents.length ? (
            activeIncidents.map((incident) => <IncidentRow key={incident.id} incident={incident} />)
          ) : (
            <EmptyState text="No active incidents" />
          )}
        </Panel>

        <Panel title="Hotel Operations Map" className="map-panel">
          <FloorPlan incidents={activeIncidents} staff={snapshot.staff} />
        </Panel>

        <Panel title="Staff & Assignments" className="staff-panel">
          <StaffList staff={snapshot.staff} assignments={snapshot.assignments} />
        </Panel>

        <Panel title="Incident Timeline" className="timeline-panel">
          <Timeline items={snapshot.timeline} />
        </Panel>
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="metric">
      <Icon size={19} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Panel({ title, className = "", children }) {
  return (
    <section className={`panel ${className}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function IncidentRow({ incident }) {
  const Icon = incidentMeta[incident.type]?.icon || Bell;
  return (
    <article className={`incident ${severityClass(incident.severity)}`}>
      <div className="incident-icon">
        <Icon size={19} />
      </div>
      <div>
        <div className="incident-title">
          <strong>{incidentMeta[incident.type]?.label || incident.type}</strong>
          <span>Severity {incident.severity}</span>
        </div>
        <p>{incident.location}</p>
        <small>
          {incident.workflow} · {incident.status} · open {ageSeconds(incident.createdAt)}s
        </small>
      </div>
    </article>
  );
}

function FloorPlan({ incidents, staff }) {
  return (
    <div className="floorplan">
      <div className="blueprint-title">
        <strong>Level 03 Emergency Response Floor Plan</strong>
        <span>Rooms, doors, corridors, staff and incidents</span>
      </div>
      <div className="corridor corridor-main" />
      <div className="corridor corridor-vertical" />
      <div className="corridor corridor-lobby" />
      {hotelRooms.map((room) => (
        <div
          key={room.name}
          className={`hotel-room ${room.type}`}
          style={{
            left: `${room.x}%`,
            top: `${room.y}%`,
            width: `${room.w}%`,
            height: `${room.h}%`
          }}
        >
          <span>{room.name}</span>
        </div>
      ))}
      {floorDoors.map((door) => (
        <span
          key={`${door.label}-${door.x}-${door.y}`}
          className="floor-door"
          style={{
            left: `${door.x}%`,
            top: `${door.y}%`,
            transform: `translate(-50%, -50%) rotate(${door.rotate}deg)`
          }}
          title={door.label}
        />
      ))}
      {incidents.map((incident) => {
        const location = locations.find((item) => item.name === incident.location) || locations[0];
        return (
          <span
            key={incident.id}
            className={`incident-marker ${severityClass(incident.severity)}`}
            style={{ left: `${location.x}%`, top: `${location.y}%` }}
            title={`${incident.type} at ${incident.location}`}
          />
        );
      })}
      {staff.map((member) => (
        <span
          key={member.id}
          className={`staff-marker ${member.status.toLowerCase()}`}
          style={{
            left: `${member.coordinates?.x || 20}%`,
            top: `${member.coordinates?.y || 20}%`
          }}
          title={`${member.name} · ${member.role}`}
        />
      ))}
    </div>
  );
}

function StaffList({ staff, assignments }) {
  const latestByStaff = new Map(
    assignments
      .filter((assignment) => assignment.staff)
      .slice()
      .reverse()
      .map((assignment) => [assignment.staff.id, assignment])
  );

  return (
    <div className="staff-list">
      {staff.map((member) => {
        const assignment = latestByStaff.get(member.id);
        return (
          <article key={member.id} className="staff-row">
            <div>
              <strong>{member.name}</strong>
              <span>{member.role.replace("_", " ")}</span>
            </div>
            <div>
              <small>{assignment ? assignment.location : member.location}</small>
              <b className={assignment ? "assigned" : member.status.toLowerCase()}>
                {assignment ? "ASSIGNED" : member.status}
              </b>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Timeline({ items }) {
  if (!items.length) return <EmptyState text="Waiting for first event" />;
  return (
    <ol className="timeline">
      {items.slice(0, 12).map((item) => (
        <li key={item._id || `${item.incidentId}-${item.stage}-${item.timestamp}`}>
          <time>{formatTime(item.timestamp)}</time>
          <div>
            <strong>{item.stage}</strong>
            <span>{item.incidentId}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function EmptyState({ text }) {
  return <div className="empty">{text}</div>;
}

createRoot(document.getElementById("root")).render(<App />);
