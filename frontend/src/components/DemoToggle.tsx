import { useState } from "react";
import { injectDemoIncidents } from "../services/api";

interface DemoToggleProps {
  onInjected: () => void;
}

export default function DemoToggle({ onInjected }: DemoToggleProps) {
  const [open, setOpen] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleInject = async () => {
    setInjecting(true);
    setResult(null);
    try {
      const data = await injectDemoIncidents();
      setResult(`${data.count} incidents injected`);
      onInjected();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Failed");
    } finally {
      setInjecting(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={styles.toggleBtn}>
        Demo
      </button>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>Demo Mode</span>
        <button onClick={() => setOpen(false)} style={styles.closeBtn}>✕</button>
      </div>

      <p style={styles.desc}>
        Inject 10 pre-classified incidents across the globe. The heatmap will
        light up immediately.
      </p>

      <button
        onClick={handleInject}
        disabled={injecting}
        style={{
          ...styles.injectBtn,
          opacity: injecting ? 0.6 : 1,
        }}
      >
        {injecting ? "Injecting..." : "Inject Demo Incidents"}
      </button>

      {result && (
        <div style={styles.result}>
          {result}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toggleBtn: {
    position: "absolute",
    bottom: 20,
    right: 20,
    background: "rgba(17,24,39,0.9)",
    color: "#9ca3af",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
    backdropFilter: "blur(8px)",
    zIndex: 10,
  },
  panel: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 280,
    background: "rgba(17,24,39,0.95)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 16,
    fontFamily: "system-ui, sans-serif",
    color: "#e5e7eb",
    backdropFilter: "blur(12px)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    zIndex: 10,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#6b7280",
    fontSize: 16,
    cursor: "pointer",
    padding: "2px 6px",
  },
  desc: {
    fontSize: 12,
    color: "#9ca3af",
    lineHeight: 1.5,
    margin: "0 0 14px",
  },
  injectBtn: {
    width: "100%",
    padding: "10px 0",
    background: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
    transition: "opacity 0.2s",
  },
  result: {
    marginTop: 10,
    fontSize: 12,
    color: "#22c55e",
    textAlign: "center" as const,
    fontWeight: 500,
  },
};
