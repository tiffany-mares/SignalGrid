import os
import json
import uuid
import hashlib
import time
import random
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr

TABLE_NAME = os.environ.get("INCIDENTS_TABLE", "Incidents")
TTL_DAYS = int(os.environ.get("TTL_DAYS", "30"))
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "5"))
SAMPLE_FILE = os.environ.get(
    "SAMPLE_FILE",
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "sample_incidents.json"),
)

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


def generate_source_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def is_duplicate(source_hash: str) -> bool:
    resp = table.scan(
        FilterExpression=Attr("source_hash").eq(source_hash),
        ProjectionExpression="incident_id",
        Limit=1,
    )
    return len(resp.get("Items", [])) > 0


def load_sample_data() -> list[dict]:
    with open(SAMPLE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def build_incident(entry: dict) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    text = entry["text"]

    return {
        "incident_id": str(uuid.uuid4()),
        "timestamp": now,
        "original_timestamp": entry.get("timestamp", now),
        "source": "synthetic",
        "source_feed": "sample_incidents",
        "source_url": "",
        "source_hash": generate_source_hash(text),
        "text": text[:2000],
        "disaster_type": "unclassified",
        "urgency_score": 0,
        "urgency_label": "unclassified",
        "summary": text[:140],
        "location_text": entry.get("location_text", ""),
        "lat": entry.get("lat"),
        "lng": entry.get("lng"),
        "confidence": 0,
        "recommended_response": "",
        "classified": False,
        "expires_at": int(time.time()) + (TTL_DAYS * 86400),
    }


def store_incidents(incidents: list[dict]) -> int:
    stored = 0
    with table.batch_writer() as batch:
        for incident in incidents:
            clean = {k: v for k, v in incident.items() if v is not None}
            batch.put_item(Item=clean)
            stored += 1
    return stored


def handler(event, context):
    samples = load_sample_data()
    random.shuffle(samples)

    candidates = []
    for entry in samples:
        incident = build_incident(entry)

        if is_duplicate(incident["source_hash"]):
            continue

        candidates.append(incident)
        if len(candidates) >= BATCH_SIZE:
            break

    print(f"Selected {len(candidates)} new items from {len(samples)} total samples")

    stored = store_incidents(candidates)
    print(f"Stored {stored} synthetic incidents")

    result = {
        "statusCode": 200,
        "body": {
            "samples_available": len(samples),
            "items_ingested": stored,
            "batch_size": BATCH_SIZE,
        },
    }
    print(f"Result: {result}")
    return result
