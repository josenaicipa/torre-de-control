#!/usr/bin/env python3
"""Conservative auto-sync of CRM agendas + revenue into Torre de Control's daily_closer.

Reads three Unlocked dashboard exports:
  - crm-calls-lite.json          (booked/qualified/showed CRM calls, by call date)
  - daily-closers-history-lite.json  (parity reference; not yet written, kept for
                                      future reconciliation)
  - payments-lead-join.json      (HT/LT close + reserve revenue, by sale date)

Computes a partial daily_closer row per date with channel splits and HT/LT
revenue, then upserts into Supabase.

Safety:
  * Default mode is dry-run unless --write is passed.
  * Never overwrites a non-zero Supabase value with a different generated value;
    only fills zero/null fields. Conflicting (existing != generated and existing
    != 0) writes are recorded in skipped_conflicts and not touched.
  * Reads Supabase URL/key from index.html the same way sync-ad-spend uses.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASE = Path("/home/ubuntu/proyectos/unlocked-dashboard/cloud-automation")
DEFAULT_CRM = DEFAULT_BASE / "crm-calls-lite.json"
DEFAULT_HISTORY = DEFAULT_BASE / "daily-closers-history-lite.json"
DEFAULT_PAYMENTS = DEFAULT_BASE / "payments-lead-join.json"

CHANNELS = ("organicas", "meta", "google", "tiktok", "otros")

# Fields we are willing to fill on an empty/zero day.
WRITE_FIELDS = (
    *(f"cal_{c}" for c in CHANNELS),
    *(f"hoy_{c}" for c in CHANNELS),
    *(f"show_{c}" for c in CHANNELS),
    "q_ventas_ht", "valor_venta_ht",
    "q_ventas_lt", "valor_venta_lt",
    "q_reservas", "cash_reservas",
    "agendas_calificadas", "agendas_final", "citas_asistidas",
)

HT_CLOSE_THRESHOLD_USD = 450.0


def parse_supabase_config(index_path: Path) -> tuple[str, str]:
    text = index_path.read_text(encoding="utf-8")
    url_match = re.search(r"const SUPABASE_URL = '([^']+)'", text)
    key_match = re.search(r"const SUPABASE_KEY = '([^']+)'", text)
    if not url_match or not key_match:
        raise RuntimeError(f"Could not find Supabase config in {index_path}")
    return url_match.group(1).rstrip("/"), key_match.group(1)


def money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


# ─── channel classification ──────────────────────────────────────────────────

ORGANIC_TOKENS = ("[o]", "(o)", "[w]", "(w)")
PAID_TOKENS = ("[a]", "(a)", "[ga]", "(ga)", "[ca]", "(ca)", "[t]", "[g]")
GOOGLE_HINTS = ("google", "gads", "adwords", "youtube")
TIKTOK_HINTS = ("tiktok",)
META_HINTS = ("meta", "facebook", "instagram", "fbads", "messenger")


def _src_text(call: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in ("firstSource", "lastSource"):
        src = call.get(key) or {}
        if isinstance(src, dict):
            for f in ("platform", "account_name", "campaign_name", "source_name", "ad_name"):
                v = src.get(f)
                if isinstance(v, str):
                    parts.append(v.lower())
    for f in ("primarySource", "ghlSource", "intelSource"):
        v = call.get(f)
        if isinstance(v, str):
            parts.append(v.lower())
    return " | ".join(parts)


def _platform_text(call: dict[str, Any]) -> str:
    for key in ("lastSource", "firstSource"):
        src = call.get(key) or {}
        if isinstance(src, dict):
            v = src.get("platform")
            if isinstance(v, str) and v:
                return v.lower()
    return ""


def channel_for_call(call: dict[str, Any]) -> str:
    """Return one of: organicas | meta | google | tiktok | otros.

    Order of evidence:
      1. explicit organic markers in callType
      2. explicit google / tiktok hints (callType or source text)
      3. explicit meta hints (callType or source text)
      4. explicit paid markers in callType -> default to meta
      5. source platform field
      6. fallback to 'otros'
    """
    ct = (call.get("callType") or "").lower()
    src = _src_text(call)
    plat = _platform_text(call)

    if any(tok in ct for tok in ORGANIC_TOKENS):
        return "organicas"

    if any(h in ct for h in TIKTOK_HINTS) or any(h in src for h in TIKTOK_HINTS) or "tiktok" in plat:
        return "tiktok"
    if any(h in ct for h in GOOGLE_HINTS) or any(h in src for h in GOOGLE_HINTS) or "google" in plat:
        return "google"
    if any(h in src for h in META_HINTS) or any(h in plat for h in META_HINTS):
        return "meta"

    if any(tok in ct for tok in PAID_TOKENS):
        # Paid marker but no channel evidence -> meta.
        return "meta"

    if plat in ("paid", "ads"):
        return "meta"

    return "otros"


# ─── call status classification ──────────────────────────────────────────────

QUALIFIED_TAG_TOKENS = ("lead_vip", "lead_calificado", "lead_cualificado",
                        "lead vip", "lead calificado", "lead cualificado")


def is_qualified(call: dict[str, Any]) -> bool:
    if call.get("ghlQualifiedByTags") is True:
        return True
    tags = call.get("ghlTags") or []
    if isinstance(tags, list):
        joined = " ".join(t.lower() for t in tags if isinstance(t, str))
        if any(tok in joined for tok in QUALIFIED_TAG_TOKENS):
            return True
    text = call.get("ghlTagsText")
    if isinstance(text, str) and text:
        low = text.lower()
        if any(tok in low for tok in QUALIFIED_TAG_TOKENS):
            return True
    return False


def is_showed(call: dict[str, Any]) -> bool:
    state = (call.get("state") or "").strip().lower()
    if state in ("showed", "won"):
        return True
    stage = (call.get("stage") or "").strip().lower()
    if stage == "showed":
        return True
    return False


# ─── builders ────────────────────────────────────────────────────────────────

def build_call_metrics(crm_path: Path) -> dict[str, dict[str, int]]:
    payload = json.loads(crm_path.read_text(encoding="utf-8"))
    calls = payload.get("calls", [])
    by_date: dict[str, dict[str, int]] = defaultdict(lambda: {f: 0 for f in (
        *(f"cal_{c}" for c in CHANNELS),
        *(f"hoy_{c}" for c in CHANNELS),
        *(f"show_{c}" for c in CHANNELS),
    )})

    for call in calls:
        date = call.get("date")
        if not date or not isinstance(date, str) or len(date) < 10:
            continue
        date = date[:10]
        ch = channel_for_call(call)
        # hoy_* = booked / created by call date (every CRM row counted)
        by_date[date][f"hoy_{ch}"] += 1
        if is_qualified(call):
            by_date[date][f"cal_{ch}"] += 1
        if is_showed(call):
            by_date[date][f"show_{ch}"] += 1

    return by_date


def build_revenue_metrics(payments_path: Path) -> dict[str, dict[str, float]]:
    payload = json.loads(payments_path.read_text(encoding="utf-8"))
    rows = payload.get("rows", [])
    by_date: dict[str, dict[str, float]] = defaultdict(lambda: {
        "q_ventas_ht": 0, "valor_venta_ht": 0.0,
        "q_ventas_lt": 0, "valor_venta_lt": 0.0,
        "q_reservas": 0, "cash_reservas": 0.0,
    })

    for row in rows:
        items = list(row.get("sale_items") or [])
        items.sort(key=lambda x: x.get("dateTime") or "")
        buyer_type = (row.get("buyer_type") or "").lower()

        if buyer_type == "low_ticket":
            for it in items:
                dt = it.get("dateTime")
                if not isinstance(dt, str) or len(dt) < 10:
                    continue
                date = dt[:10]
                amt = money(it.get("amount_usd"))
                by_date[date]["q_ventas_lt"] += 1
                by_date[date]["valor_venta_lt"] += amt
        elif buyer_type == "high_ticket":
            cum = 0.0
            crossed = False
            for it in items:
                dt = it.get("dateTime")
                if not isinstance(dt, str) or len(dt) < 10:
                    continue
                date = dt[:10]
                amt = money(it.get("amount_usd"))
                cum_after = cum + amt
                if not crossed:
                    if cum_after > HT_CLOSE_THRESHOLD_USD:
                        # First crossing -> HT close.
                        by_date[date]["q_ventas_ht"] += 1
                        by_date[date]["valor_venta_ht"] += amt
                        crossed = True
                    else:
                        # Cumulative still <= 450 -> reserve.
                        by_date[date]["q_reservas"] += 1
                        by_date[date]["cash_reservas"] += amt
                # After crossing we leave subsequent payments uncounted
                # (they show up as cash collected but not as new sales).
                cum = cum_after

    # round monetary values
    for date, m in by_date.items():
        m["valor_venta_ht"] = round(m["valor_venta_ht"], 2)
        m["valor_venta_lt"] = round(m["valor_venta_lt"], 2)
        m["cash_reservas"] = round(m["cash_reservas"], 2)
    return by_date


def build_rows(crm_path: Path, payments_path: Path) -> list[dict[str, Any]]:
    calls = build_call_metrics(crm_path)
    payments = build_revenue_metrics(payments_path)
    dates = sorted(set(calls) | set(payments))

    rows: list[dict[str, Any]] = []
    for date in dates:
        row: dict[str, Any] = {"date": date}
        # call channel splits
        c = calls.get(date) or {}
        for ch in CHANNELS:
            row[f"cal_{ch}"] = int(c.get(f"cal_{ch}", 0))
            row[f"hoy_{ch}"] = int(c.get(f"hoy_{ch}", 0))
            row[f"show_{ch}"] = int(c.get(f"show_{ch}", 0))
        # totals
        row["agendas_calificadas"] = sum(row[f"cal_{ch}"] for ch in CHANNELS)
        row["agendas_final"] = sum(row[f"hoy_{ch}"] for ch in CHANNELS)
        row["citas_asistidas"] = sum(row[f"show_{ch}"] for ch in CHANNELS)
        # revenue
        p = payments.get(date) or {}
        row["q_ventas_ht"] = int(p.get("q_ventas_ht", 0))
        row["valor_venta_ht"] = round(float(p.get("valor_venta_ht", 0.0)), 2)
        row["q_ventas_lt"] = int(p.get("q_ventas_lt", 0))
        row["valor_venta_lt"] = round(float(p.get("valor_venta_lt", 0.0)), 2)
        row["q_reservas"] = int(p.get("q_reservas", 0))
        row["cash_reservas"] = round(float(p.get("cash_reservas", 0.0)), 2)
        rows.append(row)
    return rows


# ─── Supabase IO ─────────────────────────────────────────────────────────────

def _supabase_request(url: str, key: str, method: str, path: str,
                      body: bytes | None = None,
                      extra_headers: dict[str, str] | None = None) -> tuple[int, bytes]:
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(f"{url}{path}", data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase {method} {path} failed HTTP {exc.code}: {details}") from exc


def fetch_existing(url: str, key: str, dates: list[str]) -> dict[str, dict[str, Any]]:
    """Fetch existing daily_closer rows for the given dates."""
    if not dates:
        return {}
    out: dict[str, dict[str, Any]] = {}
    chunk = 100
    select = "select=" + ",".join(("date", *WRITE_FIELDS))
    for i in range(0, len(dates), chunk):
        sub = dates[i:i + chunk]
        in_clause = "in.(" + ",".join(urllib.parse.quote(d, safe="") for d in sub) + ")"
        path = f"/rest/v1/daily_closer?{select}&date={in_clause}"
        status, body = _supabase_request(url, key, "GET", path)
        if status not in (200, 206):
            raise RuntimeError(f"Unexpected status fetching existing rows: {status}")
        for row in json.loads(body or b"[]"):
            d = row.get("date")
            if isinstance(d, str):
                out[d[:10]] = row
    return out


def merge_safely(generated: dict[str, Any], existing: dict[str, Any] | None) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Build the safe payload for one date.

    For each WRITE_FIELDS field:
      * if existing is missing or the existing value is zero/null -> write generated value
      * if existing value is non-zero AND generated value differs -> keep existing,
        report a skipped_conflict
      * if existing value equals generated -> still write the same value (no-op)
    """
    out: dict[str, Any] = {"date": generated["date"]}
    conflicts: list[dict[str, Any]] = []
    for field in WRITE_FIELDS:
        gen_v = generated.get(field, 0)
        if existing is None:
            out[field] = gen_v
            continue
        cur_v = existing.get(field)
        if cur_v in (None, 0, 0.0):
            out[field] = gen_v
        else:
            try:
                same = float(cur_v) == float(gen_v)
            except (TypeError, ValueError):
                same = cur_v == gen_v
            if same:
                out[field] = gen_v
            else:
                out[field] = cur_v
                conflicts.append({
                    "date": generated["date"],
                    "field": field,
                    "existing": cur_v,
                    "generated": gen_v,
                })
    return out, conflicts


def upsert_rows(url: str, key: str, rows: list[dict[str, Any]], chunk_size: int = 100) -> None:
    if not rows:
        return
    path = "/rest/v1/daily_closer?on_conflict=date"
    headers = {"Prefer": "resolution=merge-duplicates,return=minimal"}
    for start in range(0, len(rows), chunk_size):
        body = json.dumps(rows[start:start + chunk_size]).encode("utf-8")
        status, _ = _supabase_request(url, key, "POST", path, body=body, extra_headers=headers)
        if status not in (200, 201, 204):
            raise RuntimeError(f"Unexpected Supabase upsert status: {status}")


# ─── summary ─────────────────────────────────────────────────────────────────

def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"rows": 0}
    totals = {f: 0 for f in WRITE_FIELDS}
    for row in rows:
        for f in WRITE_FIELDS:
            v = row.get(f)
            if isinstance(v, (int, float)):
                totals[f] += v
    for f in ("valor_venta_ht", "valor_venta_lt", "cash_reservas"):
        totals[f] = round(totals[f], 2)
    return {
        "rows": len(rows),
        "first_date": rows[0]["date"],
        "last_date": rows[-1]["date"],
        "totals": totals,
    }


# ─── main ────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Conservative auto-sync of CRM agendas + revenue to Torre de Control daily_closer",
    )
    parser.add_argument("--crm", type=Path, default=DEFAULT_CRM, help="Path to crm-calls-lite.json")
    parser.add_argument("--history", type=Path, default=DEFAULT_HISTORY,
                        help="Path to daily-closers-history-lite.json (kept for future reconciliation)")
    parser.add_argument("--payments", type=Path, default=DEFAULT_PAYMENTS,
                        help="Path to payments-lead-join.json")
    parser.add_argument("--index", type=Path, default=ROOT / "index.html", help="Path to Torre index.html")
    parser.add_argument("--write", action="store_true",
                        help="Actually upsert to Supabase (default is dry-run)")
    parser.add_argument("--dry-run", action="store_true", help="Force dry-run (default already dry-run)")
    parser.add_argument("--since", type=str, default=None, help="Optional ISO date lower bound (inclusive)")
    parser.add_argument("--until", type=str, default=None, help="Optional ISO date upper bound (inclusive)")
    parser.add_argument("--max-conflicts-shown", type=int, default=20,
                        help="Cap how many skipped_conflicts items appear in the JSON summary")
    args = parser.parse_args()

    if args.dry_run and args.write:
        print("Refusing to run with both --dry-run and --write.", file=sys.stderr)
        return 2
    do_write = bool(args.write) and not args.dry_run

    if not args.history.exists():
        # not fatal: the script does not write from history yet, but warn for visibility
        print(f"warning: history file missing: {args.history}", file=sys.stderr)

    rows = build_rows(args.crm, args.payments)
    if args.since:
        rows = [r for r in rows if r["date"] >= args.since]
    if args.until:
        rows = [r for r in rows if r["date"] <= args.until]

    summary = summarize(rows)
    output: dict[str, Any] = {
        "mode": "write" if do_write else "dry_run",
        "summary": summary,
        "sample": rows[-3:],
    }

    url, key = parse_supabase_config(args.index)
    dates = [r["date"] for r in rows]
    existing = fetch_existing(url, key, dates)

    safe_rows: list[dict[str, Any]] = []
    all_conflicts: list[dict[str, Any]] = []
    filled_dates: list[str] = []
    for row in rows:
        merged, conflicts = merge_safely(row, existing.get(row["date"]))
        if any(merged.get(f) for f in WRITE_FIELDS):
            safe_rows.append(merged)
            filled_dates.append(row["date"])
        all_conflicts.extend(conflicts)

    output["safe_rows"] = len(safe_rows)
    output["safe_date_range"] = [filled_dates[0], filled_dates[-1]] if filled_dates else None
    output["existing_rows_seen"] = len(existing)
    output["skipped_conflicts_total"] = len(all_conflicts)
    output["skipped_conflicts_sample"] = all_conflicts[: args.max_conflicts_shown]

    if not do_write:
        print(json.dumps(output, indent=2, ensure_ascii=False))
        return 0

    upsert_rows(url, key, safe_rows)

    output["written_rows"] = len(safe_rows)
    output["written_dates"] = [filled_dates[0], filled_dates[-1]] if filled_dates else None
    print(json.dumps(output, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
