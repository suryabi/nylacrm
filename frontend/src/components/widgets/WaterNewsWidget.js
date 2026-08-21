import React, { useEffect, useRef, useState } from 'react';
import { Droplets, ExternalLink, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '');

export const WaterNewsWidget = () => {
  const [articles, setArticles] = useState([]);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(true);
  const [newIds, setNewIds] = useState(new Set());
  const hoverRef = useRef(false);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    fetch(`${API_URL}/api/water-intelligence/home-feed?limit=8`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((r) => (r.ok ? r.json() : { articles: [] }))
      .then((d) => {
        const list = d.articles || [];
        setArticles(list);
        const lastSeen = localStorage.getItem('water_brief_last_seen');
        if (lastSeen) {
          const fresh = new Set(list.filter((a) => (a.published_at || a.approved_at || a.created_at || '') > lastSeen).map((a) => a.id));
          setNewIds(fresh);
        }
        localStorage.setItem('water_brief_last_seen', new Date().toISOString());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (articles.length < 2) return;
    const t = setInterval(() => {
      if (!hoverRef.current) setIdx((i) => (i + 1) % articles.length);
    }, 6000);
    return () => clearInterval(t);
  }, [articles.length]);

  if (articles.length === 0) return null;
  const a = articles[idx];

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-[#002FA7]/15 bg-gradient-to-r from-[#002FA7]/[0.05] via-white to-white dark:from-[#002FA7]/20 dark:via-slate-900 dark:to-slate-900 shadow-sm"
      onMouseEnter={() => { hoverRef.current = true; }}
      onMouseLeave={() => { hoverRef.current = false; }}
      data-testid="home-water-news-widget"
    >
      <div className="absolute left-0 top-0 h-full w-1 bg-[#002FA7]" />
      <div className="flex items-center gap-3 pl-4 pr-3 py-2.5">
        {/* Brand */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Droplets className="h-4 w-4 text-[#002FA7]" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#002FA7] hidden sm:inline">Water Brief</span>
          {newIds.size > 0 && (
            <span className="flex items-center gap-1" data-testid="home-news-new-badge">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#002FA7] opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#002FA7]" />
              </span>
              <span className="text-[10px] font-semibold text-[#002FA7]">{newIds.size} new</span>
            </span>
          )}
        </div>
        <span className="h-4 w-px bg-slate-200 dark:bg-slate-700 shrink-0 hidden sm:block" />

        {/* Rotating headline */}
        <button
          key={a.id}
          className="flex-1 min-w-0 text-left animate-in fade-in slide-in-from-bottom-1 duration-500 group"
          onClick={() => setOpen((o) => !o)}
          data-testid="home-news-headline"
          title={open ? 'Hide details' : 'Show details'}
        >
          <span className="flex items-center gap-2 min-w-0">
            {newIds.has(a.id) && <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-[#002FA7]" data-testid="home-news-new-dot" title="New since your last visit" />}
            {a.category && (
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#002FA7] bg-[#002FA7]/10 rounded-full px-2 py-0.5">{a.category}</span>
            )}
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-[#002FA7] transition-colors">{a.headline}</span>
            <span className="shrink-0 text-[11px] text-slate-400 hidden md:inline">{fmtDate(a.published_at || a.approved_at)}</span>
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {/* Nav */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-slate-500 font-medium tabular-nums mr-0.5 hidden sm:inline">{idx + 1}/{articles.length}</span>
          <button className="h-8 w-8 flex items-center justify-center rounded-full border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-600 text-[#002FA7] shadow-sm hover:bg-[#002FA7] hover:text-white hover:border-[#002FA7] transition-colors"
            onClick={() => setIdx((i) => (i - 1 + articles.length) % articles.length)} data-testid="home-news-prev">
            <ChevronLeft style={{ height: 18, width: 18 }} />
          </button>
          <button className="h-8 w-8 flex items-center justify-center rounded-full border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-600 text-[#002FA7] shadow-sm hover:bg-[#002FA7] hover:text-white hover:border-[#002FA7] transition-colors"
            onClick={() => setIdx((i) => (i + 1) % articles.length)} data-testid="home-news-next">
            <ChevronRight style={{ height: 18, width: 18 }} />
          </button>
        </div>
      </div>

      {/* Details — only when the user asks */}
      {open && (
        <div className="px-4 pb-3.5 pt-0.5 pl-5 animate-in fade-in slide-in-from-top-1 duration-300" data-testid="home-news-details">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">{a.summary}</p>
          {a.why_it_matters && (
            <p className="text-xs text-slate-700 dark:text-slate-200 mt-2 max-w-3xl">
              <span className="font-semibold text-[#002FA7]">Why it matters: </span>{a.why_it_matters}
            </p>
          )}
          {a.source_url && (
            <a href={a.source_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium text-[#002FA7] hover:underline"
              data-testid="home-news-source">
              {a.source_name || 'Read source'} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {/* Progress dots */}
      {articles.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-1 pb-1 pointer-events-none">
          {articles.map((_, i) => (
            <span key={i} className={`h-0.5 rounded-full transition-all duration-300 ${i === idx ? 'w-4 bg-[#002FA7]' : 'w-1.5 bg-slate-200 dark:bg-slate-700'}`} />
          ))}
        </div>
      )}
    </div>
  );
};

export default WaterNewsWidget;
