export const fmtINR = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

export const compactINR = (n) => {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}k`;
  return `${sign}₹${abs.toFixed(0)}`;
};

export const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short', year: '2-digit' }).replace(' ', " '");
};

export const CAT_COLORS = [
  '#0f766e', '#b45309', '#4338ca', '#be185d', '#15803d',
  '#a21caf', '#0369a1', '#c2410c', '#4d7c0f', '#7c3aed',
  '#0e7490', '#b91c1c',
];

export const pctDelta = (cur, prevVal) => {
  if (!prevVal) return null;
  return ((cur - prevVal) / Math.abs(prevVal)) * 100;
};
