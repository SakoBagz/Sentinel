#!/usr/bin/env python3
"""Create the deterministic, benign 25-UAV demo mission through the API."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import httpx


def request(client: httpx.Client, method: str, path: str, **kwargs):
    response = client.request(method, path, **kwargs)
    response.raise_for_status()
    return response.json() if response.content else None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--session-id", default="sentinel-demo")
    parser.add_argument("--start", action="store_true", help="kept for compatibility; demo launches always start")
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    with httpx.Client(base_url=args.base_url.rstrip("/"), headers={"X-Session-Id": args.session_id}, timeout=20.0) as client:
        run = request(client, "POST", "/api/demo/launch")
        mission = request(client, "GET", f"/api/missions/{run['mission_id']}")
        result = {"mission": mission, "run": run}
    encoded = json.dumps(result, indent=2, sort_keys=True)
    print(encoded)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
