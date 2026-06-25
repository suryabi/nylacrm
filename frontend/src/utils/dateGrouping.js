// Groups a list of records by their date (YYYY-MM-DD), sorted DESCENDING.
// Today and tomorrow are flagged so the UI can highlight them — they matter
// most for scheduling.

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function groupByDateDesc(items, getDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const todayKey = ymd(today);
  const tomorrowKey = ymd(tomorrow);

  const groups = {};
  (items || []).forEach((it) => {
    const raw = getDate(it);
    const key = raw ? String(raw).slice(0, 10) : 'no-date';
    (groups[key] = groups[key] || []).push(it);
  });

  const keys = Object.keys(groups).sort((a, b) => {
    if (a === 'no-date') return 1;
    if (b === 'no-date') return -1;
    return a < b ? 1 : a > b ? -1 : 0; // descending
  });

  return keys.map((key) => {
    const isToday = key === todayKey;
    const isTomorrow = key === tomorrowKey;
    const isFuture = key !== 'no-date' && key > tomorrowKey;
    const isPast = key !== 'no-date' && key < todayKey;
    // Whole days between this date and today (positive = in the past).
    let daysAgo = null;
    if (key !== 'no-date') {
      const d = new Date(key + 'T00:00:00');
      daysAgo = Math.round((today - d) / 86400000);
    }
    let label;
    if (key === 'no-date') label = 'No date';
    else if (isToday) label = 'Today';
    else if (isTomorrow) label = 'Tomorrow';
    else label = new Date(key + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    return { key, label, isToday, isTomorrow, isFuture, isPast, daysAgo, items: groups[key] };
  });
}
