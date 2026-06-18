"""Unit tests for the clone-and-remap seed engine (pure helpers)."""
import importlib.util
import re
from pathlib import Path

# Load the script as a module without executing main().
_SPEC = importlib.util.spec_from_file_location(
    "seed_sample_data",
    Path(__file__).resolve().parent.parent / "scripts" / "seed_sample_data.py",
)
seed = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(seed)


UUID_A = "11111111-1111-4111-8111-111111111111"
UUID_B = "22222222-2222-4222-8222-222222222222"


def test_is_uuid():
    assert seed._is_uuid(UUID_A)
    assert not seed._is_uuid("DIST-0003")
    assert not seed._is_uuid("nsh-test-nsxyij")
    assert not seed._is_uuid(None)
    assert not seed._is_uuid(123)


def test_remap_value_rewrites_nested_references():
    id_map = {UUID_A: "new-a", UUID_B: "new-b"}
    doc = {
        "id": UUID_A,
        "distributor_id": UUID_B,
        "invoice_no": "RINV-0001",  # business code, not in map → unchanged
        "items": [{"lead_id": UUID_A}, {"lead_id": "OTHER"}],
        "meta": {"created_by": UUID_B, "count": 5},
    }
    out = seed._remap_value(doc, id_map)
    assert out["id"] == "new-a"
    assert out["distributor_id"] == "new-b"
    assert out["invoice_no"] == "RINV-0001"
    assert out["items"][0]["lead_id"] == "new-a"
    assert out["items"][1]["lead_id"] == "OTHER"
    assert out["meta"]["created_by"] == "new-b"
    assert out["meta"]["count"] == 5


def test_demoify_user_unique_emails_and_password():
    used = set()
    u1 = {"email": "Surya.Yadavalli@nylaairwater.earth", "role": "CEO"}
    u2 = {"email": "surya.yadavalli@other.com"}  # same local-part → must dedupe
    seed._demoify_user(u1, used)
    seed._demoify_user(u2, used)
    assert u1["email"] == f"surya.yadavalli@{seed.DEMO_EMAIL_DOMAIN}"
    assert u2["email"] == f"surya.yadavalli2@{seed.DEMO_EMAIL_DOMAIN}"
    assert u1["email"] != u2["email"]
    # password + password_hash set to a valid bcrypt hash of DEMO_PASSWORD
    import bcrypt
    assert bcrypt.checkpw(seed.DEMO_PASSWORD.encode(), u1["password"].encode())
    assert u1["password"] == u1["password_hash"]
    assert u1["force_password_change"] is False
    assert u1["is_active"] is True


def test_build_demo_tenant():
    src = {
        "_id": "abc",
        "id": "default-tenant-001",
        "tenant_id": "nyla-air-water",
        "name": "Nyla Air Water",
        "branding": {"app_name": "Nyla", "primary_color": "#e22400"},
    }
    t = seed._build_demo_tenant(src)
    assert "_id" not in t
    assert t["tenant_id"] == seed.TARGET_TENANT
    assert t["name"] == "Demo Co"
    assert t["branding"]["app_name"] == "Demo Co"
    assert t["branding"]["primary_color"] == "#e22400"  # other branding preserved
    assert seed._is_uuid(t["id"])  # fresh uuid
    # source dict not mutated
    assert src["branding"]["app_name"] == "Nyla"


def test_excludes_secrets_and_globals():
    assert "gmail_tokens" in seed.EXCLUDE_COLLECTIONS
    assert "zoho_credentials" in seed.EXCLUDE_COLLECTIONS
    assert "api_keys" in seed.EXCLUDE_COLLECTIONS
    assert "tenants" in seed.GLOBAL_COLLECTIONS
    assert "master_skus" in seed.GLOBAL_COLLECTIONS
