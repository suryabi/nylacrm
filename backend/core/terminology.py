"""Tenant terminology for backend-generated output (Excel exports, notes)."""
from database import db
from core.tenant import get_current_tenant_id

DEFAULT_TERMINOLOGY = {
    "unit": {"singular": "Bottle", "plural": "Bottles"},
    "package": {"singular": "Crate", "plural": "Crates"},
    "distributor": {"singular": "Distributor", "plural": "Distributors"},
    "factory": {"singular": "Factory", "plural": "Factories"},
    "sku": {"singular": "SKU", "plural": "SKUs"},
}


async def get_terms() -> dict:
    """Terminology for the current tenant, merged over defaults."""
    tenant_id = get_current_tenant_id()
    doc = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0, "terminology": 1}) or {}
    overrides = doc.get("terminology") or {}
    merged = {}
    for k, v in DEFAULT_TERMINOLOGY.items():
        ov = overrides.get(k) or {}
        merged[k] = {
            "singular": ov.get("singular") or v["singular"],
            "plural": ov.get("plural") or v["plural"],
        }
    return merged


def term(terms: dict, key: str, plural: bool = False, lower: bool = False) -> str:
    t = terms.get(key) or DEFAULT_TERMINOLOGY.get(key) or {"singular": key, "plural": key}
    out = t["plural"] if plural else t["singular"]
    return out.lower() if lower else out
