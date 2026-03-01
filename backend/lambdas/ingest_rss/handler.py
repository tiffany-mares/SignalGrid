import os
import uuid
import hashlib
import time
from datetime import datetime, timezone

import boto3
import feedparser
from boto3.dynamodb.conditions import Attr

TABLE_NAME = os.environ.get("INCIDENTS_TABLE", "Incidents")
TTL_DAYS = int(os.environ.get("TTL_DAYS", "30"))

RSS_FEEDS = [
    {
        "name": "GDACS",
        "url": "https://www.gdacs.org/xml/rss.xml",
    },
    {
        "name": "ReliefWeb",
        "url": "https://reliefweb.int/updates/rss.xml",
    },
]

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


def generate_source_hash(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]


def is_duplicate(source_hash: str) -> bool:
    resp = table.scan(
        FilterExpression=Attr("source_hash").eq(source_hash),
        ProjectionExpression="incident_id",
        Limit=1,
    )
    return len(resp.get("Items", [])) > 0


def parse_entry(entry: dict, feed_name: str) -> dict:
    link = entry.get("link", "")
    published = entry.get("published", "")
    title = entry.get("title", "")
    description = entry.get("summary", entry.get("description", ""))

    if published:
        try:
            from email.utils import parsedate_to_datetime
            dt = parsedate_to_datetime(published)
            timestamp = dt.isoformat()
        except Exception:
            timestamp = datetime.now(timezone.utc).isoformat()
    else:
        timestamp = datetime.now(timezone.utc).isoformat()

    raw_text = f"{title}. {description}"

    return {
        "incident_id": str(uuid.uuid4()),
        "timestamp": timestamp,
        "source": "rss",
        "source_feed": feed_name,
        "source_url": link,
        "source_hash": generate_source_hash(link),
        "text": raw_text[:2000],
        "disaster_type": "unclassified",
        "urgency_score": 0,
        "urgency_label": "unclassified",
        "summary": title[:500],
        "location_text": "",
        "lat": None,
        "lng": None,
        "confidence": 0,
        "recommended_response": "",
        "classified": False,
        "expires_at": int(time.time()) + (TTL_DAYS * 86400),
    }


def fetch_feed(feed_config: dict) -> list[dict]:
    feed = feedparser.parse(feed_config["url"])
    candidates = []

    for entry in feed.entries:
        item = parse_entry(entry, feed_config["name"])

        if not item["source_url"]:
            continue

        if is_duplicate(item["source_hash"]):
            continue

        candidates.append(item)

    return candidates


def store_incidents(incidents: list[dict]) -> int:
    stored = 0
    with table.batch_writer() as batch:
        for incident in incidents:
            clean = {k: v for k, v in incident.items() if v is not None}
            batch.put_item(Item=clean)
            stored += 1
    return stored


def handler(event, context):
    total_fetched = 0
    total_stored = 0

    for feed_config in RSS_FEEDS:
        feed_name = feed_config["name"]
        print(f"Fetching feed: {feed_name} ({feed_config['url']})")

        try:
            candidates = fetch_feed(feed_config)
            total_fetched += len(candidates)
            print(f"  {len(candidates)} new items from {feed_name}")

            stored = store_incidents(candidates)
            total_stored += stored
            print(f"  {stored} items stored from {feed_name}")

        except Exception as e:
            print(f"  ERROR processing {feed_name}: {e}")

    result = {
        "statusCode": 200,
        "body": {
            "feeds_processed": len(RSS_FEEDS),
            "items_fetched": total_fetched,
            "items_stored": total_stored,
        },
    }
    print(f"Result: {result}")
    return result
