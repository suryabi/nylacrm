"""
Iteration 195 — Performance Tracker → "Top Leads to Focus": Est. Monthly Revenue
showed ₹0 even when the lead had an Opportunity Estimation.

Root cause: the Opportunity Estimation flow (routes/leads.py) saves the value at
`opportunity_estimation.estimated_monthly_revenue`, but
`_lead_estimated_monthly_revenue` only read top-level / `estimation.*`, and the
focus-leads projection didn't even fetch `opportunity_estimation` → always 0.

Fix: read `opportunity_estimation.estimated_monthly_revenue` first (+ project it).
"""
from routes.performance import _lead_estimated_monthly_revenue


def test_reads_opportunity_estimation_emr():
    lead = {"opportunity_estimation": {"estimated_monthly_revenue": 250000}}
    assert _lead_estimated_monthly_revenue(lead) == 250000.0


def test_legacy_estimation_key_still_works():
    lead = {"estimation": {"estimated_monthly_revenue": 12345}}
    assert _lead_estimated_monthly_revenue(lead) == 12345.0


def test_top_level_key_still_works():
    lead = {"estimated_monthly_revenue": 999}
    assert _lead_estimated_monthly_revenue(lead) == 999.0


def test_opportunity_estimation_takes_precedence():
    lead = {
        "estimated_monthly_revenue": 111,
        "opportunity_estimation": {"estimated_monthly_revenue": 432768},
    }
    assert _lead_estimated_monthly_revenue(lead) == 432768.0


def test_computes_from_pricing_when_nothing_stored():
    # 10000 bottles, 50% at ₹20 + 50% at ₹10 => 5000*20 + 5000*10 = 150000
    lead = {
        "opportunity_estimation": {"final_monthly": 10000},
        "proposed_sku_pricing": [
            {"percentage": 50, "price_per_unit": 20},
            {"percentage": 50, "price_per_unit": 10},
        ],
    }
    assert _lead_estimated_monthly_revenue(lead) == 150000.0


def test_zero_when_no_data():
    assert _lead_estimated_monthly_revenue({}) == 0.0
