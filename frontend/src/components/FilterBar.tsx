import { useState } from "react";
import type { IncidentFilters } from "../types/incident";

const DISASTER_TYPES = [
  { value: "all", label: "All Types" },
  { value: "flood", label: "Flood" },
  { value: "fire", label: "Fire" },
  { value: "storm", label: "Storm" },
  { value: "earthquake", label: "Earthquake" },
  { value: "volcanic", label: "Volcanic" },
  { value: "drought", label: "Drought" },
  { value: "avalanche", label: "Avalanche" },
  { value: "chemical", label: "Chemical" },
  { value: "other", label: "Other" },
];

const TIME_WINDOWS = [
  { value: "", label: "All Time" },
  { value: "1h", label: "Last 1h" },
  { value: "6h", label: "Last 6h" },
  { value: "24h", label: "Last 24h" },
  { value: "72h", label: "Last 3d" },
];

const URGENCY_LABELS: Record<number, string> = {
  0: "All (0+)",
  25: "Medium+ (25+)",
  50: "High+ (50+)",
  75: "Critical (75+)",
};

interface FilterBarProps {
  filters: IncidentFilters;
  onChange: (filters: IncidentFilters) => void;
  incidentCount: number;
  loading: boolean;
}

export default function FilterBar({
  filters,
  onChange,
  incidentCount,
  loading,
}: FilterBarProps) {
  const [urgency, setUrgency] = useState(filters.minUrgency || 0);

  const update = (partial: Partial<IncidentFilters>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <div style={styles.bar}>
      {/* Brand */}
      <div style={styles.brand}>
        <span style={styles.brandIcon}>◉</span>
        <strong style={styles.brandName}>CrisisPulse</strong>
        <span style={styles.badge}>
          {loading ? "…" : incidentCount}
        </span>
      </div>

      <div style={styles.divider} />

      {/* Time window */}
      <div style={styles.filterGroup}>
        <label style={styles.label}>Time</label>
        <select
          style={styles.select}
          value={filters.since || ""}
          onChange={(e) => update({ since: e.target.value || undefined })}
        >
          {TIME_WINDOWS.map((tw) => (
            <option key={tw.value} value={tw.value}>
              {tw.label}
            </option>
          ))}
        </select>
      </div>

      {/* Disaster type */}
      <div style={styles.filterGroup}>
        <label style={styles.label}>Type</label>
        <select
          style={styles.select}
          value={filters.type || "all"}
          onChange={(e) =>
            update({ type: e.target.value === "all" ? undefined : e.target.value })
          }
        >
          {DISASTER_TYPES.map((dt) => (
            <option key={dt.value} value={dt.value}>
              {dt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Urgency slider */}
      <div style={styles.filterGroup}>
        <label style={styles.label}>
          Min Urgency: <span style={{ color: urgencyColor(urgency) }}>{URGENCY_LABELS[urgency] || `${urgency}+`}</span>
        </label>
        <div style={styles.sliderRow}>
          <input
            type="range"
            min={0}
            max={75}
            step={25}
            value={urgency}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setUrgency(val);
              update({ minUrgency: val || undefined });
            }}
            style={styles.slider}
          />
        </div>
      </div>

      {/* Live indicator */}
      <div style={styles.liveIndicator}>
        <span
          style={{
            ...styles.liveDot,
            background: loading ? "#f59e0b" : "#22c55e",
          }}
        />
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          {loading ? "Updating..." : "Live"}
        </span>
      </div>
    </div>
  );
}

function urgencyColor(score: number): string {
  if (score >= 75) return "#ef4444";
  if (score >= 50) return "#f97316";
  if (score >= 25) return "#f59e0b";
  return "#3b82f6";
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    display: "flex",
    alignItems: "center",
    gap: 16,
    background: "rgba(17,24,39,0.92)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding: "10px 18px",
    zIndex: 10,
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#e5e7eb",
    flexWrap: "wrap",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
  },
  brandIcon: {
    fontSize: 18,
    color: "#ef4444",
  },
  brandName: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  badge: {
    background: "#1f2937",
    border: "1px solid rgba(255,255,255,0.1)",
    padding: "2px 8px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    color: "#9ca3af",
    minWidth: 28,
    textAlign: "center" as const,
  },
  divider: {
    width: 1,
    height: 28,
    background: "rgba(255,255,255,0.1)",
  },
  filterGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 3,
  },
  label: {
    fontSize: 10,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    fontWeight: 600,
  },
  select: {
    background: "#1f2937",
    color: "#e5e7eb",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    padding: "5px 10px",
    fontSize: 13,
    cursor: "pointer",
    outline: "none",
    minWidth: 100,
  },
  sliderRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  slider: {
    width: 120,
    accentColor: "#ef4444",
    cursor: "pointer",
  },
  liveIndicator: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    display: "inline-block",
    animation: "pulse 2s infinite",
  },
};
