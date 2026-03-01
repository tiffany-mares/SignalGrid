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
  const [filters, setFilters] = useState<IncidentFilters>({ limit: 200 });

  const handleClosePanel = useCallback(() => setSelectedIncident(null), []);
  const filtersRef = useRef(filters);

  // Full fetch — used on initial load and when filters change
  const loadIncidents = useCallback(async (f: IncidentFilters) => {
    try {
      setLoading(true);
      const data = await fetchIncidents({ ...f, limit: f.limit || 200 });
      setIncidents(data.incidents);
      incidentsRef.current = data.incidents;
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  // Incremental poll — fetches only incidents newer than what we have
  const pollForNew = useCallback(async () => {
    const current = incidentsRef.current;
    if (current.length === 0) return;

    const latestTimestamp = current.reduce(
      (latest, i) => (i.timestamp > latest ? i.timestamp : latest),
      ""
    );

    try {
      setLoading(true);
      const f = filtersRef.current;
      const data = await fetchIncidents({
        ...f,
        since: latestTimestamp,
        limit: 50,
      });

      if (data.incidents.length > 0) {
        const existingIds = new Set(current.map((i) => i.incident_id));
        const newOnes = data.incidents.filter(
          (i) => !existingIds.has(i.incident_id)
        );

        if (newOnes.length > 0) {
          const merged = [...newOnes, ...current];
          setIncidents(merged);
          incidentsRef.current = merged;
          console.log(`[Poll] ${newOnes.length} new incidents merged`);
        }
      }
      setError(null);
    } catch (err) {
      console.log(`[Poll] error: ${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFiltersChange = useCallback(
    (newFilters: IncidentFilters) => {
      setFilters(newFilters);
      filtersRef.current = newFilters;
      loadIncidents(newFilters);
    },
    [loadIncidents]
  );

  // Initial full fetch + incremental polling every 30s
  useEffect(() => {
    loadIncidents(filters);

    const interval = setInterval(pollForNew, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

      <FilterBar
        filters={filters}
        onChange={handleFiltersChange}
        incidentCount={incidents.length}
        loading={loading}
      />

      {selectedIncident && (
        <IncidentPanel incident={selectedIncident} onClose={handleClosePanel} />
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(239,68,68,0.9)",
            color: "white",
            padding: "8px 16px",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "system-ui, sans-serif",
            zIndex: 10,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
