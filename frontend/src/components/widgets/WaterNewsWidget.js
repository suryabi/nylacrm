import React, { useEffect, useState } from 'react';
import { Droplets, ExternalLink, ChevronRight } from 'lucide-react';
import { Badge } from '../ui/badge';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export const WaterNewsWidget = () => {
  const [articles, setArticles] = useState([]);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/public/water-news?limit=6`)
      .then((r) => r.json())
      .then((d) => setArticles(d.articles || []))
      .catch(() => {});
  }, []);

  if (articles.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-4 sm:p-5" data-testid="home-water-news-widget">
      <div className="flex items-center gap-2 mb-4">
        <Droplets className="h-4 w-4 text-[#002FA7]" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">Water Industry News</h2>
        <span className="text-xs text-slate-400">Daily brief curated by the Water Intelligence team</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {articles.map((a) => {
          const open = expanded === a.id;
          return (
            <div key={a.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3.5 hover:border-[#002FA7]/40 hover:shadow-sm transition-all flex flex-col" data-testid={`home-news-${a.id}`}>
              <div className="flex items-center gap-2 mb-1.5">
                {a.category && <Badge variant="outline" className="text-[10px] text-[#002FA7] border-[#002FA7]/30">{a.category}</Badge>}
                <span className="text-[11px] text-slate-400 ml-auto">{fmtDate(a.published_at)}</span>
              </div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">{a.headline}</p>
              <p className={`text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed ${open ? '' : 'line-clamp-3'}`}>{a.summary}</p>
              {open && a.why_it_matters && (
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 bg-[#002FA7]/5 rounded-md px-2.5 py-2">
                  <span className="font-semibold text-[#002FA7]">Why it matters: </span>{a.why_it_matters}
                </p>
              )}
              <div className="flex items-center justify-between mt-auto pt-2.5">
                <button className="text-xs font-medium text-[#002FA7] hover:underline inline-flex items-center gap-0.5"
                  onClick={() => setExpanded(open ? null : a.id)} data-testid={`home-news-toggle-${a.id}`}>
                  {open ? 'Show less' : 'Read more'} <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} />
                </button>
                {a.source_url && (
                  <a href={a.source_url} target="_blank" rel="noreferrer"
                    className="text-[11px] text-slate-400 hover:text-[#002FA7] inline-flex items-center gap-1"
                    data-testid={`home-news-source-${a.id}`}>
                    {a.source_name || 'Source'} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WaterNewsWidget;
