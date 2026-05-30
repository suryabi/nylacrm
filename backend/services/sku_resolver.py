"""Shared SKU name resolver.

Resolves an invoice / delivery line item to its CURRENT master SKU name so that
historical line items carrying stale denormalized names or retired external
codes consolidate under the current SKU (no rewrite of the source documents).

Resolution order — the external CODE is the source of truth:
  1. line external code (external_sku_id / external_item_id / itemId / item_id /
     sku_code) → current master SKU (matched on master external_sku_id / sku_code)
  2. line external code → alias (sku_aliases, type='code') → current master SKU
  3. line sku_id → current master SKU (matched on master id)
  4. line stored name → current master SKU (it is already a current name)
  5. line stored name → alias (sku_aliases, type='name') → current master SKU
  6. fallback: the stored name verbatim (so nothing is lost)
  7. else: "[Unmapped: <code>]" / None
"""

CODE_KEYS = ("external_sku_id", "external_item_id", "itemId", "item_id", "sku_code")
NAME_KEYS = ("sku_name", "sku", "name", "item_name")


def _norm(v) -> str:
    return str(v).strip() if v is not None else ""


class SkuResolver:
    def __init__(self, ext_to_name, name_to_name, id_to_name,
                 alias_code_to_name, alias_name_to_name):
        self.ext_to_name = ext_to_name              # code -> current name
        self.name_to_name = name_to_name            # lower(current name) -> current name
        self.id_to_name = id_to_name                # sku id -> current name
        self.alias_code_to_name = alias_code_to_name  # code -> current name
        self.alias_name_to_name = alias_name_to_name  # lower(old name) -> current name

    def _code_of(self, item):
        for k in CODE_KEYS:
            v = item.get(k)
            if v:
                return _norm(v)
        return None

    def _name_of(self, item):
        for k in NAME_KEYS:
            v = item.get(k)
            if v:
                return _norm(v)
        return None

    def resolve(self, item):
        """Resolve a line item dict to the current SKU display name."""
        if not isinstance(item, dict):
            return None
        code = self._code_of(item)
        if code:
            if code in self.ext_to_name:
                return self.ext_to_name[code]
            if code in self.alias_code_to_name:
                return self.alias_code_to_name[code]
        sid = item.get("sku_id")
        if sid and _norm(sid) in self.id_to_name:
            return self.id_to_name[_norm(sid)]
        name = self._name_of(item)
        if name:
            low = name.lower()
            if low in self.name_to_name:
                return self.name_to_name[low]
            if low in self.alias_name_to_name:
                return self.alias_name_to_name[low]
        if name:
            return name
        if code:
            return f"[Unmapped: {code}]"
        return None

    def unmapped_key(self, item):
        """Return (type, value) when the item does NOT resolve to a current
        master SKU (i.e. it needs an alias), else None."""
        if not isinstance(item, dict):
            return None
        code = self._code_of(item)
        if code and (code in self.ext_to_name or code in self.alias_code_to_name):
            return None
        sid = item.get("sku_id")
        if sid and _norm(sid) in self.id_to_name:
            return None
        name = self._name_of(item)
        if name and (name.lower() in self.name_to_name or name.lower() in self.alias_name_to_name):
            return None
        if code:
            return ("code", code)
        if name:
            return ("name", name)
        return None

    def enrich_items(self, items):
        """Return items with `sku_name` set to the resolved current name."""
        out = []
        for it in (items or []):
            if isinstance(it, dict):
                nm = self.resolve(it)
                if nm and not str(nm).startswith("[Unmapped"):
                    it = {**it, "sku_name": nm}
            out.append(it)
        return out


async def build_sku_resolver(tdb) -> SkuResolver:
    """Build a resolver from the tenant's master_skus + sku_aliases."""
    masters = await tdb.master_skus.find({}, {"_id": 0}).to_list(2000)
    ext_to_name, name_to_name, id_to_name = {}, {}, {}
    for m in masters:
        name = m.get("sku_name") or m.get("sku") or m.get("name")
        if not name:
            continue
        name = str(name).strip()
        if m.get("id"):
            id_to_name[_norm(m["id"])] = name
        for k in ("external_sku_id", "sku_code", "external_id"):
            v = m.get(k)
            if v:
                ext_to_name[_norm(v)] = name
        name_to_name[name.lower()] = name

    alias_code_to_name, alias_name_to_name = {}, {}
    try:
        aliases = await tdb.sku_aliases.find({}, {"_id": 0}).to_list(10000)
    except Exception:
        aliases = []
    for a in aliases:
        target_name = id_to_name.get(_norm(a.get("target_sku_id"))) if a.get("target_sku_id") else None
        if not target_name:
            tn = a.get("target_sku_name")
            if tn and tn.lower() in name_to_name:
                target_name = name_to_name[tn.lower()]
        av = _norm(a.get("alias_value"))
        if not target_name or not av:
            continue
        atype = a.get("alias_type")
        if atype == "code":
            alias_code_to_name[av] = target_name
        elif atype == "name":
            alias_name_to_name[av.lower()] = target_name
        else:
            alias_code_to_name[av] = target_name
            alias_name_to_name[av.lower()] = target_name

    return SkuResolver(ext_to_name, name_to_name, id_to_name,
                       alias_code_to_name, alias_name_to_name)
