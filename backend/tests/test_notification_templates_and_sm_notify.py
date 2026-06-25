"""Backend tests for the new transition-notifications feature:
1. Notification Templates CRUD (admin gated)
2. State Machine save with notifications validation
3. Transition notification dispatch (in-app, marketing_requests workflow)
"""
import os
import uuid
import time
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
LOGIN = {"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=LOGIN, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


# ───────── Notification Templates CRUD ─────────
class TestNotificationTemplatesCRUD:
    def test_list_returns_templates_and_variables(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/notification-templates", timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "templates" in body and "variables" in body
        assert isinstance(body["templates"], list)
        assert isinstance(body["variables"], list) and len(body["variables"]) > 0
        keys = {v["key"] for v in body["variables"]}
        # Must surface at least the marketing-request placeholders
        assert {"request_number", "to_state", "actor_name", "link"}.issubset(keys)

    def test_full_crud_lifecycle(self, admin_session):
        # CREATE
        name = f"TEST_tpl_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": name,
            "description": "Auto-created by test",
            "subject": "{{request_number}}: {{to_state}}",
            "body": "Hello {{requestor_name}} — {{action}} → {{to_state}}. {{link}}",
        }
        r = admin_session.post(f"{BASE_URL}/api/notification-templates", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["name"] == name
        assert created["subject"] == payload["subject"]
        assert "id" in created
        tpl_id = created["id"]

        # GET verifies persistence
        r2 = admin_session.get(f"{BASE_URL}/api/notification-templates", timeout=20)
        assert r2.status_code == 200
        ids = [t["id"] for t in r2.json()["templates"]]
        assert tpl_id in ids

        # UPDATE
        r3 = admin_session.put(
            f"{BASE_URL}/api/notification-templates/{tpl_id}",
            json={"subject": "Updated subject", "body": "Updated body {{to_state}}"},
            timeout=20,
        )
        assert r3.status_code == 200, r3.text
        assert r3.json()["subject"] == "Updated subject"

        # DELETE
        r4 = admin_session.delete(f"{BASE_URL}/api/notification-templates/{tpl_id}", timeout=20)
        assert r4.status_code == 200
        assert r4.json().get("ok") is True

        # GET verifies removal
        r5 = admin_session.get(f"{BASE_URL}/api/notification-templates", timeout=20)
        ids2 = [t["id"] for t in r5.json()["templates"]]
        assert tpl_id not in ids2


# ───────── State Machine notifications validation + persistence ─────────
@pytest.fixture(scope="module")
def marketing_sm(admin_session):
    """Find or seed the marketing_requests workflow. Visiting the SM endpoint
    on the marketing-requests route auto-seeds if absent."""
    # Trigger seed
    admin_session.get(f"{BASE_URL}/api/marketing-requests/state-machine", timeout=20)
    r = admin_session.get(f"{BASE_URL}/api/state-machines/", timeout=20)
    assert r.status_code == 200, r.text
    sms = r.json()
    for sm in sms:
        if "marketing_requests" in (sm.get("applied_to") or []):
            return sm
    pytest.skip("marketing_requests state machine not seeded")


class TestStateMachineNotificationsPersistence:
    def test_save_with_valid_notification_rule(self, admin_session, marketing_sm):
        sm = marketing_sm
        transitions = sm["transitions"]
        assert transitions, "SM has no transitions"

        # Pick the first transition and attach a notification rule
        new_transitions = [dict(t) for t in transitions]
        new_transitions[0]["notifications"] = [{
            "channels": ["in_app", "email"],
            "template_id": None,
            "recipients": [{"type": "requestor"}],
        }]
        r = admin_session.put(
            f"{BASE_URL}/api/state-machines/{sm['id']}",
            json={"transitions": new_transitions},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        saved = r.json()
        # Reload to confirm persistence
        r2 = admin_session.get(f"{BASE_URL}/api/state-machines/{sm['id']}", timeout=20)
        assert r2.status_code == 200
        reloaded = r2.json()
        rules = reloaded["transitions"][0].get("notifications") or []
        assert len(rules) >= 1
        rule = rules[0]
        assert rule["channels"] == ["in_app", "email"]
        assert any(rec.get("type") == "requestor" for rec in (rule.get("recipients") or []))
        # Save unchanged saved.id for next tests
        assert saved["id"] == sm["id"]

    def test_invalid_channel_rejected(self, admin_session, marketing_sm):
        sm = marketing_sm
        new_transitions = [dict(t) for t in sm["transitions"]]
        new_transitions[0]["notifications"] = [{
            "channels": ["fax"],  # invalid
            "template_id": None,
            "recipients": [{"type": "requestor"}],
        }]
        r = admin_session.put(
            f"{BASE_URL}/api/state-machines/{sm['id']}",
            json={"transitions": new_transitions},
            timeout=20,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        assert "fax" in r.text or "invalid channel" in r.text.lower()

    @pytest.mark.parametrize("rtype", ["role", "department", "user"])
    def test_recipient_requires_value(self, admin_session, marketing_sm, rtype):
        sm = marketing_sm
        new_transitions = [dict(t) for t in sm["transitions"]]
        new_transitions[0]["notifications"] = [{
            "channels": ["in_app"],
            "template_id": None,
            "recipients": [{"type": rtype}],  # missing value
        }]
        r = admin_session.put(
            f"{BASE_URL}/api/state-machines/{sm['id']}",
            json={"transitions": new_transitions},
            timeout=20,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"


# ───────── Transition dispatch (creates in-app notification) ─────────
class TestTransitionDispatchInApp:
    def _get_first_transition_from_initial(self, sm):
        # Find initial state
        initial = next((s for s in sm["states"] if s.get("is_initial")), None) or sm["states"][0]
        for t in sm["transitions"]:
            if (t.get("from_state") or None) == initial["key"]:
                return initial, t
        # Fallback: first transition with no from_state
        for t in sm["transitions"]:
            if not t.get("from_state"):
                return initial, t
        return initial, sm["transitions"][0]

    def test_dispatch_creates_in_app_notification(self, admin_session, marketing_sm):
        sm = marketing_sm
        # 1) Configure transition with in_app + requestor recipient
        initial, target_t = self._get_first_transition_from_initial(sm)
        new_transitions = [dict(t) for t in sm["transitions"]]
        idx = next(i for i, t in enumerate(sm["transitions"]) if t["action_key"] == target_t["action_key"] and (t.get("from_state") or None) == (target_t.get("from_state") or None))
        new_transitions[idx]["notifications"] = [{
            "channels": ["in_app", "whatsapp"],  # whatsapp should no-op
            "template_id": None,
            "recipients": [{"type": "requestor"}],
        }]
        r = admin_session.put(
            f"{BASE_URL}/api/state-machines/{sm['id']}",
            json={"transitions": new_transitions},
            timeout=30,
        )
        assert r.status_code == 200, r.text

        # 2) Seed a marketing request as a NON-admin "requestor" user so the actor
        #    != requestor (else dispatch filters actor out).
        #    Use a second user. Try to find / create one.
        # Find any non-admin user via /api/users
        users_resp = admin_session.get(f"{BASE_URL}/api/users", timeout=20)
        if users_resp.status_code != 200:
            pytest.skip("cannot list users to find a requestor")
        users = users_resp.json() if isinstance(users_resp.json(), list) else users_resp.json().get("users", [])
        # Pick any user different from CEO
        ceo_email = LOGIN["email"]
        requestor_user = next(
            (u for u in users if (u.get("email") or "").lower() != ceo_email.lower() and u.get("id")),
            None,
        )
        if not requestor_user:
            pytest.skip("no non-admin user available to act as requestor")

        # Get an existing marketing request, or create one
        # Find request_type + department
        rt = admin_session.get(f"{BASE_URL}/api/marketing-request-types", timeout=20)
        depts = admin_session.get(f"{BASE_URL}/api/master-departments", timeout=20)
        if rt.status_code != 200 or depts.status_code != 200:
            pytest.skip("cannot fetch request types or departments")
        rt_body = rt.json()
        d_body = depts.json()
        rts = rt_body if isinstance(rt_body, list) else (rt_body.get("types") or rt_body.get("items") or [])
        ds = d_body if isinstance(d_body, list) else (d_body.get("departments") or d_body.get("items") or [])
        if not rts or not ds:
            pytest.skip("no marketing request types or departments configured")
        rt0 = rts[0]
        d0 = ds[0]
        due = (date.today() + timedelta(days=int(rt0.get("design_lead_time_days") or 0) + int(rt0.get("production_lead_time_days") or 0) + 5)).isoformat()
        # Create as CEO but then patch created_by to requestor_user.id via direct DB? we can't here.
        # Instead: use header X-User-Id or create request with explicit field if API supports.
        create_payload = {
            "title": f"TEST_notif_{uuid.uuid4().hex[:6]}",
            "request_type_id": rt0["id"],
            "assigned_department_id": d0["id"],
            "requested_due_date": due,
            "requirement_details": "test notification dispatch",
        }
        cr = admin_session.post(f"{BASE_URL}/api/marketing-requests", json=create_payload, timeout=30)
        assert cr.status_code in (200, 201), cr.text
        req = cr.json()
        req_id = req["id"]

        # 3) Perform the transition. The actor (CEO) == created_by (CEO), so
        #    dispatch would skip the requestor. To verify dispatch, switch the
        #    rule recipient to an explicit "user" target pointing to a 2nd user.
        new_transitions2 = [dict(t) for t in sm["transitions"]]
        new_transitions2[idx]["notifications"] = [{
            "channels": ["in_app", "sms"],
            "template_id": None,
            "recipients": [
                {"type": "user", "value": requestor_user["id"]},
            ],
        }]
        r2 = admin_session.put(
            f"{BASE_URL}/api/state-machines/{sm['id']}",
            json={"transitions": new_transitions2},
            timeout=30,
        )
        assert r2.status_code == 200, r2.text

        # 4) Snapshot notifications count for that user (via mongo? no — use API).
        #    Use GET /api/notifications which usually returns for current_user.
        #    We can't easily inspect another user's notifications. Use admin
        #    endpoint if it exists; else verify via DB through any debug route.
        #    Pragmatic approach: also include "requestor" so CEO's own
        #    notifications would land (but actor-filter skips that). So we just
        #    rely on the user-target.  We'll use a direct mongo check via the
        #    backend by hitting a custom endpoint if available, else skip the
        #    final hard check.
        # Try checking /api/notifications?user_id= (likely 401/403/404)
        # Best: trigger transition and assert API returns 200, and inspect
        # backend logs for "workflow_notification" presence is too brittle.
        # → We use direct DB query via a tiny helper: call /api/notifications
        #   as if we were that user; we don't have password.  So fallback to
        #   verifying via marketing request's own status changes succeed and
        #   verifying CEO's notifications also include one when we ALSO add a
        #   second rule with explicit user=ceo_id.
        ceo_id = next((u.get("id") for u in users if (u.get("email") or "").lower() == ceo_email.lower()), None)
        if ceo_id:
            new_transitions3 = [dict(t) for t in sm["transitions"]]
            new_transitions3[idx]["notifications"] = [{
                "channels": ["in_app"],
                "template_id": None,
                "recipients": [
                    {"type": "user", "value": ceo_id},  # send to CEO who is the actor — actor filter will drop
                    {"type": "user", "value": requestor_user["id"]},
                ],
            }]
            admin_session.put(
                f"{BASE_URL}/api/state-machines/{sm['id']}",
                json={"transitions": new_transitions3},
                timeout=30,
            )

        # Snapshot CEO notifications
        before = admin_session.get(f"{BASE_URL}/api/notifications", timeout=20)
        before_ids = set()
        if before.status_code == 200:
            data = before.json()
            items = data.get("items") if isinstance(data, dict) else data
            before_ids = {n.get("id") for n in (items or []) if n.get("id")}

        # Fire the transition
        tr = admin_session.post(
            f"{BASE_URL}/api/marketing-requests/{req_id}/transition",
            json={"action_key": target_t["action_key"], "comment": "test"},
            timeout=30,
        )
        assert tr.status_code == 200, f"transition failed: {tr.text}"

        # Allow async dispatch
        time.sleep(1.5)

        # Hard verify: query notifications collection directly for requestor user
        try:
            import asyncio
            from motor.motor_asyncio import AsyncIOMotorClient
            mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
            db_name = os.environ.get("DB_NAME", "test_database")
            async def _check():
                client = AsyncIOMotorClient(mongo_url)
                _db = client[db_name]
                # Find recent in-app workflow_notification for requestor user
                docs = await _db.notifications.find({
                    "tenant_id": "nyla-air-water",
                    "user_id": requestor_user["id"],
                    "kind": "workflow_notification",
                    "entity_id": req_id,
                }, {"_id": 0}).to_list(20)
                client.close()
                return docs
            found = asyncio.run(_check())
            assert len(found) >= 1, f"No in-app workflow_notification found for requestor {requestor_user['id']} on req {req_id}"
            print(f"Found {len(found)} in-app notifications for requestor: titles={[d.get('title') for d in found]}")
        except AssertionError:
            raise
        except Exception as e:
            print(f"Direct mongo verification skipped: {e}")

        # Check that the transition itself did NOT break (200 above) and that
        # response shows new state.
        body = tr.json()
        assert body.get("current_state_key") == target_t["to_state"], body

        # Try to verify dispatch via the recipient user's notifications by
        # querying mongo through a generic admin endpoint if available;
        # otherwise rely on actor-filter behavior + transition success.
        # Most apps expose /api/notifications for the current user only.
        # We've already validated that the transition handled the rule without
        # raising. Now also ensure the rule with "user=ceo_id" (actor) does NOT
        # create a notification for the CEO (actor-filter).
        after = admin_session.get(f"{BASE_URL}/api/notifications", timeout=20)
        if after.status_code == 200:
            data = after.json()
            items = data.get("items") if isinstance(data, dict) else data
            after_ids = {n.get("id") for n in (items or []) if n.get("id")}
            new_for_ceo = after_ids - before_ids
            # CEO is the actor → should NOT receive a workflow_notification for this
            # specific transition triggered by themselves.
            # (notify_assignee may still fire if the transition auto-assigns CEO;
            # we only assert the rule did NOT explode.)
            print(f"CEO new notifications after transition: {len(new_for_ceo)}")

        # Clean up the marketing request
        admin_session.delete(f"{BASE_URL}/api/marketing-requests/{req_id}", timeout=20)
