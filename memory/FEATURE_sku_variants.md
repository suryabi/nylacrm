# Feature Spec — SKU Hierarchy & Variant Management (PLANNED, not started)

Status: APPROVED DESIGN — implementation deferred (user will revisit).
Date: 2026-06-22

## Locked decisions (from user)
1. **Storage:** Separate `sku_variants` collection linked to a parent SKU. The existing
   **SKU Management module (`master_skus` CRUD) must NOT be altered / stays as-is.**
2. **Parent inventory = DERIVED** = sum of its variants' inventory (single source of truth; conversions never change parent total).
3. **Opt-in per SKU:** Only specific SKUs are flagged variant-enabled in SKU Management.
   NOT all SKUs are eligible. Rolling out fresh: ALL existing stock is treated as the
   **parent's "Standard / Unbranded" variant**.
4. **Variant Conversion happens at the FACTORY WAREHOUSE only** (for now). Distributor-level
   re-branding is out of scope for v1.

## Data model
- `master_skus` (UNCHANGED). Add NOTHING that breaks current UI. The only linkage is a
  lightweight flag — TBD whether stored on master_skus (`variant_enabled: bool`) or in a
  separate `sku_variant_config` doc to honor "SKU Management can't be altered". **Decision
  at build time:** prefer a separate `sku_variant_config` collection keyed by `parent_sku_id`
  so the master_skus schema/UI is untouched.
- `sku_variants` (NEW): `{ id, tenant_id, parent_sku_id, variant_code, variant_name,
  customer_account_id?, is_standard (the Unbranded/Standard one), is_active, sort_order,
  created_at/by }`. Each parent that is variant-enabled auto-gets one `is_standard` variant.
- `factory_warehouse_stock` (EXISTING): gains optional `variant_id`. Rows with no `variant_id`
  = legacy/parent-level → treated as the Standard variant for variant-enabled parents.
- `sku_variant_conversions` (NEW): audit ledger — `{ id, tenant_id, warehouse_location_id,
  parent_sku_id, from_variant_id, to_variant_id, quantity, batch_id?, reason, by_user, created_at }`.

## Inventory rules
- Parent on-hand at a warehouse = Σ variant on-hand (derived; never stored separately).
- Conversion = atomic transfer: `from_variant -= qty`, `to_variant += qty`. Parent total unchanged.
- Guard: cannot convert more than the from-variant's available (on-hand − reserved).

## Phasing (proposed)
- **Phase 1 (P0):** `sku_variants` + `sku_variant_config` models & CRUD APIs. New admin UI to
  enable variants on an eligible SKU and manage its child variants (kept SEPARATE from the
  untouched SKU Management screen — likely a "Variants" tab/section). Auto-create Standard variant.
- **Phase 2 (P0):** Factory-warehouse Variant Conversion transaction + ledger; dual inventory
  views (parent-derived total + per-variant breakdown) on the factory warehouse stock screens.
- **Phase 3 (P1):** Variant-aware factory→distributor dispatch (stock-out picks a variant);
  prevent wrong-variant shipment. (Distributor stock variant tracking only if/when needed.)
- **Phase 4 (P1):** Reporting — parent vs variant inventory, sales-by-brand/customer,
  conversion history, slow-moving branded stock.

## Open items to confirm before build
- Variant code format/auto-suggest (e.g. `<parent_code>-MIDORI`).
- Whether a variant maps to a specific customer/account (for "Customer A Edition").
- Migration script: backfill `is_standard` variant for each variant-enabled SKU and tag
  existing factory stock rows as Standard.

## Guardrails
- DO NOT modify the existing SKU Management CRUD/screens.
- master_skus stays global/unchanged; variant data is additive and tenant-scoped.
