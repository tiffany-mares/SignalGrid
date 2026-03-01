export interface Incident {
  incident_id: string;
  timestamp: string;
  original_timestamp?: string;
  source: string;
  source_hash?: string;
  text: string;
  disaster_type: string;
  urgency_score: number;
  urgency_label: "low" | "medium" | "high" | "critical";
  location_text: string;
  lat?: number;
  lng?: number;
  summary: string;
  confidence: number;
  recommended_response: string;
  urgency_rationale?: string;
  classified: boolean;
  expires_at?: number;
}

export interface IncidentsResponse {
  count: number;
  total: number;
  incidents: Incident[];
}

export interface IncidentFilters {
  type?: string;
  minUrgency?: number;
  since?: string;
  limit?: number;
}
