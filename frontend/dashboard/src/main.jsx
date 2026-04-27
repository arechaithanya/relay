import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import axios from "axios";
import { io } from "socket.io-client";
import {
  Activity,
  Bell,
  CheckCircle,
  ChevronRight,
  Flame,
  HeartPulse,
  Moon,
  Radio,
  ShieldAlert,
  Sun,
  Users,
  Wifi,
  WifiOff,
  X,
  XCircle
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

/** Play a short beep using the Web Audio API. Silent if not supported. */
function playAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (_) {
    // AudioContext not available
  }
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
  const [darkMode, setDarkMode] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const knownIds = useRef(new Set());
  const originalTitle = useRef(document.title);
  const flashInterval = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    Promise.all([axios.get(`${apiBaseUrl}/incidents`), axios.get(`${apiBaseUrl}/staff`)])
      .then(([incidentsResponse, staffResponse]) => {
        incidentsResponse.data.forEach((inc) => knownIds.current.add(inc.id));
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
    socket.on("snapshot", (nextSnapshot) => {
      // Detect new critical incidents for alert
      nextSnapshot.incidents.forEach((inc) => {
        if (!knownIds.current.has(inc.id) && inc.severity >= 4) {
          playAlert();
          startTitleFlash(inc);
        }
        knownIds.current.add(inc.id);
      });
      setSnapshot(nextSnapshot);
    });
    return () => socket.close();
  }, []);

  function startTitleFlash(incident) {
    if (flashInterval.current) return;
    let toggle = false;
    const label = `🚨 ${incidentMeta[incident.type]?.label || incident.type} – ${incident.location}`;
    flashInterval.current = setInterval(() => {
      document.title = toggle ? originalTitle.current : label;
      toggle = !toggle;
    }, 900);
    setTimeout(() => {
      clearInterval(flashInterval.current);
      flashInterval.current = null;
      document.title = originalTitle.current;
    }, 10000);
  }

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

  const handleAcknowledge = useCallback(async (incidentId) => {
    await axios.patch(`${apiBaseUrl}/incidents/${incidentId}/acknowledge`);
    setSnapshot((current) => ({
      ...current,
      incidents: current.incidents.map((inc) =>
        inc.id === incidentId ? { ...inc, status: "ACKNOWLEDGED" } : inc
      )
    }));
    if (selectedIncident?.id === incidentId) {
      setSelectedIncident((current) => ({ ...current, status: "ACKNOWLEDGED" }));
    }
  }, [selectedIncident]);

  const handleResolve = useCallback(async (incidentId) => {
    await axios.patch(`${apiBaseUrl}/incidents/${incidentId}/resolve`);
    setSnapshot((current) => ({
      ...current,
      incidents: current.incidents.map((inc) =>
        inc.id === incidentId ? { ...inc, status: "RESOLVED" } : inc
      )
    }));
    if (selectedIncident?.id === incidentId) {
      setSelectedIncident(null);
    }
  }, [selectedIncident]);

  async function openIncidentDetail(incident) {
    try {
      const res = await axios.get(`${apiBaseUrl}/incidents/${incident.id}`);
      setSelectedIncident(res.data);
    } catch (_) {
      setSelectedIncident(incident);
    }
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">CrisisSync AI</p>
          <h1>Emergency response operations</h1>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setDarkMode((d) => !d)}
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            title={darkMode ? "Light mode" : "Dark mode"}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className={`connection ${connected ? "online" : "offline"}`} role="status">
            {connected ? <Wifi size={18} /> : <WifiOff size={18} />}
            <span>{connected ? "Live WebSocket" : "Connecting"}</span>
          </div>
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
            activeIncidents.map((incident) => (
              <IncidentRow
                key={incident.id}
                incident={incident}
                onAcknowledge={handleAcknowledge}
                onResolve={handleResolve}
                onDetails={openIncidentDetail}
              />
            ))
          ) : (
            <EmptyState text="No active incidents" />
          )}
        </Panel>

        <Panel title="Hotel Operations Map" className="map-panel">
          <FloorPlan incidents={activeIncidents} staff={snapshot.staff} />
        </Panel>

        <Panel title="Staff &amp; Assignments" className="staff-panel">
          <StaffList staff={snapshot.staff} assignments={snapshot.assignments} />
        </Panel>

        <Panel title="Incident Timeline" className="timeline-panel">
          <Timeline items={snapshot.timeline} />
        </Panel>
      </section>

      {selectedIncident && (
        <IncidentModal
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          onAcknowledge={handleAcknowledge}
          onResolve={handleResolve}
        />
      )}
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

function IncidentRow({ incident, onAcknowledge, onResolve, onDetails }) {
  const Icon = incidentMeta[incident.type]?.icon || Bell;
  const isResolved = incident.status === "RESOLVED";
  return (
    <article className={`incident ${severityClass(incident.severity)}`}>
      <div className="incident-icon">
        <Icon size={19} />
      </div>
      <div className="incident-body">
        <div className="incident-title">
          <strong>{incidentMeta[incident.type]?.label || incident.type}</strong>
          <span>Severity {incident.severity}</span>
        </div>
        <p>{incident.location}</p>
        <small>
          {incident.workflow} · {incident.status} · open {ageSeconds(incident.createdAt)}s
        </small>
        <div className="incident-actions">
          <button
            type="button"
            className="action-btn details-btn"
            onClick={() => onDetails(incident)}
            aria-label="View incident details"
          >
            <ChevronRight size={14} /> Details
          </button>
          {!isResolved && incident.status !== "ACKNOWLEDGED" && (
            <button
              type="button"
              className="action-btn ack-btn"
              onClick={() => onAcknowledge(incident.id)}
              aria-label="Acknowledge incident"
            >
              <CheckCircle size={14} /> Acknowledge
            </button>
          )}
          {!isResolved && (
            <button
              type="button"
              className="action-btn resolve-btn"
              onClick={() => onResolve(incident.id)}
              aria-label="Resolve incident"
            >
              <XCircle size={14} /> Resolve
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function IncidentModal({ incident, onClose, onAcknowledge, onResolve }) {
  const Icon = incidentMeta[incident.type]?.icon || Bell;
  const isResolved = incident.status === "RESOLVED";

  // Close on Escape key
  useEffect(() => {
    function handler(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleAcknowledge() {
    onAcknowledge(incident.id);
    onClose();
  }

  function handleResolve() {
    onResolve(incident.id);
    onClose();
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Incident details" onClick={handleOverlayClick}>
      <div className="modal">
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Icon size={20} />
            <h2 style={{ margin: 0 }}>{incidentMeta[incident.type]?.label || incident.type} Incident</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="detail-grid">
            <DetailItem label="ID" value={incident.id} />
            <DetailItem label="Location" value={incident.location} />
            <DetailItem label="Status" value={incident.status} />
            <DetailItem label="Severity" value={`${incident.severity} (${incident.priority})`} />
            <DetailItem label="Workflow" value={incident.workflow} />
            <DetailItem label="Source" value={incident.source} />
            <DetailItem label="Created" value={formatTime(incident.createdAt)} />
            {incident.acknowledgedAt && <DetailItem label="Acknowledged" value={formatTime(incident.acknowledgedAt)} />}
            {incident.resolvedAt && <DetailItem label="Resolved" value={formatTime(incident.resolvedAt)} />}
          </div>

          {incident.summary && <p className="incident-summary">{incident.summary}</p>}

          {incident.assignment?.staff && (
            <div className="modal-section">
              <h3>Assigned Responder</h3>
              <p>{incident.assignment.staff.name} ({incident.assignment.staff.role.replace("_", " ")}) — {incident.assignment.message}</p>
            </div>
          )}

          {incident.timeline?.length > 0 && (
            <div className="modal-section">
              <h3>Timeline</h3>
              <ol className="timeline">
                {incident.timeline.map((item) => (
                  <li key={item._id || `${item.stage}-${item.timestamp}`}>
                    <time>{formatTime(item.timestamp)}</time>
                    <div>
                      <strong>{item.stage}</strong>
                      <span>{item.incidentId}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {!isResolved && (
          <div className="modal-footer">
            {incident.status !== "ACKNOWLEDGED" && (
              <button type="button" className="action-btn ack-btn" onClick={handleAcknowledge}>
                <CheckCircle size={15} /> Acknowledge
              </button>
            )}
            <button type="button" className="action-btn resolve-btn" onClick={handleResolve}>
              <XCircle size={15} /> Resolve
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

function FloorPlan({ incidents, staff }) {
  return (
    <div className="floorplan" role="img" aria-label="Hotel operations map">
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
            role="img"
            aria-label={`${incident.type} incident at ${incident.location}`}
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
          role="img"
          aria-label={`${member.name}, ${member.role}, ${member.status}`}
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
