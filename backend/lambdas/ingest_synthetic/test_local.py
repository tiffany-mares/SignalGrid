"""
Local test script — run to simulate synthetic incident ingestion.

Usage:
    cd backend/lambdas/ingest_synthetic
    pip install -r requirements.txt
    python test_local.py
"""
import json
from handler import handler

if __name__ == "__main__":
    result = handler({}, None)
    print("\n=== RESULT ===")
    print(json.dumps(result, indent=2))
