#!/usr/bin/env python3
"""Extract monthly GHL daily aggregates for Torre dashboard.

Uses GHL Private Integration token from env GHL_TOKEN (fallback hardcoded only if passed)
and LOCATION_ID. Outputs JSON+CSV with daily contacts/opportunities/calendar counts.
"""
import csv
import json
import os
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo

import requests

BASE = "https://services.leadconnectorhq.com"
PIPELINE_CAPTACION = "Hd73YRNhLKoIcCaBZiST"
TZ = ZoneInfo("America/Bogota")


def local_dt(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=TZ)


def iso_to_date(value: str) -> str | None:
    if not value:
        return None
    try:
        # GHL returns either Z UTC or offset strings.
        v = value.replace("Z", "+00:00")
        return datetime.fromisoformat(v).astimezone(TZ).date().isoformat()
    except Exception:
        return value[:10] if len(value) >= 10 else None


def ms(day: date) -> int:
    return int(local_dt(day).timestamp() * 1000)


def month_bounds(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    return start, end


def in_month(day_str: str | None, start: date, end: date) -> bool:
    if not day_str:
        return False
    d = date.fromisoformat(day_str)
    return start <= d < end


def request_json(session: requests.Session, path: str, params: dict) -> dict:
    url = BASE + path
    last_response: requests.Response | None = None
    for attempt in range(4):
        last_response = session.get(url, params=params, timeout=45)
        if last_response.status_code in (429, 500, 502, 503, 504):
            time.sleep(1.5 * (attempt + 1))
            continue
        last_response.raise_for_status()
        return last_response.json()
    if last_response is None:
        raise RuntimeError(f"No response from {path}")
    last_response.raise_for_status()
    return last_response.json()


def paginate_desc(session: requests.Session, path: str, params: dict, rows_key: str, date_key: str, start: date, end: date):
    out = []
    next_params = dict(params)
    next_params.setdefault("limit", 100)
    pages = 0
    while True:
        pages += 1
        data = request_json(session, path, next_params)
        rows = data.get(rows_key) or []
        if not rows:
            break
        oldest_seen = None
        for row in rows:
            day = iso_to_date(row.get(date_key))
            if day:
                d = date.fromisoformat(day)
                oldest_seen = d if oldest_seen is None or d < oldest_seen else oldest_seen
                if start <= d < end:
                    out.append(row)
        meta = data.get("meta") or {}
        # GHL uses startAfter/startAfterId cursor in meta for search endpoints.
        if meta.get("startAfter") and meta.get("startAfterId"):
            next_params["startAfter"] = meta["startAfter"]
            next_params["startAfterId"] = meta["startAfterId"]
        elif meta.get("nextPageUrl"):
            # Should not normally be needed when using params, but keeps it robust.
            break
        else:
            break
        if oldest_seen and oldest_seen < start:
            break
        if pages > 1000:
            raise RuntimeError(f"pagination guard tripped for {path}")
    return out, pages


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: extract_ghl_month.py YEAR MONTH", file=sys.stderr)
        return 2
    year = int(sys.argv[1]); month = int(sys.argv[2])
    token = os.environ.get("GHL_TOKEN")
    location_id = os.environ.get("GHL_LOCATION_ID", "ASjgqjhRpFU550N2Ape8")
    if not token:
        print("GHL_TOKEN is required", file=sys.stderr)
        return 2

    start, end = month_bounds(year, month)
    days = []
    d = start
    while d < end:
        days.append(d.isoformat())
        d += timedelta(days=1)
    daily: dict[str, dict[str, float]] = {day: defaultdict(float) for day in days}

    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Version": "2021-07-28", "Accept": "application/json"})

    # Contacts created + lead_calificado tag, by contact dateAdded.
    contacts, contact_pages = paginate_desc(
        s,
        "/contacts/",
        {"locationId": location_id, "limit": 100},
        "contacts",
        "dateAdded",
        start,
        end,
    )
    for c in contacts:
        day = iso_to_date(c.get("dateAdded"))
        if not in_month(day, start, end):
            continue
        tags = [str(t).lower() for t in (c.get("tags") or [])]
        daily[day]["contacts_created"] += 1
        if "lead_calificado" in tags:
            daily[day]["contacts_lead_calificado_tag"] += 1

    # Opportunities created + captacion + won snapshots.
    opps, opp_pages = paginate_desc(
        s,
        "/opportunities/search",
        {"location_id": location_id, "limit": 100},
        "opportunities",
        "createdAt",
        start,
        end,
    )
    for o in opps:
        created_day = iso_to_date(o.get("createdAt"))
        if in_month(created_day, start, end):
            daily[created_day]["opportunities_created"] += 1
            if o.get("pipelineId") == PIPELINE_CAPTACION:
                daily[created_day]["opportunities_created_captacion"] += 1
            if o.get("status") == "won":
                daily[created_day]["won_opportunities_created_same_day"] += 1
                daily[created_day]["won_value_created_same_day"] += float(o.get("monetaryValue") or 0)
        status_day = iso_to_date(o.get("lastStatusChangeAt"))
        if o.get("status") == "won" and in_month(status_day, start, end):
            daily[status_day]["won_opportunities_by_status_change"] += 1
            daily[status_day]["won_value_by_status_change"] += float(o.get("monetaryValue") or 0)

    # Calendar events, by startTime, across all calendars.
    # Also count appointments_created by event dateAdded using a wider start window;
    # this matches the May artifact convention (agendas_creadas__dateAdded).
    calendars = request_json(s, "/calendars/", {"locationId": location_id}).get("calendars") or []
    status_counts = Counter()
    broad_end = date(year if month <= 10 else year + 1, month + 2 if month <= 10 else (month + 2) % 12, 1)
    seen_for_created: set[str] = set()
    for cal in calendars:
        # Events scheduled inside the month.
        data = request_json(
            s,
            "/calendars/events",
            {
                "locationId": location_id,
                "calendarId": cal["id"],
                "startTime": ms(start),
                "endTime": ms(end),
            },
        )
        for ev in data.get("events") or []:
            if ev.get("deleted"):
                continue
            day = iso_to_date(ev.get("startTime"))
            if not in_month(day, start, end):
                continue
            status = ev.get("appointmentStatus") or ev.get("appoinmentStatus") or "unknown"
            status_counts[status] += 1
            daily[day]["appointments_scheduled"] += 1
            if status == "showed":
                daily[day]["appointments_showed"] += 1
            elif status == "noshow":
                daily[day]["appointments_no_show"] += 1
            elif status == "cancelled":
                daily[day]["appointments_cancelled"] += 1
            else:
                daily[day]["appointments_other_status"] += 1

        # Events created inside the month; include near-future appointments too.
        created_data = request_json(
            s,
            "/calendars/events",
            {
                "locationId": location_id,
                "calendarId": cal["id"],
                "startTime": ms(start),
                "endTime": ms(broad_end),
            },
        )
        for ev in created_data.get("events") or []:
            if ev.get("deleted"):
                continue
            event_id = str(ev.get("id") or "")
            if event_id and event_id in seen_for_created:
                continue
            if event_id:
                seen_for_created.add(event_id)
            created_day = iso_to_date(ev.get("dateAdded"))
            if in_month(created_day, start, end):
                daily[created_day]["appointments_created"] += 1

    rows = []
    fields = [
        "date", "contacts_created", "contacts_lead_calificado_tag", "opportunities_created",
        "opportunities_created_captacion", "appointments_created", "appointments_scheduled",
        "appointments_showed", "appointments_no_show", "appointments_cancelled", "appointments_other_status",
        "won_opportunities_by_status_change", "won_value_by_status_change",
        "won_opportunities_created_same_day", "won_value_created_same_day",
    ]
    # appointments_created follows the May dashboard artifact convention: dateAdded-based created count.
    # The calendar events endpoint does not page by dateAdded, so use opportunities/captacion equivalent only if absent.
    for day in days:
        c = daily[day]
        row = {f: 0 for f in fields}
        row["date"] = day
        for k, v in c.items():
            row[k] = v
        # Dashboard May used agendas_creadas__dateAdded from appointment creation. If unavailable, do not fabricate.
        row["appointments_created"] = row.get("appointments_created", 0)
        rows.append(row)

    outdir = f"/root/hermes-media/ghl-{year}-{month:02d}-extract"
    os.makedirs(outdir, exist_ok=True)
    json_path = os.path.join(outdir, f"ghl_{year}_{month:02d}_daily_aggregate.json")
    csv_path = os.path.join(outdir, f"ghl_{year}_{month:02d}_daily_aggregate.csv")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader(); w.writerows(rows)

    recommended_path = os.path.join(outdir, f"torre_agendas_leads_recommended_{year}_{month:02d}_from_ghl.csv")
    with open(recommended_path, "w", newline="", encoding="utf-8") as f:
        fieldnames = ["date", "calificados_totales__citas_en_agenda_menos_canceladas", "contacts_tag_lead_calificado__reference_only", "agendas_creadas__dateAdded", "citas_en_agenda__startTime", "show_ups__showed", "no_shows__noshow", "canceladas", "otras_status", "source_note"]
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            citas_en_agenda = r["appointments_scheduled"]
            canceladas = r["appointments_cancelled"]
            w.writerow({
                "date": r["date"],
                "calificados_totales__citas_en_agenda_menos_canceladas": max(0, citas_en_agenda - canceladas),
                "contacts_tag_lead_calificado__reference_only": r["contacts_lead_calificado_tag"],
                "agendas_creadas__dateAdded": r["appointments_created"],
                "citas_en_agenda__startTime": citas_en_agenda,
                "show_ups__showed": r["appointments_showed"],
                "no_shows__noshow": r["appointments_no_show"],
                "canceladas": canceladas,
                "otras_status": r["appointments_other_status"],
                "source_note": "GHL API: Calificados Total = citas_en_agenda__startTime - canceladas; lead_calificado tag is reference only",
            })

    print(json.dumps({
        "ok": True,
        "year": year,
        "month": month,
        "contacts": len(contacts),
        "contact_pages": contact_pages,
        "opportunities": len(opps),
        "opp_pages": opp_pages,
        "calendars": len(calendars),
        "appointment_status_counts": dict(status_counts),
        "json": json_path,
        "csv": csv_path,
        "recommended_csv": recommended_path,
        "totals": {k: sum(float(r.get(k) or 0) for r in rows) for k in fields if k != "date"},
    }, ensure_ascii=False, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
