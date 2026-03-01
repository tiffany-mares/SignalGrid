import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Incident, IncidentFilters } from "../types/incident";
import { fetchIncidents } from "../services/api";
import IncidentPanel from "./IncidentPanel";
import FilterBar from "./FilterBar";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || "";

const URGENCY_COLORS: Record<string, string> = {
  low: "#3b82f6",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

function incidentsToGeoJSON(
  incidents: Incident[]
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: incidents
      .filter((i) => i.lat != null && i.lng != null)
      .map((i) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [i.lng!, i.lat!],
        },
        properties: {
          incident_id: i.incident_id,
          disaster_type: i.disaster_type,
          urgency_score: i.urgency_score,
          urgency_label: i.urgency_label,
          location_text: i.location_text,
          summary: i.summary,
          recommended_response: i.recommended_response,
          confidence: i.confidence,
          timestamp: i.timestamp,
        },
      })),
  };
}

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const incidentsRef = useRef<Incident[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  const handleClosePanel = useCallback(() => setSelectedIncident(null), []);

  // Fetch incidents from API
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const data = await fetchIncidents({ limit: 200 });
        if (!cancelled) {
          setIncidents(data.incidents);
          incidentsRef.current = data.incidents;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // Poll every 30 seconds for new incidents
    const interval = setInterval(load, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [0, 20],
      zoom: 2,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      // Incident circles source
      map.addSource("incidents", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Heatmap layer (shows density at low zoom)
      map.addLayer({
        id: "incidents-heat",
        type: "heatmap",
        source: "incidents",
        maxzoom: 8,
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "urgency_score"],
            0, 0.1,
            50, 0.5,
            100, 1,
          ],
          "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0, 0.5,
            8, 2,
          ],
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0, 15,
            8, 30,
          ],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.2, "#3b82f6",
            0.4, "#f59e0b",
            0.6, "#f97316",
            0.8, "#ef4444",
            1.0, "#dc2626",
          ],
          "heatmap-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            6, 0.9,
            8, 0,
          ],
        },
      });

      // Circle markers (visible at higher zoom)
      map.addLayer({
        id: "incidents-circle",
        type: "circle",
        source: "incidents",
        minzoom: 4,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "urgency_score"],
            0, 5,
            50, 9,
            100, 16,
          ],
          "circle-color": [
            "match",
            ["get", "urgency_label"],
            "critical", URGENCY_COLORS.critical,
            "high", URGENCY_COLORS.high,
            "medium", URGENCY_COLORS.medium,
            "low", URGENCY_COLORS.low,
            "#6b7280",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.85,
        },
      });

      // Open detail panel on click
      map.on("click", "incidents-circle", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;

        const clickedId = feature.properties?.incident_id;
        const match = incidentsRef.current.find((i) => i.incident_id === clickedId);
        if (match) {
          setSelectedIncident(match);
          if (feature.geometry.type === "Point") {
            const coords = feature.geometry.coordinates as [number, number];
            map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 5), duration: 800 });
          }
        }
      });

      // Cursor pointer on hover
      map.on("mouseenter", "incidents-circle", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "incidents-circle", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update map data when incidents change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateSource = () => {
      const source = map.getSource("incidents") as mapboxgl.GeoJSONSource;
      if (source) {
        source.setData(incidentsToGeoJSON(incidents));
      }
    };

    if (map.isStyleLoaded()) {
      updateSource();
    } else {
      map.on("load", updateSource);
    }
  }, [incidents]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />

      {/* Right-side incident detail panel */}
      {selectedIncident && (
        <IncidentPanel incident={selectedIncident} onClose={handleClosePanel} />
      )}

      {/* Status overlay */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          background: "rgba(17,24,39,0.9)",
          color: "#e5e7eb",
          padding: "10px 16px",
          borderRadius: 8,
          fontSize: 13,
          fontFamily: "system-ui, sans-serif",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <strong style={{ fontSize: 15 }}>CrisisPulse</strong>
        <div style={{ marginTop: 4, color: "#9ca3af" }}>
          {loading
            ? "Loading incidents..."
            : error
              ? `Error: ${error}`
              : `${incidents.length} incidents loaded`}
        </div>
      </div>
    </div>
  );
}
