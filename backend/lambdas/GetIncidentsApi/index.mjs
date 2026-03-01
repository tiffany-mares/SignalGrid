import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME || "CrisisPulseIncidents";

const dynamoClient = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(dynamoClient);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function buildFilterExpression(params) {
  const expressions = [];
  const attrValues = {};
  const attrNames = {};

  // Only return classified incidents
  expressions.push("classified = :cl");
  attrValues[":cl"] = true;

  // ?type=flood — filter by disaster type
  if (params.type && params.type !== "all") {
    expressions.push("disaster_type = :dt");
    attrValues[":dt"] = params.type;
  }

  // ?minUrgency=50 — minimum urgency score
  if (params.minUrgency) {
    expressions.push("urgency_score >= :ms");
    attrValues[":ms"] = parseInt(params.minUrgency, 10);
  }

  // ?since=2026-02-28T10:00:00Z — only incidents after this ISO timestamp
  // also accepts hours shorthand: ?since=6h, ?since=24h
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

export const handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS" || event.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const params = event.queryStringParameters || {};

    const filter = buildFilterExpression(params);

    const scanParams = {
      TableName: TABLE_NAME,
      FilterExpression: filter.expression,
      ExpressionAttributeValues: filter.values,
    };

    if (filter.names) {
      scanParams.ExpressionAttributeNames = filter.names;
    }

    // Paginate through all results
    let items = [];
    let lastKey = undefined;

    do {
      if (lastKey) scanParams.ExclusiveStartKey = lastKey;

      const resp = await dynamo.send(new ScanCommand(scanParams));
      items = items.concat(resp.Items || []);
      lastKey = resp.LastEvaluatedKey;
    } while (lastKey);

    // Sort by timestamp descending (newest first)
    items.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

    // Apply limit
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
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
