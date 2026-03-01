import os
import json
import re

import boto3

BEDROCK_REGION = os.environ.get("BEDROCK_REGION", "us-east-1")
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")
TABLE_NAME = os.environ.get("INCIDENTS_TABLE", "Incidents")

bedrock = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)
dynamodb = boto3.resource("dynamodb", region_name=BEDROCK_REGION)
table = dynamodb.Table(TABLE_NAME)

SYSTEM_PROMPT = """You are a disaster classification AI. Given a text snippet about a potential disaster or emergency, analyze it and return ONLY valid JSON with these exact fields:

{
  "disaster_type": "<one of: flood, fire, storm, earthquake, volcanic, drought, avalanche, chemical, other>",
  "urgency_score": <integer 0-100, where 0=not urgent, 100=catastrophic>,
  "location_text": "<city, region, country extracted from the text>",
  "summary": "<one sentence summary of the incident>",
  "confidence": <float 0.0-1.0, your confidence in this classification>,
  "recommended_response": "<short recommended action: e.g. evacuate, shelter-in-place, send medical aid, monitor, send water/food>"
}

Scoring guide for urgency_score:
- 0-20: Minor incident, no immediate danger (small tremor, contained brush fire)
- 21-40: Moderate, localized impact (minor flooding, small fire near structures)
- 41-60: Significant, affecting community (city-level flooding, growing wildfire)
- 61-80: Severe, large-scale impact (major earthquake damage, hurricane landfall, mass evacuation)
- 81-100: Critical/catastrophic, mass casualties likely (M7+ earthquake in populated area, dam breach, Category 4+ hurricane)

Return ONLY the JSON object. No markdown, no explanation, no extra text."""


def score_to_label(score: int) -> str:
    if score >= 81:
        return "critical"
    if score >= 61:
        return "high"
    if score >= 41:
        return "medium"
    if score >= 21:
        return "low"
    return "low"


def extract_json(raw: str) -> dict:
    """Extract JSON from model response, handling markdown fences or extra text."""
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if fence_match:
        raw = fence_match.group(1)

    brace_match = re.search(r"\{[\s\S]*\}", raw)
    if brace_match:
        return json.loads(brace_match.group(0))

    return json.loads(raw)


def classify_text(text: str) -> dict:
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 512,
        "temperature": 0.1,
        "system": SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": f"Classify this incident report:\n\n{text}",
            }
        ],
    })

    response = bedrock.invoke_model(
        modelId=MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=body,
    )

    result = json.loads(response["body"].read())
    raw_text = result["content"][0]["text"]

    return extract_json(raw_text)


def update_incident(incident_id: str, classification: dict):
    urgency_score = int(classification.get("urgency_score", 0))

    table.update_item(
        Key={"incident_id": incident_id},
        UpdateExpression=(
            "SET disaster_type = :dt, "
            "urgency_score = :us, "
            "urgency_label = :ul, "
            "location_text = :lt, "
            "summary = :sm, "
            "confidence = :cf, "
            "recommended_response = :rr, "
            "classified = :cl"
        ),
        ExpressionAttributeValues={
            ":dt": classification.get("disaster_type", "other"),
            ":us": urgency_score,
            ":ul": score_to_label(urgency_score),
            ":lt": classification.get("location_text", ""),
            ":sm": classification.get("summary", ""),
            ":cf": str(classification.get("confidence", 0)),
            ":rr": classification.get("recommended_response", ""),
            ":cl": True,
        },
    )


def handler(event, context):
    """
    Can be invoked two ways:

    1. Direct invocation with a single incident:
       { "incident_id": "...", "text": "..." }

    2. Batch mode — scans for unclassified incidents:
       { "batch": true }
    """
    batch_mode = event.get("batch", False)

    if batch_mode:
        return handle_batch()

    return handle_single(event)


def handle_single(event: dict) -> dict:
    incident_id = event.get("incident_id", "")
    text = event.get("text", "")

    if not text:
        return {"statusCode": 400, "body": "Missing 'text' field"}

    print(f"Classifying incident {incident_id}: {text[:100]}...")

    try:
        classification = classify_text(text)
        print(f"Classification: {json.dumps(classification)}")

        if incident_id:
            update_incident(incident_id, classification)
            print(f"Updated incident {incident_id} in DynamoDB")

        return {
            "statusCode": 200,
            "body": {
                "incident_id": incident_id,
                "classification": classification,
            },
        }
    except Exception as e:
        print(f"ERROR classifying incident {incident_id}: {e}")
        return {"statusCode": 500, "body": str(e)}


def handle_batch() -> dict:
    """Scan for unclassified incidents and classify them."""
    from boto3.dynamodb.conditions import Attr

    print("Batch mode: scanning for unclassified incidents...")

    resp = table.scan(
        FilterExpression=Attr("classified").eq(False) | Attr("classified").not_exists(),
        Limit=25,
    )

    items = resp.get("Items", [])
    print(f"Found {len(items)} unclassified incidents")

    classified_count = 0
    errors = 0

    for item in items:
        incident_id = item["incident_id"]
        text = item.get("text", "")

        if not text:
            continue

        try:
            classification = classify_text(text)
            update_incident(incident_id, classification)
            classified_count += 1
            print(f"  Classified {incident_id}: {classification.get('disaster_type')} "
                  f"(urgency={classification.get('urgency_score')})")
        except Exception as e:
            errors += 1
            print(f"  ERROR on {incident_id}: {e}")

    result = {
        "statusCode": 200,
        "body": {
            "scanned": len(items),
            "classified": classified_count,
            "errors": errors,
        },
    }
    print(f"Batch result: {result}")
    return result
