import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { investorAPI } from '../utils/api';
import { toast } from 'sonner';
import {
  TrendingUp, TrendingDown, MessageSquare, RotateCcw, Send,
  ChevronLeft, ChevronRight, Save, Trash2, Plus, X
} from 'lucide-react';

const EDITOR_ROLES = ['CEO', 'Director', 'Admin'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const fmt = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return v;
  if (Math.abs(n) >= 10000000) return `${(n / 10000000).toFixed(2)} Cr`;
  if (Math.abs(n) >= 100000) return `${(n / 100000).toFixed(2)} L`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)} K`;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

const fmtPct = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return isNaN(n) ? '—' : `${n.toFixed(1)}%`;
};

const variance = (actual, target) => {
  if (!target) return { value: 0, pct: 0 };
  const v = actual - target;
  const p = (v / Math.abs(target)) * 100;
  return { value: v, pct: p };
};

// --- Sub-components ---

function SummaryCard({ label, fyTarget, lastFyActual, isEditor, value, onChange, overline }) {
  return (
    <div className="bg-white border border-slate-200 p-5 group" data-testid={`summary-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="text-xs font-mono uppercase tracking-[0.1em] text-slate-500 mb-3">{overline || label}</div>
      {isEditor ? (
        <input
          type="number"
          value={fyTarget ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className="w-full h-9 rounded-none border border-slate-300 bg-white px-3 py-1 text-2xl font-mono text-right tracking-tighter text-slate-900 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
          data-testid={`input-${label.toLowerCase().replace(/\s+/g, '-')}`}
        />
      ) : (
        <div className="text-2xl font-mono tracking-tighter text-slate-900">{fmt(fyTarget)}</div>
      )}
      <div className="flex items-center justify-between mt-2 text-xs text-slate-500 font-mono">
        <span>Last FY: {fmt(lastFyActual)}</span>
        {fyTarget > 0 && lastFyActual > 0 && (
          <span className={fyTarget >= lastFyActual ? 'text-emerald-600' : 'text-red-600'}>
            {fmtPct(((fyTarget - lastFyActual) / lastFyActual) * 100)} YoY
          </span>
        )}
      </div>
    </div>
  );
}

function PnlRow({ label, data, isEditor, isBold, isSubtotal, onChange, overrideValue, onReset, autoValue }) {
  const target = data?.fy_target ?? 0;
  const lastFy = data?.last_fy_actual ?? 0;
  const isOverridden = overrideValue !== undefined && overrideValue !== null;

  return (
    <tr className={`hover:bg-slate-50/50 transition-colors group ${isBold ? 'font-semibold' : ''} ${isSubtotal ? 'border-t-2 border-slate-300' : ''}`}>
      <td className={`border-b border-slate-100 py-3 px-4 text-sm ${isBold ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
        {label}
      </td>
      <td className="border-b border-slate-100 py-3 px-4 text-sm font-mono text-right tracking-tight text-slate-800">
        {isEditor && !isSubtotal ? (
          <div className="flex items-center justify-end gap-1">
            <input
              type="number"
              value={target ?? ''}
              onChange={(e) => onChange('fy_target', e.target.value === '' ? 0 : Number(e.target.value))}
              className="w-28 h-7 rounded-none border border-slate-300 bg-white px-2 text-sm font-mono text-right focus:outline-none focus:ring-1 focus:ring-black"
              data-testid={`pnl-target-${label.toLowerCase().replace(/\s+/g, '-')}`}
            />
          </div>
        ) : (
          fmt(target)
        )}
      </td>
      <td className="border-b border-slate-100 py-3 px-4 text-sm font-mono text-right tracking-tight text-slate-800">
        {fmt(lastFy)}
      </td>
      <td className="border-b border-slate-100 py-3 px-4 text-sm font-mono text-right tracking-tight">
        {(() => {
          const v = variance(target, lastFy);
          if (!lastFy) return '—';
          return (
            <span className={v.pct >= 0 ? 'text-emerald-600' : 'text-red-600'}>
              {v.pct >= 0 ? '+' : ''}{fmtPct(v.pct)}
            </span>
          );
        })()}
      </td>
    </tr>
  );
}

function RevenueBuildup({ items, isEditor, onChange }) {
  const total = items.reduce((s, i) => s + (i.fy_target || 0), 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left" data-testid="revenue-buildup-table">
        <thead>
          <tr>
            <th className="border-y border-slate-200 py-3 px-4 text-xs font-mono uppercase tracking-[0.05em] text-slate-500 bg-slate-50 whitespace-nowrap">Revenue Stream</th>
            <th className="border-y border-slate-200 py-3 px-4 text-xs font-mono uppercase tracking-[0.05em] text-slate-500 bg-slate-50 whitespace-nowrap text-right">FY Target</th>
            <th className="border-y border-slate-200 py-3 px-4 text-xs font-mono uppercase tracking-[0.05em] text-slate-500 bg-slate-50 whitespace-nowrap text-right">% of Total</th>
            <th className="border-y border-slate-200 py-3 px-4 text-xs font-mono uppercase tracking-[0.05em] text-slate-500 bg-slate-50 whitespace-nowrap">Growth Drivers</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
              <td className="border-b border-slate-100 py-3 px-4 text-sm text-slate-700">{item.stream}</td>
              <td className="border-b border-slate-100 py-3 px-4 text-sm font-mono text-right tracking-tight">
                {isEditor ? (
                  <input type="number" value={item.fy_target ?? ''} onChange={(e) => onChange(i, 'fy_target', Number(e.target.value) || 0)}
                    className="w-28 h-7 rounded-none border border-slate-300 bg-white px-2 text-sm font-mono text-right focus:outline-none focus:ring-1 focus:ring-black"
                    data-testid={`buildup-target-${i}`} />
                ) : fmt(item.fy_target)}
              </td>
              <td className="border-b border-slate-100 py-3 px-4 text-sm font-mono text-right tracking-tight text-slate-500">
                {total > 0 ? fmtPct((item.fy_target / total) * 100) : '—'}
              </td>
              <td className="border-b border-slate-100 py-3 px-4 text-sm">
                {isEditor ? (
                  <input type="text" value={item.growth_drivers ?? ''} onChange={(e) => onChange(i, 'growth_drivers', e.target.value)}
                    placeholder="Key drivers..."
                    className="w-full h-7 rounded-none border border-slate-300 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                    data-testid={`buildup-drivers-${i}`} />
                ) : (item.growth_drivers || '—')}
              </td>
            </tr>
          ))}
          <tr className="font-semibold border-t-2 border-slate-300">
            <td className="py-3 px-4 text-sm text-slate-900">Total</td>
            <td className="py-3 px-4 text-sm font-mono text-right tracking-tight text-slate-900">{fmt(total)}</td>
            <td className="py-3 px-4 text-sm font-mono text-right text-slate-500">100%</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CommentThread({ comments, section, fy, year, month, onAdd, onDelete }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = comments.filter(c => c.section === section);

  return (
    <div className="mt-2">
      {filtered.length > 0 && (
        <div className="space-y-2 mb-2">
          {filtered.map(c => (
            <div key={c.id} className="border-l-2 border-amber-400 bg-amber-50/50 p-3 text-sm" data-testid={`comment-${c.id}`}>
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-medium text-slate-900 mr-2">{c.author_name}</span>
                  <span className="text-xs font-mono text-slate-500">{c.author_role} · {new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                <button onClick={() => onDelete(c.id)} className="text-slate-400 hover:text-red-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`delete-comment-${c.id}`}>
                  <Trash2 size={12} />
                </button>
              </div>
              <p className="text-slate-700 mt-1">{c.text}</p>
            </div>
          ))}
        </div>
      )}
      {open ? (
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a note..."
            className="flex-1 h-8 rounded-none border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-black"
            data-testid={`comment-input-${section}`}
            onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { onAdd({ section, fy, year, month, text: text.trim() }); setText(''); setOpen(false); } }}
          />
          <button onClick={() => { if (text.trim()) { onAdd({ section, fy, year, month, text: text.trim() }); setText(''); setOpen(false); } }}
            className="bg-black text-white px-3 h-8 text-xs font-medium hover:bg-slate-800 transition-colors" data-testid={`submit-comment-${section}`}>
            <Send size={12} />
          </button>
          <button onClick={() => { setOpen(false); setText(''); }} className="text-slate-400 hover:text-black px-2 h-8"><X size={14} /></button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="text-xs text-slate-400 hover:text-black flex items-center gap-1 transition-colors" data-testid={`add-comment-${section}`}>
          <MessageSquare size={12} /> {filtered.length > 0 ? `${filtered.length} notes` : 'Add note'}
        </button>
      )}
    </div>
  );
}

function MonthlyPnlTable({ targets, actuals, overrides, isEditor, onOverride, onReset }) {
  const PNL_LINES = [
    { key: 'revenue', label: 'Revenue', bold: false },
    { key: 'cogs', label: 'COGS', bold: false },
    { key: 'gross_profit', label: 'Gross Profit', bold: true, subtotal: true },
    { key: 'employee_cost', label: 'Employee Cost', bold: false },
    { key: 'selling_admin', label: 'Selling & Admin', bold: false },
    { key: 'other_overheads', label: 'Other Overheads', bold: false },
    { key: 'ebitda', label: 'EBITDA', bold: true, subtotal: true },
    { key: 'interest', label: 'Interest', bold: false },
    { key: 'depreciation', label: 'Depreciation', bold: false },
    { key: 'tax', label: 'Tax', bold: false },
    { key: 'net_profit', label: 'Net Profit', bold: true, subtotal: true },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left" data-testid="monthly-pnl-table">
        <thead>
          <tr>
            <th className="border-y border-slate-200 py-3 px-4 text-xs font-mono uppercase tracking-[0.05em] text-slate-500 bg-slate-50 whitespace-nowrap">Line Item</th>
            <th className="border-y border-slate-200 py-3 px-4 text-xs font-mono uppercase tracking-[0.05em] text-slate-500 bg-slate-50 whitespace-nowrap text-right">Monthly Target</th>
            <th className="border-y border-slate-200 py-3 px-4 text-xs font-mono uppercase tracking-[0.05em] text-slate-500 bg-slate-50 whitespace-nowrap text-right">Actual</th>
            <th className="border-y border-slate-200 py-3 px-4 text-xs font-mono uppercase tracking-[0.05em] text-slate-500 bg-slate-50 whitespace-nowrap text-right">Variance</th>
          </tr>
        </thead>
        <tbody>
          {PNL_LINES.map(line => {
            const target = targets[line.key] || 0;
            const autoActual = line.key === 'revenue' ? (actuals.revenue || 0) : 0;
            const override = overrides[line.key];
            const actual = override !== undefined && override !== null ? override : autoActual;
            const isOverridden = override !== undefined && override !== null;
            const v = variance(actual, target);

            return (
              <tr key={line.key} className={`hover:bg-slate-50/50 transition-colors group ${line.bold ? 'font-semibold' : ''} ${line.subtotal ? 'border-t-2 border-slate-300' : ''}`}>
                <td className={`border-b border-slate-100 py-3 px-4 text-sm ${line.bold ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                  {line.label}
                  {isOverridden && <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-amber-500" title="Overridden"></span>}
                </td>
                <td className="border-b border-slate-100 py-3 px-4 text-sm font-mono text-right tracking-tight text-slate-800">{fmt(target)}</td>
                <td className={`border-b border-slate-100 py-3 px-4 text-sm font-mono text-right tracking-tight ${isOverridden ? 'bg-amber-50' : ''}`}>
                  {isEditor ? (
                    <div className="flex items-center justify-end gap-1">
                      <input type="number" value={actual ?? ''} onChange={(e) => onOverride(line.key, Number(e.target.value) || 0)}
                        className="w-28 h-7 rounded-none border border-slate-300 bg-white px-2 text-sm font-mono text-right focus:outline-none focus:ring-1 focus:ring-black"
                        data-testid={`monthly-actual-${line.key}`} />
                      {isOverridden && (
                        <button onClick={() => onReset(line.key)} className="bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-black rounded-none px-2 py-1 text-xs font-mono transition-colors border border-slate-200"
                          title="Reset to Auto" data-testid={`reset-${line.key}`}>
                          <RotateCcw size={10} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <span>{fmt(actual)}</span>
                  )}
                </td>
                <td className="border-b border-slate-100 py-3 px-4 text-sm font-mono text-right tracking-tight">
                  {target > 0 ? (
                    <span className={v.pct >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {v.pct >= 0 ? '+' : ''}{fmtPct(v.pct)}
                    </span>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UpdatesList({ updates, isEditor, onChange }) {
  return (
    <div className="space-y-3">
      {updates.map((u, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="text-xs font-mono text-slate-400 mt-2 w-6 shrink-0">{i + 1}.</span>
          {isEditor ? (
            <div className="flex-1 flex gap-2">
              <input type="text" value={u} onChange={(e) => onChange(i, e.target.value)}
                placeholder="Key update..."
                className="flex-1 h-8 rounded-none border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                data-testid={`update-${i}`} />
              <button onClick={() => onChange(i, null)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
            </div>
          ) : (
            <p className="text-sm text-slate-700 mt-1">{u || '—'}</p>
          )}
        </div>
      ))}
      {isEditor && (
        <button onClick={() => onChange(updates.length, '')} className="text-xs text-slate-500 hover:text-black flex items-center gap-1" data-testid="add-update">
          <Plus size={12} /> Add update
        </button>
      )}
    </div>
  );
}


// ---- Main Dashboard ----

export default function InvestorDashboard() {
  const { user } = useAuth();
  const isEditor = EDITOR_ROLES.includes(user?.role);

  const [tab, setTab] = useState('annual');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Annual plan state
  const [fy, setFy] = useState('');
  const [plan, setPlan] = useState(null);
  const [autoComputed, setAutoComputed] = useState({});

  // Monthly state
  const now = new Date();
  const [mYear, setMYear] = useState(now.getFullYear());
  const [mMonth, setMMonth] = useState(now.getMonth() + 1);
  const [monthly, setMonthly] = useState(null);
  const [mActuals, setMActuals] = useState({});
  const [mTargets, setMTargets] = useState({});
  const [mFy, setMFy] = useState('');

  // Comments
  const [comments, setComments] = useState([]);

  // Generate FY options
  const currentYear = now.getFullYear();
  const fyOptions = [];
  for (let y = currentYear - 2; y <= currentYear + 1; y++) {
    fyOptions.push(`FY${y}-${y + 1}`);
  }

  const loadPlan = useCallback(async (selectedFy) => {
    setLoading(true);
    try {
      const params = selectedFy ? selectedFy : undefined;
      const { data } = await investorAPI.getPlan(params);
      setPlan(data.plan);
      setAutoComputed(data.auto_computed);
      setFy(data.fy);

      const { data: cmts } = await investorAPI.getComments({ fy: data.fy, section: undefined });
      setComments(cmts);
    } catch (err) {
      toast.error('Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMonthly = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await investorAPI.getMonthly(mYear, mMonth);
      setMonthly(data.monthly);
      setMActuals(data.actuals);
      setMTargets(data.targets);
      setMFy(data.fy);

      const { data: cmts } = await investorAPI.getComments({ year: mYear, month: mMonth });
      setComments(prev => {
        const annualCmts = prev.filter(c => !c.year);
        return [...annualCmts, ...cmts];
      });
    } catch (err) {
      toast.error('Failed to load monthly data');
    } finally {
      setLoading(false);
    }
  }, [mYear, mMonth]);

  useEffect(() => { loadPlan(); }, [loadPlan]);
  useEffect(() => { if (tab === 'monthly') loadMonthly(); }, [tab, loadMonthly]);

  // Plan field updaters
  const updateSummary = (key, field, val) => {
    setPlan(prev => ({
      ...prev,
      summary: { ...prev.summary, [key]: { ...prev.summary[key], [field]: val } }
    }));
  };
  const updatePnl = (key, field, val) => {
    setPlan(prev => ({
      ...prev,
      pnl: { ...prev.pnl, [key]: { ...prev.pnl[key], [field]: val } }
    }));
  };
  const updateBuildup = (idx, field, val) => {
    setPlan(prev => {
      const items = [...prev.revenue_buildup];
      items[idx] = { ...items[idx], [field]: val };
      return { ...prev, revenue_buildup: items };
    });
  };
  const updatePriorities = (idx, val) => {
    setPlan(prev => {
      const arr = [...prev.priorities];
      if (val === null) { arr.splice(idx, 1); } else { arr[idx] = val; }
      return { ...prev, priorities: arr };
    });
  };
  const updateRisks = (idx, val) => {
    setPlan(prev => {
      const arr = [...prev.risks];
      if (val === null) { arr.splice(idx, 1); } else { arr[idx] = val; }
      return { ...prev, risks: arr };
    });
  };
  const updateSupport = (key, val) => {
    setPlan(prev => ({ ...prev, support: { ...prev.support, [key]: val } }));
  };

  // Monthly updaters
  const updateMonthlyOverride = (key, val) => {
    setMonthly(prev => ({
      ...prev,
      pnl_overrides: { ...prev.pnl_overrides, [key]: val }
    }));
  };
  const resetMonthlyOverride = (key) => {
    setMonthly(prev => {
      const overrides = { ...prev.pnl_overrides };
      delete overrides[key];
      return { ...prev, pnl_overrides: overrides };
    });
  };
  const updateMonthlyUpdates = (idx, val) => {
    setMonthly(prev => {
      const arr = [...(prev.updates || [])];
      if (val === null) { arr.splice(idx, 1); } else { arr[idx] = val; }
      return { ...prev, updates: arr };
    });
  };

  // Save handlers
  const savePlan = async () => {
    setSaving(true);
    try {
      await investorAPI.updatePlan({ fy, plan });
      toast.success('Annual plan saved');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const saveMonthly = async () => {
    setSaving(true);
    try {
      await investorAPI.updateMonthly(mYear, mMonth, monthly);
      toast.success('Monthly update saved');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save monthly data');
    } finally {
      setSaving(false);
    }
  };

  // Comment handlers
  const addComment = async (data) => {
    try {
      const { data: c } = await investorAPI.addComment(data);
      setComments(prev => [c, ...prev]);
    } catch {
      toast.error('Failed to add comment');
    }
  };
  const deleteComment = async (id) => {
    try {
      await investorAPI.deleteComment(id);
      setComments(prev => prev.filter(c => c.id !== id));
    } catch {
      toast.error('Failed to delete comment');
    }
  };

  // Month navigation
  const prevMonth = () => {
    if (mMonth === 1) { setMMonth(12); setMYear(mYear - 1); }
    else { setMMonth(mMonth - 1); }
  };
  const nextMonth = () => {
    if (mMonth === 12) { setMMonth(1); setMYear(mYear + 1); }
    else { setMMonth(mMonth + 1); }
  };

  const PNL_LINES = [
    { key: 'revenue', label: 'Revenue', bold: false },
    { key: 'cogs', label: 'COGS', bold: false },
    { key: 'gross_profit', label: 'Gross Profit', bold: true, subtotal: true },
    { key: 'employee_cost', label: 'Employee Cost', bold: false },
    { key: 'selling_admin', label: 'Selling & Admin', bold: false },
    { key: 'other_overheads', label: 'Other Overheads', bold: false },
    { key: 'ebitda', label: 'EBITDA', bold: true, subtotal: true },
    { key: 'interest', label: 'Interest', bold: false },
    { key: 'depreciation', label: 'Depreciation', bold: false },
    { key: 'tax', label: 'Tax', bold: false },
    { key: 'net_profit', label: 'Net Profit', bold: true, subtotal: true },
  ];

  if (loading && !plan) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="investor-loading">
        <div className="text-sm font-mono text-slate-500">Loading investor data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]" data-testid="investor-dashboard">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="px-6 md:px-10 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl tracking-tighter font-medium text-slate-900" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>
                Investor Dashboard
              </h1>
              <p className="text-sm text-slate-500 mt-1 font-mono">{fy} · {isEditor ? 'Editor Mode' : 'View Only'}</p>
            </div>
            <div className="flex items-center gap-3">
              {tab === 'annual' && (
                <select value={fy} onChange={(e) => { setFy(e.target.value); loadPlan(e.target.value); }}
                  className="h-9 rounded-none border border-slate-300 bg-white px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-black"
                  data-testid="fy-selector">
                  {fyOptions.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              )}
              {isEditor && (
                <button onClick={tab === 'annual' ? savePlan : saveMonthly} disabled={saving}
                  className="bg-black text-white hover:bg-slate-800 rounded-none px-6 py-2 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                  data-testid="save-btn">
                  <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200 mt-4 -mb-[1px]">
            {[
              { id: 'annual', label: 'Annual Plan' },
              { id: 'monthly', label: 'Monthly Update' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors rounded-none outline-none ${tab === t.id ? 'border-black text-black' : 'border-transparent text-slate-500 hover:text-black'}`}
                data-testid={`tab-${t.id}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto space-y-8">

        {/* ===== ANNUAL PLAN TAB ===== */}
        {tab === 'annual' && plan && (
          <>
            {/* Auto-Computed CRM Metrics */}
            <section>
              <div className="text-xs font-mono uppercase tracking-[0.1em] text-slate-500 mb-4">CRM Live Data</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-[1px] bg-slate-200">
                {[
                  { label: 'YTD Revenue', value: autoComputed.revenue },
                  { label: 'Prev FY Revenue', value: autoComputed.prev_fy_revenue },
                  { label: 'Total Accounts', value: autoComputed.total_accounts },
                  { label: 'Outstanding', value: autoComputed.total_outstanding },
                ].map(m => (
                  <div key={m.label} className="bg-white p-4" data-testid={`crm-${m.label.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="text-xs font-mono uppercase tracking-[0.1em] text-slate-500 mb-1">{m.label}</div>
                    <div className="text-xl font-mono tracking-tighter text-slate-900">{fmt(m.value)}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* FY Summary KPIs */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-mono uppercase tracking-[0.1em] text-slate-500">FY Targets</div>
                <CommentThread comments={comments} section="summary" fy={fy} onAdd={addComment} onDelete={deleteComment} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-[1px] bg-slate-200">
                {Object.entries(plan.summary).map(([key, val]) => (
                  <SummaryCard key={key} label={key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    overline={key.replace(/_/g, ' ').toUpperCase()}
                    fyTarget={val.fy_target} lastFyActual={val.last_fy_actual}
                    isEditor={isEditor}
                    onChange={(v) => updateSummary(key, 'fy_target', v)} />
                ))}
              </div>
            </section>

            {/* Revenue Build-Up */}
            <section>
              <div className="bg-white border border-slate-200">
                <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                  <h2 className="text-lg tracking-tight font-medium text-slate-900" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>Revenue Build-Up</h2>
                  <CommentThread comments={comments} section="revenue_buildup" fy={fy} onAdd={addComment} onDelete={deleteComment} />
                </div>
                <RevenueBuildup items={plan.revenue_buildup} isEditor={isEditor} onChange={updateBuildup} />
              </div>
            </section>

            {/* P&L Statement */}
            <section>
              <div className="bg-white border border-slate-200">
                <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                  <h2 className="text-lg tracking-tight font-medium text-slate-900" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>P&L Statement</h2>
                  <CommentThread comments={comments} section="pnl" fy={fy} onAdd={addComment} onDelete={deleteComment} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left" data-testid="pnl-table">
                    <thead>
                      <tr>
                        <th className="border-y border-slate-200 py-3 px-4 text-xs font-mono uppercase tracking-[0.05em] text-slate-500 bg-slate-50 whitespace-nowrap">Line Item</th>
                        <th className="border-y border-slate-200 py-3 px-4 text-xs font-mono uppercase tracking-[0.05em] text-slate-500 bg-slate-50 whitespace-nowrap text-right">FY Target</th>
                        <th className="border-y border-slate-200 py-3 px-4 text-xs font-mono uppercase tracking-[0.05em] text-slate-500 bg-slate-50 whitespace-nowrap text-right">Last FY Actual</th>
                        <th className="border-y border-slate-200 py-3 px-4 text-xs font-mono uppercase tracking-[0.05em] text-slate-500 bg-slate-50 whitespace-nowrap text-right">Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PNL_LINES.map(line => (
                        <PnlRow key={line.key} label={line.label} data={plan.pnl[line.key]}
                          isEditor={isEditor} isBold={line.bold} isSubtotal={line.subtotal}
                          onChange={(field, val) => updatePnl(line.key, field, val)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Priorities & Risks side by side */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-[1px] bg-slate-200">
              <div className="bg-white border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg tracking-tight font-medium text-slate-900" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>Top Priorities</h2>
                  <CommentThread comments={comments} section="priorities" fy={fy} onAdd={addComment} onDelete={deleteComment} />
                </div>
                <UpdatesList updates={plan.priorities} isEditor={isEditor} onChange={updatePriorities} />
              </div>
              <div className="bg-white border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg tracking-tight font-medium text-slate-900" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>Key Risks</h2>
                  <CommentThread comments={comments} section="risks" fy={fy} onAdd={addComment} onDelete={deleteComment} />
                </div>
                <UpdatesList updates={plan.risks} isEditor={isEditor} onChange={updateRisks} />
              </div>
            </section>

            {/* Support Needed */}
            <section>
              <div className="bg-white border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg tracking-tight font-medium text-slate-900" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>Support Needed from Board</h2>
                  <CommentThread comments={comments} section="support" fy={fy} onAdd={addComment} onDelete={deleteComment} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(plan.support).map(([key, val]) => (
                    <div key={key}>
                      <label className="text-xs font-mono uppercase tracking-[0.1em] text-slate-500 mb-1 block">{key.replace(/_/g, ' ')}</label>
                      {isEditor ? (
                        <textarea value={val ?? ''} onChange={(e) => updateSupport(key, e.target.value)}
                          className="w-full min-h-[60px] rounded-none border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                          data-testid={`support-${key}`} />
                      ) : (
                        <p className="text-sm text-slate-700">{val || '—'}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        {/* ===== MONTHLY UPDATE TAB ===== */}
        {tab === 'monthly' && monthly && (
          <>
            {/* Month Navigator */}
            <section className="flex items-center justify-between">
              <button onClick={prevMonth} className="bg-white border border-slate-300 hover:border-black p-2 transition-colors" data-testid="prev-month">
                <ChevronLeft size={16} />
              </button>
              <div className="text-center">
                <div className="text-2xl tracking-tighter font-medium text-slate-900" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>
                  {MONTHS[mMonth - 1]} {mYear}
                </div>
                <div className="text-xs font-mono text-slate-500 mt-1">{mFy}</div>
              </div>
              <button onClick={nextMonth} className="bg-white border border-slate-300 hover:border-black p-2 transition-colors" data-testid="next-month">
                <ChevronRight size={16} />
              </button>
            </section>

            {/* Monthly Quick Stats */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-[1px] bg-slate-200">
              {[
                { label: 'Revenue', value: mActuals.revenue, target: mTargets.revenue },
                { label: 'Gross Revenue', value: mActuals.gross_revenue },
                { label: 'New Customers', value: mActuals.new_customers },
                { label: 'Orders Won', value: mActuals.orders_won },
              ].map(m => {
                const v = m.target ? variance(m.value, m.target) : null;
                return (
                  <div key={m.label} className="bg-white p-4" data-testid={`monthly-stat-${m.label.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="text-xs font-mono uppercase tracking-[0.1em] text-slate-500 mb-1">{m.label}</div>
                    <div className="text-xl font-mono tracking-tighter text-slate-900">{fmt(m.value)}</div>
                    {v && (
                      <div className="flex items-center gap-1 mt-1">
                        {v.pct >= 0 ? <TrendingUp size={12} className="text-emerald-600" /> : <TrendingDown size={12} className="text-red-600" />}
                        <span className={`text-xs font-mono ${v.pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{v.pct >= 0 ? '+' : ''}{fmtPct(v.pct)} vs target</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>

            {/* Monthly P&L */}
            <section>
              <div className="bg-white border border-slate-200">
                <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                  <h2 className="text-lg tracking-tight font-medium text-slate-900" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>
                    P&L — {MONTHS[mMonth - 1]} {mYear}
                  </h2>
                  <CommentThread comments={comments} section="monthly_pnl" year={mYear} month={mMonth} onAdd={addComment} onDelete={deleteComment} />
                </div>
                <MonthlyPnlTable
                  targets={mTargets}
                  actuals={mActuals}
                  overrides={monthly.pnl_overrides || {}}
                  isEditor={isEditor}
                  onOverride={updateMonthlyOverride}
                  onReset={resetMonthlyOverride}
                />
              </div>
            </section>

            {/* CEO Updates */}
            <section>
              <div className="bg-white border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg tracking-tight font-medium text-slate-900" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>Key Updates</h2>
                  <CommentThread comments={comments} section="monthly_updates" year={mYear} month={mMonth} onAdd={addComment} onDelete={deleteComment} />
                </div>
                <UpdatesList updates={monthly.updates || []} isEditor={isEditor} onChange={updateMonthlyUpdates} />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
