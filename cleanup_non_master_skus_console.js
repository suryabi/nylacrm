/* ============================================================
 *  Browser-console cleanup script
 *  Removes references to SKUs that are NOT in master_skus from
 *  the data sources that feed the SKU Performance report:
 *    • sku_targets               (deleted)
 *    • leads.interested_skus[]   (non-master entries pulled)
 *    • invoices.items[]/line_items[]  (non-master line items pulled)
 *
 *  Usage:
 *    1) Log in to the CRM as CEO or System Admin in the browser.
 *    2) Open DevTools → Console on the same tab.
 *    3) Paste this entire script and press Enter.
 *    4) A DRY-RUN report prints first. Confirm the prompt to apply.
 *
 *  Safety:
 *    • Master SKU list is the source of truth (no rows deleted there).
 *    • Invoice headers / totals are untouched — only orphan line
 *      items whose SKU isn't in master are pulled.
 *    • Permissions: CEO / System Admin only (backend enforced).
 * ============================================================ */
(async () => {
  const base = window.location.origin;
  const url  = `${base}/api/admin/cleanup-non-master-skus`;

  const post = async (dry) => {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'CLEANUP_SKUS', dry_run: dry }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    return res.json();
  };

  const fmt = (label, block) => {
    console.groupCollapsed(`%c${label}`, 'font-weight:bold;color:#0b5');
    console.table(block.non_master_sku_breakdown || {});
    console.log(block);
    console.groupEnd();
  };

  try {
    console.log('%c[1/2] Running DRY-RUN…', 'color:#08f;font-weight:bold');
    const dry = await post(true);
    console.log('Master SKUs in catalog:', dry.master_sku_count);
    fmt('sku_targets (non-master rows)', dry.sku_targets);
    fmt('leads.interested_skus (non-master entries)', dry.leads_interested_skus);
    fmt('invoices.items (non-master line items)', dry.invoices);

    const totalsMsg =
      `Will delete:\n` +
      `  • ${dry.sku_targets.non_master_rows} sku_targets rows\n` +
      `  • ${dry.leads_interested_skus.entries_removed} lead SKU entries ` +
      `(across ${dry.leads_interested_skus.leads_affected} leads)\n` +
      `  • ${dry.invoices.line_items_removed} invoice line items ` +
      `(across ${dry.invoices.invoices_affected} invoices)\n\n` +
      `Proceed?`;

    if (!window.confirm(totalsMsg)) {
      console.warn('Aborted by user. No changes applied.');
      return;
    }

    console.log('%c[2/2] Executing cleanup…', 'color:#e63;font-weight:bold');
    const run = await post(false);
    console.log('%cDone.', 'color:#0b5;font-weight:bold');
    console.table({
      'sku_targets deleted': run.sku_targets.deleted,
      'lead entries removed': run.leads_interested_skus.entries_removed,
      'leads affected': run.leads_interested_skus.leads_affected,
      'invoice items removed': run.invoices.line_items_removed,
      'invoices affected': run.invoices.invoices_affected,
    });
    console.log('Refresh the SKU Performance page to see the cleaned report.');
  } catch (err) {
    console.error('Cleanup failed:', err);
    alert('Cleanup failed: ' + err.message + '\nCheck the console for details.');
  }
})();
