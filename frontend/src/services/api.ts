import type { IncidentFilters, IncidentsResponse } from "../types/incident";

const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function fetchIncidents(
  filters: IncidentFilters = {}
): Promise<IncidentsResponse> {
  const params = new URLSearchParams();

  if (filters.type && filters.type !== "all") params.set("type", filters.type);
  if (filters.minUrgency) params.set("minUrgency", String(filters.minUrgency));
  if (filters.since) params.set("since", filters.since);
  if (filters.limit) params.set("limit", String(filters.limit));

  const query = params.toString();
  const url = `${API_BASE}/incidents${query ? `?${query}` : ""}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);

  return resp.json();
}

export async function injectDemoIncidents(): Promise<{ message: string; count: number }> {
  const resp = await fetch(`${API_BASE}/inject-demo`, { method: "POST" });
  if (!resp.ok) throw new Error(`Inject failed: ${resp.status}`);
  return resp.json();
}
