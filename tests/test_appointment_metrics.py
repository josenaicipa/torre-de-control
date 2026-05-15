"""Focused tests for the showed-appointment rule.

GHL is the source of truth for show-up status: any lead with a status in
``SHOWED_LEAD_STATUSES`` counts as a showed appointment regardless of whether
its ``startTime`` is in the past or future.

Run locally with: pytest tests/test_appointment_metrics.py
or:               python -m unittest tests.test_appointment_metrics

No network, no secrets, no .env. Loads the sync script by file path because
its filename uses hyphens and is not importable via normal `import`.
"""
from __future__ import annotations

import importlib.util
import json
import sys
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


def _write_history(tmp_path: Path, leads: list[dict]) -> Path:
    history_path = tmp_path / "daily-closers-history-lite.json"
    history_path.write_text(
        json.dumps({"dates": {"2026-05-15": {"all_leads": leads}}}),
        encoding="utf-8",
    )
    return history_path


def test_future_showed_still_counts(tmp_path):
    """A GHL-marked 'showed' lead counts as showed even if startTime is future."""
    history = _write_history(tmp_path, [
        {
            "name": "Future Showed",
            "email": "future@example.com",
            "contactId": "future-1",
            "status": "showed",
            "startTime": "2099-05-15T09:00:00-05:00",
            "calendarName": "Meta [A]",
        },
    ])
    metrics = sync.build_appointment_metrics(history, by_contact={}, by_email={})
    assert metrics["2026-05-15"]["hoy_meta"] == 1
    assert metrics["2026-05-15"]["show_meta"] == 1


def test_past_showed_counts(tmp_path):
    history = _write_history(tmp_path, [
        {
            "name": "Past Showed",
            "email": "past@example.com",
            "contactId": "past-1",
            "status": "showed",
            "startTime": "2026-05-15T06:00:00-05:00",
            "calendarName": "Meta [A]",
        },
    ])
    metrics = sync.build_appointment_metrics(history, by_contact={}, by_email={})
    assert metrics["2026-05-15"]["hoy_meta"] == 1
    assert metrics["2026-05-15"]["show_meta"] == 1


def test_non_showed_status_does_not_count(tmp_path):
    history = _write_history(tmp_path, [
        {
            "name": "Confirmed Only",
            "email": "confirmed@example.com",
            "contactId": "confirmed-1",
            "status": "confirmed",
            "startTime": "2026-05-15T06:00:00-05:00",
            "calendarName": "Meta [A]",
        },
    ])
    metrics = sync.build_appointment_metrics(history, by_contact={}, by_email={})
    assert metrics["2026-05-15"]["hoy_meta"] == 1
    assert metrics["2026-05-15"]["show_meta"] == 0


def test_missing_starttime_showed_counts(tmp_path):
    history = _write_history(tmp_path, [
        {
            "name": "No Start",
            "email": "nostart@example.com",
            "contactId": "nostart-1",
            "status": "showed",
            "startTime": None,
            "calendarName": "Meta [A]",
        },
    ])
    metrics = sync.build_appointment_metrics(history, by_contact={}, by_email={})
    assert metrics["2026-05-15"]["show_meta"] == 1


def test_all_showed_status_aliases_count(tmp_path):
    """Any value in SHOWED_LEAD_STATUSES counts as a show-up."""
    leads = [
        {
            "name": f"Showed {status}",
            "email": f"{status}@example.com",
            "contactId": f"{status}-1",
            "status": status,
            "startTime": "2099-05-15T09:00:00-05:00",
            "calendarName": "Meta [A]",
        }
        for status in sync.SHOWED_LEAD_STATUSES
    ]
    history = _write_history(tmp_path, leads)
    metrics = sync.build_appointment_metrics(history, by_contact={}, by_email={})
    assert metrics["2026-05-15"]["hoy_meta"] == len(sync.SHOWED_LEAD_STATUSES)
    assert metrics["2026-05-15"]["show_meta"] == len(sync.SHOWED_LEAD_STATUSES)


def test_mixed_future_and_past_showed_all_count(tmp_path):
    history = _write_history(tmp_path, [
        {
            "name": "Future Showed",
            "email": "future@example.com",
            "contactId": "future-1",
            "status": "showed",
            "startTime": "2099-05-15T09:00:00-05:00",
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
    ])
    metrics = sync.build_appointment_metrics(history, by_contact={}, by_email={})
    assert metrics["2026-05-15"]["hoy_meta"] == 2
    assert metrics["2026-05-15"]["show_meta"] == 2
