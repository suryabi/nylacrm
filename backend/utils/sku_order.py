"""Master SKU sort-order helpers — keeps SKU lists consistent everywhere.

SKUs with sort_order > 0 come first (ascending); unset/0 go last, then A-Z.
"""
from database import db

UNSET = 10 ** 6


def sort_rank(sku_doc: dict) -> int:
    try:
        so = int(sku_doc.get("sort_order") or 0)
    except (TypeError, ValueError):
        so = 0
    return so if so > 0 else UNSET


async def master_sku_order(sku_ids=None) -> dict:
    """Return {sku_id: rank} from master_skus for consistent ordering."""
    q = {}
    if sku_ids is not None:
        ids = [s for s in sku_ids if s]
        if not ids:
            return {}
        q["id"] = {"$in": ids}
    order = {}
    async for ms in db.master_skus.find(q, {"_id": 0, "id": 1, "sort_order": 1}):
        order[ms["id"]] = sort_rank(ms)
    return order


def sku_sort_key(order: dict, id_field: str = "sku_id", name_field: str = "sku_name"):
    return lambda x: (order.get(x.get(id_field), UNSET), (x.get(name_field) or "").lower())
