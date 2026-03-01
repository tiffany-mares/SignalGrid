import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import crypto from "crypto";
import https from "https";

// ── Config ─────────────────────────────────────────────────────────────────

const TABLE_NAME = process.env.TABLE_NAME || "CrisisPulseIncidents";
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || "";
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || "";
const MODEL_ID =
  process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0";
const DATA_BUCKET = process.env.DATA_BUCKET || "";
const DATA_KEY = process.env.DATA_KEY || "synthetic_posts.json";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "5", 10);
const ALERT_THRESHOLD = parseInt(process.env.ALERT_THRESHOLD || "75", 10);
const TTL_DAYS = parseInt(process.env.TTL_DAYS || "30", 10);

// ── AWS Clients ────────────────────────────────────────────────────────────

const s3 = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(dynamoClient);
const bedrock = new BedrockRuntimeClient({});
const sns = new SNSClient({});

// ── Bedrock Prompt ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a disaster classification AI. Given a text snippet about a potential disaster or emergency, analyze it and return ONLY valid JSON with these exact fields:

{
  "disaster_type": "<one of: flood, fire, storm, earthquake, volcanic, drought, avalanche, chemical, other>",
  "urgency_score": <integer 0-100>,
  "location_text": "<city, region, country extracted from text>",
  "summary": "<one sentence summary>",
  "confidence": <float 0.0-1.0>,
  "recommended_response": "<short action: evacuate, shelter-in-place, send medical aid, monitor, send water/food>"
}

Scoring guide:
- 0-24: Low — minor, no immediate danger
- 25-49: Medium — moderate, localized impact
- 50-74: High — significant, large-scale impact
- 75-100: Critical — catastrophic, mass casualties likely

Return ONLY the JSON object. No markdown, no explanation, no extra text.`;

// ── Helpers ────────────────────────────────────────────────────────────────

function sourceHash(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function scoreToLabel(score) {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── S3: Load synthetic posts ───────────────────────────────────────────────

async function loadPostsFromS3() {
  const resp = await s3.send(
    new GetObjectCommand({ Bucket: DATA_BUCKET, Key: DATA_KEY })
  );
  const body = await resp.Body.transformToString();
  return JSON.parse(body);
}

// ── DynamoDB: De-dupe check ────────────────────────────────────────────────

async function getExistingHashes() {
  const resp = await dynamo.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      ProjectionExpression: "source_hash",
    })
  );
  return new Set((resp.Items || []).map((i) => i.source_hash));
}

// ── DynamoDB: Store incident ───────────────────────────────────────────────

async function storeIncident(incident) {
  const clean = {};
  for (const [k, v] of Object.entries(incident)) {
    if (v !== null && v !== undefined && v !== "") {
      clean[k] = v;
    }
  }
  await dynamo.send(new PutCommand({ TableName: TABLE_NAME, Item: clean }));
}

// ── Bedrock: Classify ──────────────────────────────────────────────────────

async function classify(text) {
  const payload = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 512,
    temperature: 0.1,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: `Classify this incident report:\n\n${text}` },
    ],
  });

  const resp = await bedrock.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: payload,
    })
  );

  const result = JSON.parse(new TextDecoder().decode(resp.body));
  const raw = result.content[0].text;

  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    return JSON.parse(braceMatch[0]);
  }
  return JSON.parse(raw);
}

// ── Mapbox: Geocode ────────────────────────────────────────────────────────

function geocode(locationText) {
  if (!MAPBOX_TOKEN || !locationText) {
    return Promise.resolve({ lat: null, lng: null });
  }

  const encoded = encodeURIComponent(locationText);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${MAPBOX_TOKEN}&limit=1`;

  return new Promise((resolve) => {
    https
      .get(url, { timeout: 5000 }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            const features = parsed.features || [];
            if (features.length > 0) {
              const [lng, lat] = features[0].center;
              console.log(`  Geocode: '${locationText}' → (${lat}, ${lng})`);
              resolve({ lat, lng });
            } else {
              console.log(`  Geocode: no results for '${locationText}'`);
              resolve({ lat: null, lng: null });
            }
          } catch {
            resolve({ lat: null, lng: null });
          }
        });
      })
      .on("error", (err) => {
        console.log(`  Geocode error: ${err.message}`);
        resolve({ lat: null, lng: null });
      });
  });
}

// ── SNS: Alert ─────────────────────────────────────────────────────────────

async function sendAlert(incident) {
  if (!SNS_TOPIC_ARN) {
    console.log("  [SNS] No topic ARN configured, skipping");
    return;
  }

  const subject = `CRISISPULSE [${incident.urgency_label.toUpperCase()}]: ${incident.disaster_type} in ${incident.location_text}`;

  const message = [
    "CrisisPulse Critical Incident Alert",
    "=".repeat(50),
    "",
    `Type:       ${incident.disaster_type}`,
    `Urgency:    ${incident.urgency_score}/100 (${incident.urgency_label.toUpperCase()})`,
    `Location:   ${incident.location_text}`,
    `Summary:    ${incident.summary}`,
    `Response:   ${incident.recommended_response}`,
    `Time:       ${incident.timestamp}`,
    `Confidence: ${incident.confidence}`,
    "",
    `Incident ID: ${incident.incident_id}`,
  ].join("\n");

  try {
    await sns.send(
      new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Subject: subject.slice(0, 100),
        Message: message,
      })
    );
    console.log(`  [SNS] Alert sent for ${incident.incident_id}`);
  } catch (err) {
    console.log(`  [SNS] ERROR: ${err.message}`);
  }
}

// ── Pipeline: Process single incident ──────────────────────────────────────

async function processPost(post, hash) {
  const incidentId = crypto.randomUUID();
  const now = new Date().toISOString();

  console.log(`\nProcessing: ${post.text.slice(0, 80)}...`);

  // 1. Classify via Bedrock
  let classification;
  try {
    classification = await classify(post.text);
    console.log(
      `  Classified: ${classification.disaster_type} (urgency=${classification.urgency_score})`
    );
  } catch (err) {
    console.log(`  [Bedrock] ERROR: ${err.message}`);
    return null;
  }

  const urgencyScore = parseInt(classification.urgency_score, 10) || 0;

  // 2. Geocode
  let { lat, lng } = await geocode(
    classification.location_text || post.location_text
  );

  // 3. Build incident record
  const incident = {
    incident_id: incidentId,
    timestamp: now,
    original_timestamp: post.timestamp || now,
    source: "synthetic",
    source_hash: hash,
    text: post.text.slice(0, 2000),
    disaster_type: classification.disaster_type || "other",
    urgency_score: urgencyScore,
    urgency_label: scoreToLabel(urgencyScore),
    location_text: classification.location_text || post.location_text || "",
    lat: lat != null ? lat : undefined,
    lng: lng != null ? lng : undefined,
    summary: classification.summary || "",
    confidence: classification.confidence || 0,
    recommended_response: classification.recommended_response || "",
    classified: true,
    expires_at: Math.floor(Date.now() / 1000) + TTL_DAYS * 86400,
  };

  // 4. Store in DynamoDB
  await storeIncident(incident);
  console.log(`  Stored: ${incidentId}`);

  // 5. Alert if critical
  if (urgencyScore >= ALERT_THRESHOLD) {
    await sendAlert(incident);
  }

  return incident;
}

// ── Lambda Handler ─────────────────────────────────────────────────────────

export const handler = async (event) => {
  console.log("=".repeat(60));
  console.log(`CrisisPulse IngestAndClassify starting at ${new Date().toISOString()}`);
  console.log("=".repeat(60));

  // Load posts from S3
  let posts;
  try {
    posts = await loadPostsFromS3();
    console.log(`Loaded ${posts.length} posts from S3`);
  } catch (err) {
    console.log(`ERROR loading from S3: ${err.message}`);
    return { statusCode: 500, body: `S3 load failed: ${err.message}` };
  }

  // Get existing hashes for de-dupe
  const existingHashes = await getExistingHashes();
  console.log(`Found ${existingHashes.size} existing incidents in DynamoDB`);

  // Filter to new posts only, shuffle, take a batch
  const newPosts = [];
  const shuffled = shuffle(posts);

  for (const post of shuffled) {
    const hash = sourceHash(post.text);
    if (!existingHashes.has(hash)) {
      newPosts.push({ post, hash });
    }
    if (newPosts.length >= BATCH_SIZE) break;
  }

  console.log(`\n${newPosts.length} new posts to process (batch size: ${BATCH_SIZE})`);

  // Process each
  const stats = { processed: 0, classified: 0, alerts: 0, errors: 0 };

  for (const { post, hash } of newPosts) {
    try {
      const result = await processPost(post, hash);
      if (result) {
        stats.processed++;
        stats.classified++;
        if (result.urgency_score >= ALERT_THRESHOLD) {
          stats.alerts++;
        }
      }
    } catch (err) {
      stats.errors++;
      console.log(`  ERROR: ${err.message}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Pipeline complete: ${JSON.stringify(stats)}`);
  console.log("=".repeat(60));

  return { statusCode: 200, body: stats };
};
