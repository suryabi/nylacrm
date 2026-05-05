import React from 'react';
import { Card } from '../ui/card';
import { TrendingUp, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Map status / color name → Tailwind classes for tile + bar segment
const TILE_PALETTE = {
  blue:    { tile: 'bg-blue-50 hover:bg-blue-100 border-blue-200',         bar: 'bg-blue-500',    text: 'text-blue-700' },
  green:   { tile: 'bg-green-50 hover:bg-green-100 border-green-200',      bar: 'bg-green-500',   text: 'text-green-700' },
  emerald: { tile: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200', bar: 'bg-emerald-500', text: 'text-emerald-700' },
  yellow:  { tile: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200',   bar: 'bg-yellow-500',  text: 'text-yellow-700' },
  amber:   { tile: 'bg-amber-50 hover:bg-amber-100 border-amber-200',      bar: 'bg-amber-500',   text: 'text-amber-700' },
  orange:  { tile: 'bg-orange-50 hover:bg-orange-100 border-orange-200',   bar: 'bg-orange-500',  text: 'text-orange-700' },
  red:     { tile: 'bg-red-50 hover:bg-red-100 border-red-200',            bar: 'bg-red-500',     text: 'text-red-700' },
  purple:  { tile: 'bg-purple-50 hover:bg-purple-100 border-purple-200',   bar: 'bg-purple-500',  text: 'text-purple-700' },
  indigo:  { tile: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200',   bar: 'bg-indigo-500',  text: 'text-indigo-700' },
  cyan:    { tile: 'bg-cyan-50 hover:bg-cyan-100 border-cyan-200',         bar: 'bg-cyan-500',    text: 'text-cyan-700' },
  teal:    { tile: 'bg-teal-50 hover:bg-teal-100 border-teal-200',         bar: 'bg-teal-500',    text: 'text-teal-700' },
  gray:    { tile: 'bg-slate-50 hover:bg-slate-100 border-slate-200',      bar: 'bg-slate-400',   text: 'text-slate-700' },
};

const STATUS_COLOR_FALLBACK = {
  new: 'blue', contacted: 'cyan', qualified: 'emerald',
  proposal_internal_review: 'purple', ready_to_share_proposal: 'cyan',
  proposal_shared_with_customer: 'orange', proposal: 'amber',
  trial_in_progress: 'indigo', negotiation: 'orange',
  won: 'green', lost: 'red', not_qualified: 'gray',
};

const resolvePalette = (item) => {
  const key = (item.color && TILE_PALETTE[item.color]) ? item.color : (STATUS_COLOR_FALLBACK[item.status] || 'gray');
  return TILE_PALETTE[key] || TILE_PALETTE.gray;
};

export function PipelineSummaryWidget({ pipeline }) {
  const navigate = useNavigate();
  const items = Array.isArray(pipeline) ? pipeline : [];
  const total = items.reduce((sum, item) => sum + (item.count || 0), 0);
  const handleStatusClick = (status) => navigate(`/leads?status=${status}`);

  return (
    <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50" data-testid="pipeline-widget">
      {/* Header */}
      <div className="p-4 sm:p-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/50 dark:to-teal-900/30 shrink-0">
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span>My Pipeline</span>
        </h2>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-2xl sm:text-3xl font-black tabular-nums text-slate-900 dark:text-white leading-none" data-testid="pipeline-total">{total}</div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mt-0.5">Total leads</div>
          </div>
          <button
            onClick={() => navigate('/leads')}
            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 flex items-center gap-1 hover:underline"
            data-testid="pipeline-view-all"
          >
            View all <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Stacked pipeline bar */}
      {total > 0 && (
        <div className="px-4 sm:px-5">
          <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden" data-testid="pipeline-bar">
            {items.filter(item => item.count > 0).map((item) => {
              const p = resolvePalette(item);
              return (
                <button
                  key={item.status}
                  className={`${p.bar} cursor-pointer hover:opacity-80 transition-opacity`}
                  style={{ width: `${(item.count / total) * 100}%` }}
                  title={`${item.label || item.status}: ${item.count}`}
                  onClick={() => handleStatusClick(item.status)}
                  aria-label={`${item.label || item.status}: ${item.count} leads`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Status tiles grid — horizontally laid out with each tile clearly clickable */}
      <div className="p-4 sm:p-5">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No pipeline data</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3" data-testid="pipeline-tiles">
            {items.map(item => {
              const p = resolvePalette(item);
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
              return (
                <button
                  key={item.status}
                  onClick={() => handleStatusClick(item.status)}
                  className={`group text-left relative rounded-xl border ${p.tile} dark:bg-slate-800/40 dark:border-slate-700/60 transition-all p-3 hover:shadow-md hover:-translate-y-0.5`}
                  data-testid={`pipeline-tile-${item.status}`}
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <span className={`text-xl sm:text-2xl font-black tabular-nums ${p.text} leading-none`}>{item.count || 0}</span>
                    <span className="text-[10px] font-semibold text-slate-400 tabular-nums">{pct}%</span>
                  </div>
                  <div className={`mt-2 h-1 rounded-full ${p.bar} opacity-70`} style={{ width: `${Math.max(pct, 8)}%`, minWidth: '8px' }} />
                  <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 mt-2 leading-tight line-clamp-2">
                    {item.label || (item.status || '').replace(/_/g, ' ')}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
