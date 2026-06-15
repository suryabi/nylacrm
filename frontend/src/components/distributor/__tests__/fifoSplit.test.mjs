// Standalone verification of the Stock Out FIFO batch auto-split algorithm
// mirrored from DistributorDetail.handleCreateDelivery. Run: node fifoSplit.test.mjs

function splitLineFIFO(item, batches, sourceTracksBatches) {
  const pkgUnits = parseInt(item.packaging_units) || 1;
  const demandPkgs = parseInt(item.quantity) || 0;
  const lineFor = (pkgs, batchId, batchCode) => ({
    sku_id: item.sku_id,
    quantity: pkgs * pkgUnits,
    packages: pkgs,
    packaging_units: pkgUnits,
    batch_id: batchId || null,
    batch_code: batchCode || null,
  });
  if (!sourceTracksBatches) return [lineFor(demandPkgs, item.batch_id, item.batch_code)];
  if (item.batch_id) {
    const sel = batches.find((b) => b.batch_id === item.batch_id);
    if (sel && demandPkgs * pkgUnits <= (sel.quantity || 0)) {
      return [lineFor(demandPkgs, sel.batch_id, sel.batch_code)];
    }
  }
  const ak = (b) => b.production_date || b.received_at || '';
  const sorted = [...batches].sort((a, b) => {
    const ka = ak(a), kb = ak(b);
    if (ka && kb) return ka.localeCompare(kb);
    if (ka) return -1;
    if (kb) return 1;
    return (a.batch_code || '').localeCompare(b.batch_code || '');
  });
  const out = [];
  let remaining = demandPkgs;
  for (const b of sorted) {
    if (remaining <= 0) break;
    const availPkgs = Math.floor((b.quantity || 0) / pkgUnits);
    const take = Math.min(remaining, availPkgs);
    if (take > 0) { out.push(lineFor(take, b.batch_id, b.batch_code)); remaining -= take; }
  }
  return out.length > 0 ? out : [lineFor(demandPkgs, item.batch_id, item.batch_code)];
}

let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, '\n  got ', g, '\n  want', w); }
}

// Batches: oldest B1 (20 crates), newer B2 (15 crates) — total 35, pkgUnits=1
const batches = [
  { batch_id: 'B1', batch_code: 'B-001', quantity: 20, production_date: '2026-05-01' },
  { batch_id: 'B2', batch_code: 'B-002', quantity: 15, production_date: '2026-05-20' },
];

// 1) THE BUG: demand 35 across two batches → must split 20 + 15 (was blocked before)
eq('demand 35 splits FIFO 20+15',
  splitLineFIFO({ sku_id: 'S', quantity: 35, packaging_units: 1, batch_id: 'B1' }, batches, true),
  [
    { sku_id: 'S', quantity: 20, packages: 20, packaging_units: 1, batch_id: 'B1', batch_code: 'B-001' },
    { sku_id: 'S', quantity: 15, packages: 15, packaging_units: 1, batch_id: 'B2', batch_code: 'B-002' },
  ]);

// 2) demand fully within selected batch → single line, batch honoured
eq('demand 18 fits in B1 → single line',
  splitLineFIFO({ sku_id: 'S', quantity: 18, packaging_units: 1, batch_id: 'B1' }, batches, true),
  [{ sku_id: 'S', quantity: 18, packages: 18, packaging_units: 1, batch_id: 'B1', batch_code: 'B-001' }]);

// 3) demand exactly 20 (oldest batch) → single B1 line
eq('demand 20 == B1 → single line',
  splitLineFIFO({ sku_id: 'S', quantity: 20, packaging_units: 1, batch_id: 'B1' }, batches, true),
  [{ sku_id: 'S', quantity: 20, packages: 20, packaging_units: 1, batch_id: 'B1', batch_code: 'B-001' }]);

// 4) demand 25 > B1(20) → 20 from B1 + 5 from B2
eq('demand 25 → 20+5',
  splitLineFIFO({ sku_id: 'S', quantity: 25, packaging_units: 1, batch_id: 'B1' }, batches, true),
  [
    { sku_id: 'S', quantity: 20, packages: 20, packaging_units: 1, batch_id: 'B1', batch_code: 'B-001' },
    { sku_id: 'S', quantity: 5, packages: 5, packaging_units: 1, batch_id: 'B2', batch_code: 'B-002' },
  ]);

// 5) demand 50 > total 35 → allocates all 35 (frontend guard blocks submit separately)
eq('demand 50 caps at available 35',
  splitLineFIFO({ sku_id: 'S', quantity: 50, packaging_units: 1, batch_id: 'B1' }, batches, true),
  [
    { sku_id: 'S', quantity: 20, packages: 20, packaging_units: 1, batch_id: 'B1', batch_code: 'B-001' },
    { sku_id: 'S', quantity: 15, packages: 15, packaging_units: 1, batch_id: 'B2', batch_code: 'B-002' },
  ]);

// 6) packaging_units=12 (crate of 12), demand 3 crates fits in B1(20 units=1 crate?) — ensure whole-crate allocation
//    B1 has 30 units (2 crates of 12 floor), B2 has 24 units (2 crates). demand 3 crates → 2 from B1 + 1 from B2.
const batches12 = [
  { batch_id: 'C1', batch_code: 'C-1', quantity: 30, production_date: '2026-04-01' },
  { batch_id: 'C2', batch_code: 'C-2', quantity: 24, production_date: '2026-04-10' },
];
eq('pkgUnits=12 whole-crate split 2+1',
  splitLineFIFO({ sku_id: 'S', quantity: 3, packaging_units: 12, batch_id: 'C1' }, batches12, true),
  [
    { sku_id: 'S', quantity: 24, packages: 2, packaging_units: 12, batch_id: 'C1', batch_code: 'C-1' },
    { sku_id: 'S', quantity: 12, packages: 1, packaging_units: 12, batch_id: 'C2', batch_code: 'C-2' },
  ]);

// 7) non-batch source → unchanged single line
eq('non-batch source single line',
  splitLineFIFO({ sku_id: 'S', quantity: 35, packaging_units: 1, batch_id: '' }, [], false),
  [{ sku_id: 'S', quantity: 35, packages: 35, packaging_units: 1, batch_id: null, batch_code: null }]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
