"""End-to-end frontend + API test for the SM rule engine on Marketing Requests.

Strategy:
  1. Login via API, fetch /api/state-machines/fields/catalog
  2. Find the Marketing Request Lifecycle SM attached to marketing_requests
  3. PUT-save guards + required_fields onto the (submitted -> start_working) transition
  4. UI: open /admin/state-machines -> verify rules persisted in builder UI
  5. Create MR via API: Neck Tags + 0 refs ; Neck Tags + 2 refs ; Presentation + 2 refs
  6. UI: visit each detail page and assert button state / dialog / submit
  7. Regression: file thumbnail+download+delete on MR detail
  8. Cleanup: PUT-revert SM (guards=null, required_fields=[])
"""
import os, io, json, time, uuid, requests, asyncio, sys
from datetime import datetime, timezone, timedelta

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = BASE + "/api"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PWD = "test123"
TENANT = "nyla-air-water"

S = requests.Session()
def login():
    r = S.post(f"{API}/auth/login", json={"email":EMAIL,"password":PWD,"tenant_id":TENANT}, timeout=30)
    r.raise_for_status()
    tok = r.json().get("session_token")
    S.headers.update({"Authorization": f"Bearer {tok}"})
    return tok

def main():
    tok = login()
    print("LOGIN ok, token len=", len(tok))

    # 1. fields catalog
    r = S.get(f"{API}/state-machines/fields/catalog?workflow_key=marketing_requests")
    assert r.status_code == 200, r.text
    cat = r.json()
    field_keys = [f["key"] for f in cat["fields"]]
    assert "references" in field_keys and "request_type_name" in field_keys and "production.quantity_required" in field_keys
    enum_opts = next(f for f in cat["fields"] if f["key"] == "request_type_name").get("options") or []
    assert "Neck Tags" in enum_opts, f"Neck Tags missing from request types: {enum_opts}"
    print("CATALOG ok; request_types=", enum_opts)

    # 2. find SM
    sms = S.get(f"{API}/state-machines/").json()
    sm = next((s for s in sms if "marketing_requests" in (s.get("applied_to") or []) and "Marketing Request Lifecycle" in (s.get("name") or "")), None)
    if not sm:
        sm = next(s for s in sms if "marketing_requests" in (s.get("applied_to") or []))
    print("Using SM:", sm["name"], sm["id"])
    sm_id = sm["id"]

    # 3. modify the (submitted -> start_working) transition
    tr_idx = next(i for i,t in enumerate(sm["transitions"]) if t.get("action_key") == "start_working" and t.get("from_state") == "submitted")
    sm["transitions"][tr_idx]["guards"] = {
        "match": "all",
        "conditions": [{
            "field": "references", "op": "count_gte", "value": 2,
            "message": "Upload at least 2 reference files before starting.",
            "applies_when": None
        }],
    }
    sm["transitions"][tr_idx]["required_fields"] = [{
        "key": "tags_quantity", "label": "Number of tags needed",
        "type": "number", "required": True, "min": 1,
        "applies_when": {"request_type_name": ["Neck Tags"]},
    }]
    payload = {k:sm[k] for k in ("name","code","description","states","actions","transitions","applied_to")}
    r = S.put(f"{API}/state-machines/{sm_id}", json=payload)
    assert r.status_code == 200, r.text
    saved = r.json()
    saved_tr = saved["transitions"][tr_idx]
    assert saved_tr.get("guards") and saved_tr["guards"]["conditions"][0]["value"] == 2
    assert saved_tr.get("required_fields") and saved_tr["required_fields"][0]["key"] == "tags_quantity"
    print("SM updated with guard + required field at transition idx", tr_idx)

    # 5. Create MRs via API
    # need a request_type_id for Neck Tags and Presentation, plus a department
    types = S.get(f"{API}/marketing-request-types").json()["types"]
    necktag = next(t for t in types if t["name"] == "Neck Tags")
    pres = next((t for t in types if t["name"] == "Presentation"), None)
    if not pres:
        pres = next(t for t in types if t["name"] != "Neck Tags")
    depts = S.get(f"{API}/master-departments").json()["departments"]
    dept_id = depts[0]["id"]
    due = (datetime.now(timezone.utc) + timedelta(days=120)).date().isoformat()

    def upload_file(name="ref.txt"):
        files = {"file": (name, io.BytesIO(b"hello world " + name.encode()), "text/plain")}
        h = {"Authorization": S.headers["Authorization"]}
        r = requests.post(f"{API}/marketing-requests/upload", headers=h, files=files, timeout=30)
        r.raise_for_status()
        return r.json()["id"]

    def create_mr(rtype_id, ref_ids):
        body = {"request_type_id": rtype_id, "assigned_department_id": dept_id,
                "requested_due_date": due, "requirement_details": "QA rule-engine test " + uuid.uuid4().hex[:6],
                "reference_file_ids": ref_ids}
        r = S.post(f"{API}/marketing-requests", json=body)
        assert r.status_code in (200,201), r.text
        return r.json()["id"]

    neck_no_ref = create_mr(necktag["id"], [])
    neck_2_refs = create_mr(necktag["id"], [upload_file("a.txt"), upload_file("b.txt")])
    pres_2_refs = create_mr(pres["id"], [upload_file("c.txt"), upload_file("d.txt")])
    print("Created MRs:", neck_no_ref, neck_2_refs, pres_2_refs)

    # available-transitions sanity
    at = S.get(f"{API}/marketing-requests/{neck_no_ref}/available-transitions").json()["transitions"]
    sw = next(t for t in at if t["action_key"] == "start_working")
    assert sw.get("guards_ok") is False and sw.get("block_reasons"), sw
    print("API: Neck/0refs guards_ok=False ok; reasons=", sw["block_reasons"])

    at2 = S.get(f"{API}/marketing-requests/{neck_2_refs}/available-transitions").json()["transitions"]
    sw2 = next(t for t in at2 if t["action_key"] == "start_working")
    assert sw2.get("guards_ok") is True and sw2.get("required_fields"), sw2
    assert sw2["required_fields"][0]["key"] == "tags_quantity"
    print("API: Neck/2refs guards_ok=True with required_fields=tags_quantity ok")

    at3 = S.get(f"{API}/marketing-requests/{pres_2_refs}/available-transitions").json()["transitions"]
    sw3 = next(t for t in at3 if t["action_key"] == "start_working")
    assert sw3.get("guards_ok") is True and not sw3.get("required_fields"), sw3
    print("API: Presentation/2refs guards_ok=True, no required fields ok")

    # Save IDs for UI step
    with open("/tmp/rule_engine_ids.json","w") as f:
        json.dump({"sm_id":sm_id,"tr_idx":tr_idx,"neck_no":neck_no_ref,"neck_yes":neck_2_refs,"pres":pres_2_refs,"token":tok}, f)
    print("API PRE-CHECK PASSED")

if __name__ == "__main__":
    main()
