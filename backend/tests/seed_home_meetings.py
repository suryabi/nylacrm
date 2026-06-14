"""Seed 4 meetings on today (IST) for UpcomingMeetingsWidget status testing.
Creates: live, up_next, upcoming, past. Prints JSON with tokens & ids for cleanup.
Usage: python seed_home_meetings.py
"""
import os
import sys
import json
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fmcg-multi-tenant.preview.emergentagent.com").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"

IST = timezone(timedelta(hours=5, minutes=30))
# Playwright default runs in UTC; use UTC so naive times line up with the browser's interpretation.
USE_TZ = timezone.utc


def login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data.get("session_token") or data.get("token") or data.get("access_token")


def create_meeting(token, title, minutes_from_now, duration_minutes):
    now_tz = datetime.now(USE_TZ)
    start_tz = now_tz + timedelta(minutes=minutes_from_now)
    end_tz = start_tz + timedelta(minutes=duration_minutes)
    meeting_date = start_tz.strftime("%Y-%m-%d")
    start_time = start_tz.strftime("%H:%M")
    end_time = end_tz.strftime("%H:%M")
    payload = {
        "title": title,
        "meeting_type": "internal",
        "meeting_date": meeting_date,
        "start_time": start_time,
        "end_time": end_time,
        "duration_minutes": duration_minutes,
    }
    r = requests.post(
        f"{BASE_URL}/api/meetings",
        json=payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        timeout=30,
    )
    r.raise_for_status()
    m = r.json()
    return {"id": m.get("id"), "title": title, "start": f"{meeting_date}T{start_time}:00", "delta_min": minutes_from_now}


def main():
    token = login()
    created = []
    # (title, minutes_from_now, duration_minutes)
    specs = [
        ("TEST_LIVE_MEETING", -30, 60),      # started 30m ago, ends 30m from now -> live
        ("TEST_UPNEXT_MEETING", 15, 30),     # starts 15m from now -> up_next
        ("TEST_UPCOMING_MEETING", 60, 30),   # starts 60m from now -> upcoming
        ("TEST_PAST_MEETING", -90, 30),      # ended 60m ago -> past
    ]
    for title, delta, dur in specs:
        try:
            created.append(create_meeting(token, title, delta, dur))
        except Exception as e:
            print(f"ERR creating {title}: {e}", file=sys.stderr)
    out = {"token": token, "created": created, "base_url": BASE_URL}
    print(json.dumps(out))


def cleanup(token, ids):
    for mid in ids:
        try:
            requests.delete(
                f"{BASE_URL}/api/meetings/{mid}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
            )
        except Exception as e:
            print(f"cleanup err {mid}: {e}", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
        token = login()
        ids = sys.argv[2:]
        cleanup(token, ids)
        print(json.dumps({"cleaned": ids}))
    else:
        main()
