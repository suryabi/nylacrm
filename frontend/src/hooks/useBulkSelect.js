import { useState, useCallback } from 'react';

/**
 * Reusable multi-select hook for tables/lists.
 *
 * Usage:
 *   const { selected, isSelected, toggle, toggleAll, clear, size } = useBulkSelect();
 *   ...
 *   <Checkbox checked={size > 0 && size === rows.length} onCheckedChange={() => toggleAll(rows.map(r => r.id))} />
 *   <Checkbox checked={isSelected(row.id)} onCheckedChange={() => toggle(row.id)} />
 */
export function useBulkSelect() {
  const [selected, setSelected] = useState(() => new Set());

  const toggle = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids) => {
    setSelected((prev) => {
      const allIn = ids.every((i) => prev.has(i));
      if (allIn) {
        const next = new Set(prev);
        ids.forEach((i) => next.delete(i));
        return next;
      }
      const next = new Set(prev);
      ids.forEach((i) => next.add(i));
      return next;
    });
  }, []);

  const isSelected = useCallback((id) => selected.has(id), [selected]);
  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selected,
    ids: Array.from(selected),
    size: selected.size,
    isSelected,
    toggle,
    toggleAll,
    clear,
  };
}
