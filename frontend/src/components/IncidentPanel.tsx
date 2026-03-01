import type { Incident } from "../types/incident";

const URGENCY_COLORS: Record<string, string> = {
  low: "#3b82f6",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

const DISASTER_ICONS: Record<string, string> = {
  flood: "🌊",
  fire: "🔥",
  storm: "🌪️",
  earthquake: "🌍",
  volcanic: "🌋",
  drought: "☀️",
  avalanche: "❄️",
  chemical: "☣️",
  other: "⚠️",
};

interface IncidentPanelProps {
  incident: Incident;
  onClose: () => void;
}

export default function IncidentPanel({ incident, onClose }: IncidentPanelProps) {
  const color = URGENCY_COLORS[incident.urgency_label] || "#6b7280";
  const icon = DISASTER_ICONS[incident.disaster_type] || "⚠️";
  const confidence = typeof incident.confidence === "number"
    ? incident.confidence
    : parseFloat(String(incident.confidence)) || 0;

  const timeAgo = getTimeAgo(incident.timestamp);

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <span style={{ fontSize: 13, color: "#9ca3af" }}>Incident Detail</span>
        <button onClick={onClose} style={styles.closeBtn}>✕</button>
      </div>

      {/* Urgency bar */}
      <div style={{ ...styles.urgencyBar, background: color }}>
        <span style={styles.urgencyLabel}>
          {incident.urgency_label.toUpperCase()}
        </span>
        <span style={styles.urgencyScore}>{incident.urgency_score}/100</span>
      </div>

      {/* Urgency meter */}
      <div style={styles.meterContainer}>
        <div style={styles.meterTrack}>
          <div
            style={{
              ...styles.meterFill,
              width: `${incident.urgency_score}%`,
              background: `linear-gradient(90deg, #3b82f6, ${color})`,
            }}
          />
        </div>
        <div style={styles.meterLabels}>
          <span>Low</span>
          <span>Medium</span>
          <span>High</span>
          <span>Critical</span>
        </div>
      </div>

      {/* Type + Location */}
      <div style={styles.section}>
        <div style={styles.typeRow}>
          <span style={{ fontSize: 24 }}>{icon}</span>
          <div>
            <div style={styles.disasterType}>{incident.disaster_type.toUpperCase()}</div>
            <div style={styles.locationText}>📍 {incident.location_text}</div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Summary</div>
        <p style={styles.summaryText}>{incident.summary}</p>
      </div>

      {/* Why this urgency? */}
      {incident.urgency_rationale && (
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Why This Urgency Score?</div>
          <div style={styles.rationaleBox}>
            <span style={styles.rationaleIcon}>💡</span>
            <p style={styles.rationaleText}>{incident.urgency_rationale}</p>
          </div>
        </div>
      )}

      {/* Recommended Response */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Recommended Response</div>
        <div style={styles.responseBox}>
          {incident.recommended_response}
        </div>
      </div>

      {/* Details grid */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Details</div>
        <div style={styles.detailGrid}>
          <DetailRow label="Confidence" value={`${(confidence * 100).toFixed(0)}%`} />
          <DetailRow label="Coordinates" value={
            incident.lat && incident.lng
              ? `${Number(incident.lat).toFixed(3)}, ${Number(incident.lng).toFixed(3)}`
              : "N/A"
          } />
          <DetailRow label="Source" value={incident.source} />
          <DetailRow label="Time" value={timeAgo} />
        </div>
      </div>

      {/* Raw text */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Original Report</div>
        <div style={styles.rawText}>{incident.text}</div>
      </div>

      {/* SNS badge */}
      {incident.urgency_score >= 75 && (
        <div style={styles.alertBadge}>
          🔔 SNS Alert Triggered
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detailRow}>
      <span style={styles.detailLabel}>{label}</span>
      <span style={styles.detailValue}>{value}</span>
    </div>
  );
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 380,
    height: "100vh",
    background: "#111827",
    color: "#e5e7eb",
    overflowY: "auto",
    fontFamily: "system-ui, -apple-system, sans-serif",
    borderLeft: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "-4px 0 24px rgba(0,0,0,0.5)",
    zIndex: 10,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#9ca3af",
    fontSize: 18,
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 4,
  },
  urgencyBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 16px",
  },
  urgencyLabel: {
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: "0.05em",
    color: "white",
  },
  urgencyScore: {
    fontSize: 20,
    fontWeight: 700,
    color: "white",
  },
  meterContainer: {
    padding: "12px 16px",
  },
  meterTrack: {
    height: 6,
    background: "#1f2937",
    borderRadius: 3,
    overflow: "hidden",
  },
  meterFill: {
    height: "100%",
    borderRadius: 3,
    transition: "width 0.5s ease",
  },
  meterLabels: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 10,
    color: "#6b7280",
    marginTop: 4,
  },
  section: {
    padding: "12px 16px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  sectionLabel: {
    fontSize: 11,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: 6,
    fontWeight: 600,
  },
  typeRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  disasterType: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "0.03em",
  },
  locationText: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 2,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 1.5,
    margin: 0,
  },
  rationaleBox: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    background: "rgba(59,130,246,0.08)",
    border: "1px solid rgba(59,130,246,0.2)",
    borderRadius: 6,
    padding: "10px 12px",
  },
  rationaleIcon: {
    fontSize: 16,
    flexShrink: 0,
    marginTop: 1,
  },
  rationaleText: {
    fontSize: 13,
    lineHeight: 1.5,
    margin: 0,
    color: "#d1d5db",
  },
  responseBox: {
    fontSize: 13,
    background: "#1f2937",
    padding: "10px 12px",
    borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.08)",
    lineHeight: 1.4,
  },
  detailGrid: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
  },
  detailLabel: {
    color: "#6b7280",
  },
  detailValue: {
    color: "#d1d5db",
    fontWeight: 500,
  },
  rawText: {
    fontSize: 12,
    color: "#9ca3af",
    background: "#0d1117",
    padding: "10px 12px",
    borderRadius: 6,
    lineHeight: 1.5,
    maxHeight: 120,
    overflowY: "auto" as const,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  alertBadge: {
    margin: "12px 16px",
    padding: "8px 12px",
    background: "rgba(239,68,68,0.15)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    color: "#ef4444",
    textAlign: "center" as const,
  },
};
