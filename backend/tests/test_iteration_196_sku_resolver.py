"""
Iteration 196 — SKU resolver: historical line items with stale names / retired
external codes must consolidate under the CURRENT master SKU.

Bug: old invoices showed retired SKU names (e.g. "Nyla – 660 ml / Silver")
alongside the current SKU ("Nyla Air Water - 660 ml (Silver)") in Revenue
Analytics / SKU Performance / Invoices, because the resolver trusted the stale
stored name over the external code, and had no alias map for retired codes/names.

Fix: code-first resolution + sku_aliases. These tests cover the pure resolver.
"""
from services.sku_resolver import SkuResolver


def _resolver():
    # Current master: code B660 → "Nyla Air Water - 660 ml (Silver)"
    return SkuResolver(
        ext_to_name={"B660": "Nyla Air Water - 660 ml (Silver)"},
        name_to_name={"nyla air water - 660 ml (silver)": "Nyla Air Water - 660 ml (Silver)"},
        id_to_name={"sku-uuid-1": "Nyla Air Water - 660 ml (Silver)"},
        alias_code_to_name={"B500": "Nyla Air Water - 660 ml (Silver)"},
        alias_name_to_name={"nyla – 660 ml / silver": "Nyla Air Water - 660 ml (Silver)"},
    )


def test_code_beats_stale_name():
    r = _resolver()
    item = {"itemId": "B660", "sku_name": "Nyla – 660 ml / Silver"}  # stale name + valid code
    assert r.resolve(item) == "Nyla Air Water - 660 ml (Silver)"
    assert r.unmapped_key(item) is None


def test_retired_code_via_alias():
    r = _resolver()
    item = {"itemId": "B500"}  # retired code mapped via alias
    assert r.resolve(item) == "Nyla Air Water - 660 ml (Silver)"
    assert r.unmapped_key(item) is None


def test_old_name_no_code_via_alias():
    r = _resolver()
    item = {"sku_name": "Nyla – 660 ml / Silver"}  # old name, no code
    assert r.resolve(item) == "Nyla Air Water - 660 ml (Silver)"
    assert r.unmapped_key(item) is None


def test_sku_id_resolves():
    r = _resolver()
    assert r.resolve({"sku_id": "sku-uuid-1"}) == "Nyla Air Water - 660 ml (Silver)"


def test_unmapped_code_detected():
    r = _resolver()
    item = {"itemId": "A650"}  # not in master, not aliased
    assert r.resolve(item) == "[Unmapped: A650]"
    assert r.unmapped_key(item) == ("code", "A650")


def test_unmapped_name_detected():
    r = _resolver()
    item = {"sku_name": "Totally Old SKU"}  # not current, not aliased
    assert r.resolve(item) == "Totally Old SKU"   # fallback keeps the raw name
    assert r.unmapped_key(item) == ("name", "Totally Old SKU")


def test_enrich_items_sets_current_name():
    r = _resolver()
    items = [{"itemId": "B660", "sku_name": "Nyla – 660 ml / Silver", "quantity": 2}]
    out = r.enrich_items(items)
    assert out[0]["sku_name"] == "Nyla Air Water - 660 ml (Silver)"
    assert out[0]["quantity"] == 2  # other fields preserved
