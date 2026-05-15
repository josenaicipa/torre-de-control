"""Focused tests for the showed-appointment time gate.

Run locally with: pytest tests/test_appointment_metrics.py
or:               python -m unittest tests.test_appointment_metrics

No network, no secrets, no .env. Loads the sync script by file path because
its filename uses hyphens and is not importable via normal `import`.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "sync-auto-crm-revenue-to-supabase.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("sync_auto_crm_revenue", SCRIPT)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


sync = _load_module()

NOW = datetime(2026, 5, 15, 7, 30, tzinfo=timezone(timedelta(hours=-5)))  # 07:30 Bogotá


def test_future_showed_returns_false():
    lead = {"status": "showed", "startTime": "2026-05-15T09:00:00-05:00"}
    assert sync.is_showed_lead_for_report(lead, now=NOW) is False


def test_past_showed_returns_true():
    lead = {"status": "showed", "startTime": "2026-05-15T06:00:00-05:00"}
    assert sync.is_showed_lead_for_report(lead, now=NOW) is True


def test_historical_day_showed_returns_true():
    lead = {"status": "showed", "startTime": "2026-05-14T09:00:00-05:00"}
    assert sync.is_showed_lead_for_report(lead, now=NOW) is True


def test_non_showed_status_returns_false():
    lead = {"status": "confirmed", "startTime": "2026-05-14T09:00:00-05:00"}
    assert sync.is_showed_lead_for_report(lead, now=NOW) is False


def test_missing_starttime_showed_returns_true():
    lead = {"status": "showed", "startTime": None}
    assert sync.is_showed_lead_for_report(lead, now=NOW) is True


def test_unparseable_starttime_showed_returns_true():
    lead = {"status": "showed", "startTime": "not-a-date"}
    assert sync.is_showed_lead_for_report(lead, now=NOW) is True


def test_localstart_fallback_when_starttime_missing():
    lead = {"status": "showed", "startTime": None, "localStart": "2026-05-15T09:00:00-05:00"}
    assert sync.is_showed_lead_for_report(lead, now=NOW) is False


def test_parse_appointment_start_handles_z_suffix():
    lead = {"startTime": "2026-05-15T14:00:00Z"}
    parsed = sync.parse_appointment_start(lead)
    assert parsed is not None
    assert parsed.tzinfo is not None
    assert parsed.utcoffset() == timedelta(0)


def test_build_appointment_metrics_counts_hoy_but_defers_future_show(tmp_path):
    history_path = tmp_path / "daily-closers-history-lite.json"
    history_path.write_text(json.dumps({
        "dates": {
            "2026-05-15": {
                "all_leads": [
                    {
                        "name": "Future Showed",
                        "email": "future@example.com",
                        "contactId": "future-1",
                        "status": "showed",
                        "startTime": "2026-05-15T09:00:00-05:00",
                        "calendarName": "Meta [A]",
                    },
                    {
                        "name": "Past Showed",
                        "email": "past@example.com",
                        "contactId": "past-1",
                        "status": "showed",
                        "startTime": "2026-05-15T06:00:00-05:00",
                        "calendarName": "Meta [A]",
                    },
                ]
            }
        }
    }), encoding="utf-8")

    original = sync.is_showed_lead_for_report
    try:
        sync.is_showed_lead_for_report = lambda lead, now=None: original(lead, now=NOW)
        metrics = sync.build_appointment_metrics(history_path, by_contact={}, by_email={})
    finally:
        sync.is_showed_lead_for_report = original

    assert metrics["2026-05-15"]["hoy_meta"] == 2
    assert metrics["2026-05-15"]["show_meta"] == 1


def test_default_now_uses_current_time():
    far_future = "2099-01-01T00:00:00+00:00"
    assert sync.is_showed_lead_for_report({"status": "showed", "startTime": far_future}) is False
    far_past = "2000-01-01T00:00:00+00:00"
    assert sync.is_showed_lead_for_report({"status": "showed", "startTime": far_past}) is True
