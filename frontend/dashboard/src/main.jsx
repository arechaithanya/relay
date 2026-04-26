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
  { name: "Guest Floor 3", x: 34, y: 12 },
  { name: "Guest Floor 7", x: 58, y: 12 },
  { name: "Kitchen", x: 82, y: 16 },
  { name: "Lobby", x: 15, y: 20 },
  { name: "Ballroom", x: 78, y: 30 },
  { name: "Service Corridor", x: 54, y: 32 },
  { name: "Conference Wing", x: 40, y: 42 },
  { name: "Pool Deck", x: 70, y: 60 },
  { name: "North Entrance", x: 20, y: 78 },
  { name: "Parking Garage", x: 14, y: 88 }
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
      <div className="floor-grid" />
      {locations.map((location) => (
        <span
          key={location.name}
          className="zone-label"
          style={{ left: `${location.x}%`, top: `${location.y}%` }}
        >
          {location.name}
        </span>
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
