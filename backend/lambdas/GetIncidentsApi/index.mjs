import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import crypto from "crypto";

const TABLE_NAME = process.env.TABLE_NAME || "CrisisPulseIncidents";
const TTL_DAYS = parseInt(process.env.TTL_DAYS || "7", 10);

const dynamoClient = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(dynamoClient);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

// ── Demo incidents (pre-classified, ready to plot) ────────────────────────

const DEMO_INCIDENTS = [
  { disaster_type: "earthquake", urgency_score: 92, urgency_label: "critical", location_text: "Malatya, Turkey", lat: 38.35, lng: 38.31, summary: "M7.1 earthquake causes widespread building collapse in central Turkey", recommended_response: "Deploy search and rescue teams immediately", confidence: 0.96 },
  { disaster_type: "flood", urgency_score: 78, urgency_label: "critical", location_text: "Houston, TX, USA", lat: 29.76, lng: -95.37, summary: "Severe urban flooding with water reaching car rooftops on major highways", recommended_response: "Launch boat rescues, open emergency shelters", confidence: 0.93 },
  { disaster_type: "storm", urgency_score: 88, urgency_label: "critical", location_text: "Barbados, Caribbean", lat: 13.19, lng: -59.54, summary: "Category 4 hurricane with 150mph winds approaching island", recommended_response: "Evacuate coastal areas, seek shelter immediately", confidence: 0.95 },
  { disaster_type: "fire", urgency_score: 72, urgency_label: "high", location_text: "South Lake Tahoe, CA, USA", lat: 38.94, lng: -119.98, summary: "Wildfire jumping containment lines forcing evacuation of 30,000 residents", recommended_response: "Mandatory evacuation, deploy air tankers", confidence: 0.91 },
  { disaster_type: "earthquake", urgency_score: 85, urgency_label: "critical", location_text: "Kathmandu, Nepal", lat: 27.72, lng: 85.32, summary: "M7.8 earthquake causes major structural collapse and hospital damage", recommended_response: "International search and rescue, medical teams", confidence: 0.94 },
  { disaster_type: "flood", urgency_score: 68, urgency_label: "high", location_text: "Sylhet, Bangladesh", lat: 24.90, lng: 91.87, summary: "District 80% underwater with 500,000 displaced and supplies critically low", recommended_response: "Send food, water, and medicine by helicopter", confidence: 0.90 },
  { disaster_type: "chemical", urgency_score: 82, urgency_label: "critical", location_text: "Tianjin, China", lat: 39.08, lng: 117.20, summary: "Chemical plant explosion with massive fireball overwhelming emergency services", recommended_response: "Shelter in place, hazmat teams needed", confidence: 0.88 },
  { disaster_type: "storm", urgency_score: 65, urgency_label: "high", location_text: "Moore, OK, USA", lat: 35.34, lng: -97.49, summary: "Tornado damages multiple structures and knocks out power for 15,000 homes", recommended_response: "Emergency power restoration, damage assessment", confidence: 0.92 },
  { disaster_type: "volcanic", urgency_score: 70, urgency_label: "high", location_text: "Mount Etna, Sicily, Italy", lat: 37.75, lng: 14.99, summary: "Volcanic eruption sending lava flow toward Catania suburbs", recommended_response: "Evacuate suburbs, close airport, divert flights", confidence: 0.89 },
  { disaster_type: "flood", urgency_score: 55, urgency_label: "high", location_text: "Seoul, South Korea", lat: 37.57, lng: 126.98, summary: "Record rainfall puts Han River at highest level in 50 years, subways flooded", recommended_response: "Activate emergency shelters, suspend transit", confidence: 0.87 },
];

// ── Route: GET /incidents ─────────────────────────────────────────────────

function buildFilterExpression(params) {
  const expressions = [];
  const attrValues = {};
  const attrNames = {};

  expressions.push("classified = :cl");
  attrValues[":cl"] = true;

  if (params.type && params.type !== "all") {
    expressions.push("disaster_type = :dt");
    attrValues[":dt"] = params.type;
  }

  if (params.minUrgency) {
    expressions.push("urgency_score >= :ms");
    attrValues[":ms"] = parseInt(params.minUrgency, 10);
  }

  if (params.since) {
    let cutoff;
    const hoursMatch = params.since.match(/^(\d+)h$/);
    if (hoursMatch) {
      cutoff = new Date(
        Date.now() - parseInt(hoursMatch[1], 10) * 3600000
      ).toISOString();
    } else {
      cutoff = params.since;
    }
    expressions.push("#ts >= :cutoff");
    attrValues[":cutoff"] = cutoff;
    attrNames["#ts"] = "timestamp";
  }

  return {
    expression: expressions.join(" AND "),
    values: attrValues,
    names: Object.keys(attrNames).length > 0 ? attrNames : undefined,
  };
}

async function handleGetIncidents(params) {
  const filter = buildFilterExpression(params);

  const scanParams = {
    TableName: TABLE_NAME,
    FilterExpression: filter.expression,
    ExpressionAttributeValues: filter.values,
  };

  if (filter.names) {
    scanParams.ExpressionAttributeNames = filter.names;
  }

  let items = [];
  let lastKey = undefined;

  do {
    if (lastKey) scanParams.ExclusiveStartKey = lastKey;
    const resp = await dynamo.send(new ScanCommand(scanParams));
    items = items.concat(resp.Items || []);
    lastKey = resp.LastEvaluatedKey;
  } while (lastKey);

  items.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

  const limit = parseInt(params.limit || "100", 10);
  const limited = items.slice(0, limit);

  console.log(
    `Returning ${limited.length} of ${items.length} incidents (filters: ${JSON.stringify(params)})`
  );

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      count: limited.length,
      total: items.length,
      incidents: limited,
    }),
  };
}

// ── Route: POST /inject-demo ──────────────────────────────────────────────

async function handleInjectDemo() {
  const now = new Date();
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_DAYS * 86400;

  const items = DEMO_INCIDENTS.map((demo, i) => {
    const timestamp = new Date(now.getTime() - i * 15000).toISOString();
    return {
      incident_id: `demo-${crypto.randomUUID().slice(0, 8)}`,
      timestamp,
      source: "demo",
      source_hash: crypto.createHash("sha256").update(demo.summary + timestamp).digest("hex").slice(0, 16),
      text: demo.summary,
      disaster_type: demo.disaster_type,
      urgency_score: demo.urgency_score,
      urgency_label: demo.urgency_label,
      location_text: demo.location_text,
      lat: demo.lat,
      lng: demo.lng,
      summary: demo.summary,
      confidence: demo.confidence,
      recommended_response: demo.recommended_response,
      classified: true,
      expires_at: expiresAt,
    };
  });

  // DynamoDB BatchWrite supports max 25 items per call
  const batches = [];
  for (let i = 0; i < items.length; i += 25) {
    batches.push(items.slice(i, i + 25));
  }

  let written = 0;
  for (const batch of batches) {
    await dynamo.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((item) => ({
            PutRequest: { Item: item },
          })),
        },
      })
    );
    written += batch.length;
  }

  console.log(`[Demo] Injected ${written} demo incidents`);

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      message: `Injected ${written} demo incidents`,
      count: written,
    }),
  };
}

// ── Lambda Handler (router) ───────────────────────────────────────────────

export const handler = async (event) => {
  const method =
    event.httpMethod || event.requestContext?.http?.method || "GET";
  const path = event.path || event.rawPath || "/";

  if (method === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    if (path.endsWith("/inject-demo") && method === "POST") {
      return await handleInjectDemo();
    }

    return await handleGetIncidents(event.queryStringParameters || {});
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
