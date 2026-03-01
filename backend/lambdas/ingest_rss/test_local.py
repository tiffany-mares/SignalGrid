"""
Local test script — run this to verify RSS ingestion works before deploying.

Usage:
    cd backend/lambdas/ingest_rss
    pip install -r requirements.txt
    python test_local.py
"""
import json
from handler import handler

if __name__ == "__main__":
    result = handler({}, None)
    print("\n=== RESULT ===")
    print(json.dumps(result, indent=2))
