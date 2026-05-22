#!/usr/bin/env python3
"""Sync normalized ad spend into Torre de Control Supabase daily_entries.

Reads Unlocked's generated ad-spend-daily.json, aggregates spend by date/channel,
and upserts one daily_entries row per date under member "Auto Ads". The dashboard
already sums daily_entries by date, so the Detalle Diario table receives spend
without changing the UI.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path("/home/ubuntu/proyectos/unlocked-dashboard/cloud-automation/ad-spend-daily.json")
DEFAULT_MEMBER = "Auto Ads"


def parse_supabase_config(index_path: Path) -> tuple[str, str]:
    env_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    env_key = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if env_url and env_key:
        return env_url.rstrip("/"), env_key

    text = index_path.read_text(encoding="utf-8")
    url_match = re.search(r"const SUPABASE_URL = '([^']+)'", text)
    key_match = re.search(r"const SUPABASE_KEY = '([^']+)'", text)
    if not url_match or not key_match:
        raise RuntimeError(
            "Could not find Supabase config. Set SUPABASE_URL and SUPABASE_ANON_KEY."
        )
    return url_match.group(1).rstrip("/"), key_match.group(1)


def money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def build_rows(source_path: Path, member: str) -> list[dict[str, Any]]:
    payload = json.loads(source_path.read_text(encoding="utf-8"))
    by_date: dict[str, dict[str, float]] = defaultdict(lambda: {"meta": 0.0, "google": 0.0})

    for row in payload.get("daily_totals", []):
        date = row.get("date")
        channel = (row.get("channel") or "").lower()
        if not date or channel not in ("meta", "google"):
            continue
        by_date[date][channel] += money(row.get("spend"))

    return [
        {
            "date": date,
            "member": member,
            "ig_followers": 0,
            "posts": 0,
            "mensajes": 0,
            "follow_ups": 0,
            "bk_offers": 0,
            "gasto_meta": round(values["meta"], 2),
            "gasto_google": round(values["google"], 2),
            "gasto_tiktok": 0,
            "gasto_otros": 0,
        }
        for date, values in sorted(by_date.items())
    ]


def upsert_rows(url: str, key: str, rows: list[dict[str, Any]], chunk_size: int = 100) -> None:
    endpoint = f"{url}/rest/v1/daily_entries?on_conflict=date,member"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    for start in range(0, len(rows), chunk_size):
        body = json.dumps(rows[start : start + chunk_size]).encode("utf-8")
        req = urllib.request.Request(endpoint, data=body, method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                if response.status not in (200, 201, 204):
                    raise RuntimeError(f"Unexpected Supabase status: {response.status}")
        except urllib.error.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase upsert failed with HTTP {exc.code}: {details}") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync ad spend daily totals to Torre de Control Supabase")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="Path to ad-spend-daily.json")
    parser.add_argument("--index", type=Path, default=ROOT / "index.html", help="Path to Torre index.html")
    parser.add_argument("--member", default=DEFAULT_MEMBER, help="daily_entries member name to upsert")
    parser.add_argument("--dry-run", action="store_true", help="Print summary without writing to Supabase")
    args = parser.parse_args()

    rows = build_rows(args.source, args.member)
    totals = {
        "rows": len(rows),
        "first_date": rows[0]["date"] if rows else None,
        "last_date": rows[-1]["date"] if rows else None,
        "meta": round(sum(row["gasto_meta"] for row in rows), 2),
        "google": round(sum(row["gasto_google"] for row in rows), 2),
        "member": args.member,
    }

    if args.dry_run:
        print(json.dumps({"dry_run": True, "summary": totals, "sample": rows[-3:]}, indent=2, ensure_ascii=False))
        return 0

    url, key = parse_supabase_config(args.index)
    upsert_rows(url, key, rows)
    print(json.dumps({"synced": True, "summary": totals}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
