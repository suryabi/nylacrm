/**
 * Global currency helpers. The active tenant's currency symbol & code are
 * synced into `window.__TENANT_CURRENCY_SYMBOL` / `localStorage` by
 * `TenantConfigContext` when the tenant config loads. These helpers read from
 * that live source so any code — hooks or plain utilities — always reflects
 * the currently selected tenant currency.
 */

export const DEFAULT_CURRENCY = { code: 'INR', symbol: '\u20B9' };

/** Get the active currency symbol (falls back to ₹). */
export const getCurrencySymbol = () => {
  if (typeof window !== 'undefined') {
    const s = window.__TENANT_CURRENCY_SYMBOL || localStorage.getItem('tenant_currency_symbol');
    if (s) return s;
  }
  return DEFAULT_CURRENCY.symbol;
};

/** Get the active currency code (ISO 4217-ish; falls back to INR). */
export const getCurrencyCode = () => {
  if (typeof window !== 'undefined') {
    const c = window.__TENANT_CURRENCY_CODE || localStorage.getItem('tenant_currency_code');
    if (c) return c;
  }
  return DEFAULT_CURRENCY.code;
};

/**
 * Sync the active currency into the global scope. Called by TenantConfigContext.
 */
export const syncTenantCurrency = (code, symbol) => {
  if (typeof window === 'undefined') return;
  const c = code || DEFAULT_CURRENCY.code;
  const s = symbol || DEFAULT_CURRENCY.symbol;
  window.__TENANT_CURRENCY_CODE = c;
  window.__TENANT_CURRENCY_SYMBOL = s;
  try {
    localStorage.setItem('tenant_currency_code', c);
    localStorage.setItem('tenant_currency_symbol', s);
  } catch { /* ignore quota errors */ }
};

/**
 * Format a numeric amount with the active currency symbol.
 * Options: { short: true } → 1.2K / 3.4M compact form; { decimals: n }.
 */
export const formatCurrency = (amount, opts = {}) => {
  const { short = false, decimals } = opts;
  const sym = getCurrencySymbol();
  const num = Number(amount);
  if (!Number.isFinite(num)) return `${sym}0`;

  if (short) {
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (abs >= 1e7) return `${sign}${sym}${(abs / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5) return `${sign}${sym}${(abs / 1e5).toFixed(2)}L`;
    if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(1)}K`;
    return `${sign}${sym}${abs.toFixed(0)}`;
  }
  const d = Number.isFinite(decimals) ? decimals : 2;
  return `${sym}${num.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
