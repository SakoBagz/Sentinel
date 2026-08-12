#!/usr/bin/env python3
"""Create the deterministic, benign three-UAV demo mission through the API."""

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
    parser.add_argument("--start", action="store_true", help="start the seeded run after creation")
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    with httpx.Client(base_url=args.base_url.rstrip("/"), headers={"X-Session-Id": args.session_id}, timeout=20.0) as client:
        mission = request(client, "POST", "/api/missions", json={
            "name": "Angeles Forest communications relay",
            "description": "Deterministic benign environmental survey demo.",
            "scenario_type": "environmental_survey",
        })
        vehicle_ids: list[str] = []
        starts = [(34.1500, -118.2400), (34.1520, -118.2430), (34.1480, -118.2370)]
        for index, (latitude, longitude) in enumerate(starts, start=1):
            vehicle = request(client, "POST", f"/api/missions/{mission['id']}/vehicles", json={
                "callsign": f"UAV-{index:02d}",
                "vehicle_type": "SURVEY",
                "max_speed_mps": 25,
                "cruise_speed_mps": 12,
                "battery_capacity": 100,
                "telemetry_rate_hz": 5,
                "starting_latitude": latitude,
                "starting_longitude": longitude,
                "starting_altitude_m": 100,
                "configuration": {"return_battery_threshold": 25},
            })
            vehicle_ids.append(vehicle["id"])
            for sequence, offset in enumerate((0.002, 0.004, 0.001)):
                request(client, "POST", f"/api/missions/{mission['id']}/waypoints", json={
                    "vehicle_id": vehicle["id"],
                    "sequence": sequence,
                    "latitude": latitude + offset,
                    "longitude": longitude + (0.001 if sequence % 2 == 0 else -0.001),
                    "altitude_m": 110 + sequence * 5,
                    "target_speed_mps": 12,
                    "arrival_radius_m": 10,
                    "action": "SURVEY" if sequence == 1 else "TRANSIT",
                })
        run = request(client, "POST", f"/api/missions/{mission['id']}/runs", json={"random_seed": 20260812, "simulation_speed": 1.0})
        if args.start:
            run = request(client, "POST", f"/api/runs/{run['id']}/start")
        result = {"mission": mission, "vehicle_ids": vehicle_ids, "run": run}
    encoded = json.dumps(result, indent=2, sort_keys=True)
    print(encoded)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
