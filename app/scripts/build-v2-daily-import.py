#!/usr/bin/env python3
"""Build Torre v2 DailyMetric import rows from existing production exports.

Rules:
- Ads spend: high-ticket only from ad-spend-daily.json (funnel == high_ticket).
- CRM booked: uses legacy audited builder; agendas by CRM created/booked date.
- Appointments/show-ups: uses legacy audited builder; scheduled date from GHL/startTime history.
- Revenue/cierres: HT only using >$450 crossing rule from legacy audited builder.
- Conservative target: only DailyMetric rows; no manual/human tables are touched.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
LEGACY = ROOT / "scripts" / "sync-auto-crm-revenue-to-supabase.py"
DEFAULT_BASE = Path("/home/ubuntu/proyectos/unlocked-dashboard/cloud-automation")
AD_SPEND = DEFAULT_BASE / "ad-spend-daily.json"
CRM = DEFAULT_BASE / "crm-calls-lite.json"
HISTORY = DEFAULT_BASE / "daily-closers-history-lite.json"
PAYMENTS = DEFAULT_BASE / "payments-lead-join.json"
CHANNELS = ("organicas", "meta", "google", "tiktok", "otros")


def money(v: Any) -> float:
    try:
        return round(float(v or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def load_legacy():
    spec = importlib.util.spec_from_file_location("legacy_sync", LEGACY)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {LEGACY}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def build_spend() -> dict[tuple[str, str], dict[str, Any]]:
    payload = json.loads(AD_SPEND.read_text(encoding="utf-8"))
    out: dict[tuple[str, str], dict[str, Any]] = defaultdict(lambda: {"spend": 0.0, "impressions": 0, "clicks": 0})
    for r in payload.get("daily_totals", []):
        date = r.get("date")
        ch = (r.get("channel") or "").lower()
        funnel = (r.get("funnel") or "").lower()
        if not date or ch not in ("meta", "google", "tiktok", "otros"):
            continue
        if funnel != "high_ticket":
            continue
        key = (date, ch)
        out[key]["spend"] = round(out[key]["spend"] + money(r.get("spend")), 2)
        out[key]["impressions"] += int(r.get("impressions") or 0)
        out[key]["clicks"] += int(r.get("clicks") or 0)
    return out


def build_rows() -> list[dict[str, Any]]:
    legacy = load_legacy()
    legacy_rows = {r["date"]: r for r in legacy.build_rows(CRM, PAYMENTS, HISTORY)}
    spend = build_spend()
    dates = sorted(set(legacy_rows) | {d for d, _ in spend})
    rows: list[dict[str, Any]] = []
    for date in dates:
        lr = legacy_rows.get(date, {})
        for ch in CHANNELS:
            s = spend.get((date, ch), {})
            closed = 0
            revenue = 0.0
            # Current v2 schema has one closed/revenue pair per channel. The legacy audited
            # revenue builder is date-level HT; store it in a synthetic 'otros' bucket so
            # total dashboard KPIs are correct without inventing channel attribution.
            if ch == "otros":
                closed = int(lr.get("q_ventas_ht", 0) or 0)
                revenue = money(lr.get("valor_venta_ht"))
            row = {
                "date": date,
                "channel": ch,
                "spend": money(s.get("spend")),
                "booked": int(lr.get(f"agendas_{ch}", 0) or 0),
                "showed": int(lr.get(f"show_{ch}", 0) or 0),
                "closed": closed,
                "revenue": revenue,
                "raw": {
                    "source": "torre-v2-import-2026-05",
                    "rules": {
                        "ads": "high_ticket_only",
                        "booked": "crm_created_or_booked_date_legacy_builder",
                        "showed": "ghl_startTime_scheduled_date_legacy_builder",
                        "revenue": "high_ticket_threshold_gt_450_date_level_stored_in_otros",
                    },
                    "legacy": {k: lr.get(k) for k in (
                        f"agendas_{ch}", f"cal_{ch}", f"hoy_{ch}", f"show_{ch}",
                        "q_ventas_ht", "valor_venta_ht", "q_reservas", "cash_reservas"
                    ) if k in lr},
                    "ads": s,
                },
            }
            if row["spend"] or row["booked"] or row["showed"] or row["closed"] or row["revenue"]:
                rows.append(row)
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    rows = build_rows()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    summary = {
        "rows": len(rows),
        "first_date": rows[0]["date"] if rows else None,
        "last_date": rows[-1]["date"] if rows else None,
        "channels": sorted({r["channel"] for r in rows}),
        "totals": {
            "spend": round(sum(r["spend"] for r in rows), 2),
            "booked": sum(r["booked"] for r in rows),
            "showed": sum(r["showed"] for r in rows),
            "closed": sum(r["closed"] for r in rows),
            "revenue": round(sum(r["revenue"] for r in rows), 2),
        },
        "sha256": hashlib.sha256(args.out.read_bytes()).hexdigest(),
        "out": str(args.out),
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
