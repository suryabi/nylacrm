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

// "Dual" quantity display — chosen packaging + base UOM together, e.g.
// "44 Crates + 8 (536 Bottles)". Falls back to plain "536 Bottles" when the
// packaging is single-unit/unknown. `qty` is always in base units.
export function dualQty(qty, unitsPerPkg, packagingName, baseUom = 'unit') {
  const q = Number(qty) || 0;
  const upp = Math.max(1, Number(unitsPerPkg) || 1);
  const uom = pluralizeUom(baseUom, q);
  if (upp <= 1) return `${q.toLocaleString('en-IN')} ${uom}`;
  const packs = Math.floor(q / upp);
  const rem = q - packs * upp;
  const words = (packagingName || '').trim().replace(/\(.*\)$/, '').trim().split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  const pw = pluralizeUom(words[words.length - 1] || 'Pack', packs);
  return `${packs.toLocaleString('en-IN')} ${pw}${rem > 0 ? ` + ${rem}` : ''} (${q.toLocaleString('en-IN')} ${uom})`;
}

// "Bottle" → "Bottles" when count != 1 (and not already plural).
export function pluralizeUom(uom, count) {
  const u = (uom || 'Bottle').trim();
  if (Number(count) === 1) return u;
  return /s$/i.test(u) ? u : `${u}s`;
}
