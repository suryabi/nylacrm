import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, Loader2, ReceiptText, ArrowLeft, PieChart as PieIcon,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { fmtINR, compactINR, CAT_COLORS } from './dashUtils';

const API = process.env.REACT_APP_BACKEND_URL;
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, withCredentials: true });

const DonutTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-white/40 bg-white/75 backdrop-blur-md px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold">{p.name}</div>
      <div className="tabular-nums">{fmtINR(p.value)} · {p.payload.pct}%</div>
    </div>
  );
};

const TxnTable = ({ txns, loading }) => {
  if (loading) return <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!txns?.items?.length) return <p className="text-sm text-muted-foreground py-8 text-center">No transactions found</p>;
  return (
    <div className="overflow-x-auto" data-testid="drilldown-txn-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <th className="py-2 pr-3 font-semibold">Date</th>
            <th className="py-2 pr-3 font-semibold">Code</th>
            <th className="py-2 pr-3 font-semibold">Payee</th>
            <th className="py-2 pr-3 font-semibold">Description</th>
            <th className="py-2 pr-3 font-semibold">Category</th>
            <th className="py-2 pl-3 font-semibold text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {txns.items.map((t) => (
            <tr key={t.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
              <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{t.date}</td>
              <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">{t.txn_code}</td>
              <td className="py-2 pr-3 max-w-[180px] truncate">{t.payee || '—'}</td>
              <td className="py-2 pr-3 max-w-[260px] truncate text-muted-foreground">{t.description || '—'}</td>
              <td className="py-2 pr-3 whitespace-nowrap text-xs">{t.category_name}</td>
              <td className="py-2 pl-3 text-right font-semibold tabular-nums whitespace-nowrap">{fmtINR(t.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {txns.total > txns.items.length && (
        <p className="text-xs text-muted-foreground mt-2">Showing {txns.items.length} of {txns.total} — open Transactions page for the full list</p>
      )}
    </div>
  );
};

export const CategoryDrilldown = ({ dateStart, dateEnd }) => {
  const [tag, setTag] = useState('expense_category');
  const [stack, setStack] = useState([]); // [{id, name}] path below root
  const [items, setItems] = useState([]);
  const [txns, setTxns] = useState(null); // when set → transactions view
  const [loading, setLoading] = useState(false);

  const rootLabel = tag === 'expense_category' ? 'All Expenses' : 'All Income';
  const parent = stack.length ? stack[stack.length - 1] : null;

  const fetchLevel = useCallback(async (parentId) => {
    setLoading(true);
    setTxns(null);
    try {
      const { data } = await axios.get(`${API}/api/accounting/transactions/dashboard/category-breakdown`, {
        ...auth(),
        params: { tag, parent_id: parentId || undefined, date_start: dateStart, date_end: dateEnd },
      });
      setItems(data.items || []);
    } catch (e) { setItems([]); toast.error('Could not load category breakdown'); }
    setLoading(false);
  }, [tag, dateStart, dateEnd]);

  const fetchTxns = async (node) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/accounting/transactions/dashboard/category-transactions`, {
        ...auth(),
        params: { tag, category_id: node.id, date_start: dateStart, date_end: dateEnd },
      });
      setTxns(data);
    } catch (e) { setTxns({ items: [], total: 0 }); toast.error('Could not load transactions'); }
    setLoading(false);
  };

  useEffect(() => { setStack([]); fetchLevel(null); }, [fetchLevel]);

  const drillInto = (node) => {
    setStack((s) => [...s, { id: node.id, name: node.name }]);
    if (node.has_children) fetchLevel(node.id);
    else { setItems([]); fetchTxns(node); }
  };

  const jumpTo = (idx) => {
    // idx = -1 → root
    const next = idx < 0 ? [] : stack.slice(0, idx + 1);
    setStack(next);
    fetchLevel(next.length ? next[next.length - 1].id : null);
  };

  const max = Math.max(...items.map((i) => i.total), 1);
  const grand = items.reduce((a, b) => a + b.total, 0);
  const donutData = items.slice(0, 9);
  const rest = items.slice(9).reduce((a, b) => a + b.total, 0);
  if (rest > 0) donutData.push({ id: '__rest', name: 'Others', total: rest, pct: grand ? +(rest / grand * 100).toFixed(1) : 0 });
  const accent = tag === 'expense_category' ? 'text-red-700' : 'text-emerald-700';

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="acc-dash-drilldown">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Where the money {tag === 'expense_category' ? 'goes' : 'comes from'}</h2>
          <p className="text-xs text-muted-foreground">Click a category to drill down to sub-categories, then transactions</p>
        </div>
        <div className="rounded-full bg-secondary p-1 flex text-sm">
          {[['expense_category', 'Expenses'], ['income_category', 'Income']].map(([k, label]) => (
            <button key={k} onClick={() => { setTag(k); }} data-testid={`drilldown-tab-${k}`}
              className={`rounded-full px-4 py-1.5 font-medium transition-colors ${tag === k ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-sm mb-4" data-testid="drilldown-breadcrumb">
        {stack.length > 0 && (
          <button onClick={() => jumpTo(stack.length - 2)} className="mr-1 rounded-md p-1 hover:bg-muted transition-colors" data-testid="drilldown-back-btn" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <button onClick={() => jumpTo(-1)} data-testid="drilldown-crumb-root"
          className={`font-medium ${stack.length ? 'text-muted-foreground hover:text-foreground hover:underline' : ''}`}>
          {rootLabel}
        </button>
        {stack.map((s, i) => (
          <React.Fragment key={s.id}>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <button onClick={() => i < stack.length - 1 && jumpTo(i)} data-testid={`drilldown-crumb-${i}`}
              className={`font-medium ${i < stack.length - 1 ? 'text-muted-foreground hover:text-foreground hover:underline' : accent}`}>
              {s.name}
            </button>
          </React.Fragment>
        ))}
        {grand > 0 && !txns && <span className="ml-auto text-sm font-semibold tabular-nums">{fmtINR(grand)}</span>}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={`${tag}-${stack.map((s) => s.id).join('/')}-${txns ? 'txn' : 'lvl'}`}
          initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
          {txns ? (
            <TxnTable txns={txns} loading={loading} />
          ) : loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No tagged transactions at this level</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3 space-y-1.5">
                {items.map((it, idx) => (
                  <button key={it.id} onClick={() => drillInto(it)} data-testid={`drilldown-row-${idx}`}
                    className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-muted/60 transition-colors group focus:outline-none focus:ring-2 focus:ring-ring">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: CAT_COLORS[idx % CAT_COLORS.length] }} />
                      <span className="text-sm font-medium truncate">{it.name}</span>
                      <span className="text-[11px] text-muted-foreground shrink-0">{it.count} txns</span>
                      <span className="ml-auto text-sm font-semibold tabular-nums shrink-0" title={fmtINR(it.total)}>{compactINR(it.total)}</span>
                      <span className="text-xs text-muted-foreground tabular-nums w-11 text-right shrink-0">{it.pct}%</span>
                      {it.has_children
                        ? <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
                        : <ReceiptText className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </div>
                    <div className="mt-1.5 ml-[18px] h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${(it.total / max) * 100}%`, background: CAT_COLORS[idx % CAT_COLORS.length] }} />
                    </div>
                  </button>
                ))}
              </div>
              <div className="lg:col-span-2 flex flex-col items-center justify-center min-h-[220px]">
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={donutData} dataKey="total" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} strokeWidth={0}>
                      {donutData.map((d, i) => <Cell key={d.id} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<DonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground -mt-2"><PieIcon className="h-3.5 w-3.5" /> Share of {tag === 'expense_category' ? 'spend' : 'income'}</div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
