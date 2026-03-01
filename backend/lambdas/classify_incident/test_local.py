"""
Local test script — classifies a sample text via Bedrock.

Usage:
    cd backend/lambdas/classify_incident
    pip install -r requirements.txt
    python test_local.py

Requires: AWS credentials with Bedrock access + DynamoDB table created.
"""
import json
from handler import handler

SAMPLE_EVENTS = [
    {
        "incident_id": "test-001",
        "text": (
            "BREAKING: Major 7.1 earthquake hits central Turkey. "
            "Buildings collapsed in Malatya province. Rescue teams mobilizing. "
            "Casualties feared. #earthquake #Turkey"
        ),
    },
    {
        "incident_id": "test-002",
        "text": (
            "Small brush fire near residential area in San Diego. "
            "2 acres, 50% contained. One home with minor damage. "
            "No injuries. Cause under investigation."
        ),
    },
]

if __name__ == "__main__":
    for event in SAMPLE_EVENTS:
        print(f"\n{'='*60}")
        print(f"Input: {event['text'][:80]}...")
        result = handler(event, None)
        print(f"\nResult:")
        print(json.dumps(result, indent=2))
