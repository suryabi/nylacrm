"""Iteration 198 — SKU MRP field + account SKU-pricing blank-MRP bug fix.

Covers:
1. AccountSKUPricing coerces blank ('' / whitespace) numeric fields so the
   account save no longer crashes with "unable to parse string as a number"
   when a freshly-added SKU row has an empty MRP (the reported bug).
2. AccountUpdate accepts lead_type / include_in_gop_metrics (previously dropped
   silently because they were missing from the model).

These are pure-model unit tests (no DB / network) so they are deterministic.
"""
from routes.accounts import AccountSKUPricing, AccountUpdate


def test_blank_mrp_coerced_to_none():
    # Exact payload a new SKU row sends before the user fills anything in.
    row = AccountSKUPricing(sku="PET", sku_id="", price_per_unit="",
                            return_bottle_credit="", mrp="")
    assert row.mrp is None
    assert row.price_per_unit == 0.0
    assert row.return_bottle_credit == 0.0


def test_whitespace_mrp_coerced_to_none():
    row = AccountSKUPricing(sku="PET", mrp="   ")
    assert row.mrp is None


def test_numeric_mrp_parsed():
    row = AccountSKUPricing(sku="X", price_per_unit="12.5", mrp="40")
    assert row.mrp == 40.0
    assert row.price_per_unit == 12.5


def test_none_mrp_kept_none():
    row = AccountSKUPricing(sku="X", mrp=None)
    assert row.mrp is None


def test_account_update_accepts_lead_type_and_gop():
    upd = AccountUpdate(lead_type="B2B", include_in_gop_metrics=False)
    assert upd.lead_type == "B2B"
    assert upd.include_in_gop_metrics is False
    # Round-trip through the same dict the update_account loop iterates.
    dumped = upd.model_dump(exclude_unset=True)
    assert dumped["lead_type"] == "B2B"
    assert dumped["include_in_gop_metrics"] is False
