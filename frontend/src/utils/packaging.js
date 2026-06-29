// Shared base-UOM packaging display helper used across stock-out, stock-in,
// promo, transfer and invoice views so every screen shows the SAME breakdown:
//   "5 × Crate-12 (60 Bottles)"
// `quantity` on an item is always in base units (e.g. bottles). `packages` is
// the number of packs and `packaging_units` is base units per pack. Returns
// null when there is nothing meaningful to show (single base unit / no packs).
export function packagingBreakdown(item, baseUom = 'Bottle') {
  if (!item) return null;
  const packages = Number(item.packages) || 0;
  const units = Number(item.packaging_units) || 0;
  const qty = Number(item.quantity) || 0;
  const uom = pluralizeUom(baseUom || 'Bottle', qty);
  if (packages > 0 && units > 1) {
    const name = item.packaging_type_name || `Pack-${units}`;
    return `${packages} × ${name} (${qty} ${uom})`;
  }
  return null;
}

// "Bottle" → "Bottles" when count != 1 (and not already plural).
export function pluralizeUom(uom, count) {
  const u = (uom || 'Bottle').trim();
  if (Number(count) === 1) return u;
  return /s$/i.test(u) ? u : `${u}s`;
}
