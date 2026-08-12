import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import {
  Newspaper, RefreshCw, Settings2, Play, Check, X, Globe2, ExternalLink,
  Sparkles, History, Pencil, Trash2, Search, ChevronDown, ChevronUp, Send, Undo2,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });

const STATUS_META = {
  pending_approval: { label: 'Pending Approval', chip: 'bg-amber-50 text-amber-800 border-amber-300' },
  approved: { label: 'Approved', chip: 'bg-blue-50 text-blue-700 border-blue-300' },
  published: { label: 'Published', chip: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  rejected: { label: 'Rejected', chip: 'bg-red-50 text-red-700 border-red-200' },
};
const TABS = [
  { v: 'pending_approval', label: 'Pending' },
  { v: 'approved', label: 'Approved' },
  { v: 'published', label: 'Published' },
  { v: 'rejected', label: 'Rejected' },
  { v: 'all', label: 'All' },
];

const scoreColor = (s) => (s >= 85 ? 'bg-emerald-600' : s >= 70 ? 'bg-[#002FA7]' : s >= 50 ? 'bg-amber-500' : 'bg-slate-400');
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function ScoreBadge({ score }) {
  return (
    <span className={`inline-flex items-center justify-center h-9 w-9 rounded-full text-white text-xs font-bold shrink-0 ${scoreColor(score)}`} title={`AI relevance: ${score}/100`}>
      {score}
    </span>
  );
}

export default function WaterIntelligence() {
  const [tab, setTab] = useState('pending_approval');
  const [articles, setArticles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState({ counts: {}, last_run: null, categories: [] });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [editArt, setEditArt] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const [settings, setSettings] = useState(null);
  const [runs, setRuns] = useState([]);
  const LIMIT = 20;

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/water-intelligence/stats`, { headers: authHeaders() });
      const d = await r.json();
      setStats(d);
      if (d.last_run?.status === 'running') setRunning(true);
      else setRunning(false);
    } catch { /* ignore */ }
  }, []);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: tab, page: String(page), limit: String(LIMIT) });
      if (search.trim()) params.set('search', search.trim());
      if (category) params.set('category', category);
      const r = await fetch(`${API_URL}/api/water-intelligence?${params}`, { headers: authHeaders() });
      const d = await r.json();
      setArticles(d.articles || []);
      setTotal(d.total || 0);
    } catch (e) { toast.error('Failed to load articles'); }
    setLoading(false);
  }, [tab, page, search, category]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadArticles(); }, [loadArticles]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => { loadStats(); loadArticles(); }, 8000);
    return () => clearInterval(t);
  }, [running, loadStats, loadArticles]);

  const runNow = async () => {
    try {
      const r = await fetch(`${API_URL}/api/water-intelligence/run`, { method: 'POST', headers: authHeaders() });
      if (!r.ok) throw new Error((await r.json()).detail || 'Failed to start');
      setRunning(true);
      toast.success('Collection started — new articles will appear as AI review completes');
    } catch (e) { toast.error(e.message); }
  };

  const doTransition = async (art, action, reason) => {
    try {
      const r = await fetch(`${API_URL}/api/water-intelligence/${art.id}/transition`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ action, reason }),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Action failed');
      toast.success(`Article ${action}${action.endsWith('e') ? 'd' : 'ed'}`);
      loadArticles(); loadStats();
    } catch (e) { toast.error(e.message); }
  };

  const delArticle = async (art) => {
    if (!window.confirm(`Delete "${art.headline}"?`)) return;
    try {
      await fetch(`${API_URL}/api/water-intelligence/${art.id}`, { method: 'DELETE', headers: authHeaders() });
      loadArticles(); loadStats();
    } catch { toast.error('Delete failed'); }
  };

  const saveEdit = async () => {
    try {
      const r = await fetch(`${API_URL}/api/water-intelligence/${editArt.id}`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          headline: editArt.headline, summary: editArt.summary,
          why_it_matters: editArt.why_it_matters, category: editArt.category,
          region: editArt.region,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Save failed');
      toast.success('Article updated');
      setEditArt(null); loadArticles();
    } catch (e) { toast.error(e.message); }
  };

  const openSettings = async () => {
    try {
      const r = await fetch(`${API_URL}/api/water-intelligence/settings`, { headers: authHeaders() });
      setSettings(await r.json());
      setShowSettings(true);
    } catch { toast.error('Failed to load settings'); }
  };

  const saveSettings = async () => {
    try {
      const r = await fetch(`${API_URL}/api/water-intelligence/settings`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          topics: settings.topics, custom_feeds: settings.custom_feeds,
          min_score: Number(settings.min_score), schedule_enabled: settings.schedule_enabled,
          schedule_hour: Number(settings.schedule_hour), schedule_minute: Number(settings.schedule_minute),
          max_articles_per_run: Number(settings.max_articles_per_run),
        }),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Save failed');
      toast.success('Settings saved');
      setShowSettings(false);
    } catch (e) { toast.error(e.message); }
  };

  const openRuns = async () => {
    try {
      const r = await fetch(`${API_URL}/api/water-intelligence/runs`, { headers: authHeaders() });
      setRuns((await r.json()).runs || []);
      setShowRuns(true);
    } catch { toast.error('Failed to load run history'); }
  };

  const counts = stats.counts || {};
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6" data-testid="water-intelligence-page">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Newspaper className="h-6 w-6 text-[#002FA7]" /> Water Intelligence
          </h1>
          <p className="text-slate-500 text-sm mt-1">Daily AI-curated water industry news — review, approve and publish to the website.</p>
          {stats.last_run && (
            <p className="text-xs text-slate-400 mt-1" data-testid="wi-last-run">
              Last run: {fmtDate(stats.last_run.started_at)} · {stats.last_run.trigger} · {stats.last_run.status}
              {stats.last_run.status === 'completed' && ` · ${stats.last_run.fetched} fetched, ${stats.last_run.duplicates} duplicates, ${stats.last_run.kept} kept`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-sm" onClick={openRuns} data-testid="wi-runs-btn"><History className="h-4 w-4 mr-1.5" /> Runs</Button>
          <Button variant="outline" className="rounded-sm" onClick={openSettings} data-testid="wi-settings-btn"><Settings2 className="h-4 w-4 mr-1.5" /> Settings</Button>
          <Button className="rounded-sm bg-[#002FA7] hover:bg-[#00227A] text-white" onClick={runNow} disabled={running} data-testid="wi-run-now-btn">
            {running ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> : <Play className="h-4 w-4 mr-1.5" />}
            {running ? 'Collecting…' : 'Run Now'}
          </Button>
        </div>
      </div>

      {/* Status tabs + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <div className="flex gap-6">
          {TABS.map((t) => (
            <button key={t.v} onClick={() => { setTab(t.v); setPage(1); }} data-testid={`wi-tab-${t.v}`}
              className={`pb-2.5 pt-1 text-sm font-medium border-b-2 transition-colors ${tab === t.v ? 'text-[#002FA7] border-[#002FA7]' : 'text-slate-500 border-transparent hover:text-slate-900'}`}>
              {t.label}
              <span className="ml-1.5 text-xs text-slate-400">{t.v === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : (counts[t.v] || 0)}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-slate-400" />
            <Input className="h-9 pl-8 w-56 rounded-sm" placeholder="Search headlines, keywords…" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }} data-testid="wi-search-input" />
          </div>
          <select className="h-9 rounded-sm border border-slate-300 bg-white px-2 text-sm" value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }} data-testid="wi-category-filter">
            <option value="">All categories</option>
            {(stats.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Articles */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : articles.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded-sm py-16 flex flex-col items-center gap-2 text-center bg-white" data-testid="wi-empty">
          <Sparkles className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">Nothing here yet</p>
          <p className="text-xs text-slate-500">Hit "Run Now" to collect and AI-review today's water industry news.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((a) => {
            const meta = STATUS_META[a.status] || STATUS_META.pending_approval;
            const open = expanded === a.id;
            return (
              <div key={a.id} className="bg-white border border-slate-200 rounded-sm hover:border-slate-300 transition-colors" data-testid={`wi-article-${a.id}`}>
                <div className="p-4 flex items-start gap-3 cursor-pointer" onClick={() => setExpanded(open ? null : a.id)}>
                  <ScoreBadge score={a.relevance_score} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-sm border text-[11px] font-bold uppercase tracking-wider ${meta.chip}`}>{meta.label}</span>
                      <span className="px-2 py-0.5 rounded-sm border border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">{a.category}</span>
                      <span className="text-[11px] text-slate-500 flex items-center gap-1"><Globe2 className="h-3 w-3" />{a.region}</span>
                    </div>
                    <p className="font-semibold text-slate-900 leading-snug">{a.headline}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {a.source_name || 'Unknown source'} · {fmtDate(a.source_published_at || a.created_at)}
                      {a.rejected_reason === 'low_relevance' && <span className="text-red-500 ml-2">below score threshold</span>}
                    </p>
                  </div>
                  <button className="text-slate-400 hover:text-slate-600 mt-1" data-testid={`wi-expand-${a.id}`}>
                    {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
                {open && (
                  <div className="px-4 pb-4 pl-16 space-y-3" data-testid={`wi-detail-${a.id}`}>
                    <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{a.summary}</div>
                    {a.why_it_matters && (
                      <div className="border-l-2 border-[#002FA7] bg-[#002FA7]/5 px-3 py-2 text-sm text-slate-700">
                        <span className="font-semibold text-[#002FA7]">Why it matters: </span>{a.why_it_matters}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {(a.keywords || []).map((k) => <span key={k} className="px-2 py-0.5 rounded-sm text-xs border border-slate-200 bg-slate-50 text-slate-600">#{k}</span>)}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <a href={a.source_url} target="_blank" rel="noreferrer" className="text-xs text-[#002FA7] hover:underline flex items-center gap-1" data-testid={`wi-source-link-${a.id}`}>
                        <ExternalLink className="h-3 w-3" /> Original: {a.source_title?.slice(0, 70)}…
                      </a>
                      <div className="flex items-center gap-1.5">
                        {(a.status === 'pending_approval' || a.status === 'approved') && (
                          <Button size="sm" variant="outline" className="rounded-sm h-8" onClick={() => setEditArt({ ...a })} data-testid={`wi-edit-${a.id}`}>
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                        )}
                        {a.status === 'pending_approval' && (
                          <>
                            <Button size="sm" className="rounded-sm h-8 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => doTransition(a, 'approve')} data-testid={`wi-approve-${a.id}`}>
                              <Check className="h-3.5 w-3.5 mr-1" /> Approve
                            </Button>
                            <Button size="sm" className="rounded-sm h-8 bg-red-600 hover:bg-red-700 text-white" onClick={() => doTransition(a, 'reject', 'manual')} data-testid={`wi-reject-${a.id}`}>
                              <X className="h-3.5 w-3.5 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        {a.status === 'approved' && (
                          <Button size="sm" className="rounded-sm h-8 bg-[#002FA7] hover:bg-[#00227A] text-white" onClick={() => doTransition(a, 'publish')} data-testid={`wi-publish-${a.id}`}>
                            <Send className="h-3.5 w-3.5 mr-1" /> Publish
                          </Button>
                        )}
                        {a.status === 'published' && (
                          <Button size="sm" variant="outline" className="rounded-sm h-8" onClick={() => doTransition(a, 'unpublish')} data-testid={`wi-unpublish-${a.id}`}>
                            <Undo2 className="h-3.5 w-3.5 mr-1" /> Unpublish
                          </Button>
                        )}
                        {a.status === 'rejected' && (
                          <Button size="sm" variant="outline" className="rounded-sm h-8" onClick={() => doTransition(a, 'resubmit')} data-testid={`wi-resubmit-${a.id}`}>
                            <Undo2 className="h-3.5 w-3.5 mr-1" /> Move to Pending
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-sm text-red-500 hover:bg-red-50" onClick={() => delArticle(a)} data-testid={`wi-delete-${a.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" size="sm" className="rounded-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="wi-prev-page">Previous</Button>
              <span className="text-sm text-slate-500">Page {page} of {pages}</span>
              <Button variant="outline" size="sm" className="rounded-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} data-testid="wi-next-page">Next</Button>
            </div>
          )}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editArt} onOpenChange={(o) => !o && setEditArt(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="wi-edit-dialog">
          <DialogHeader><DialogTitle>Edit Article</DialogTitle><DialogDescription>Refine the AI-generated content before publishing.</DialogDescription></DialogHeader>
          {editArt && (
            <div className="space-y-4">
              <div><Label>Headline</Label><Input className="mt-1 h-10 rounded-sm" value={editArt.headline} onChange={(e) => setEditArt((p) => ({ ...p, headline: e.target.value }))} data-testid="wi-edit-headline" /></div>
              <div><Label>Summary</Label><Textarea rows={8} className="mt-1 rounded-sm text-[15px]" value={editArt.summary} onChange={(e) => setEditArt((p) => ({ ...p, summary: e.target.value }))} data-testid="wi-edit-summary" /></div>
              <div><Label>Why it matters</Label><Textarea rows={2} className="mt-1 rounded-sm" value={editArt.why_it_matters} onChange={(e) => setEditArt((p) => ({ ...p, why_it_matters: e.target.value }))} data-testid="wi-edit-why" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Category</Label>
                  <select className="mt-1 h-10 w-full rounded-sm border border-slate-300 bg-white px-3 text-sm" value={editArt.category} onChange={(e) => setEditArt((p) => ({ ...p, category: e.target.value }))} data-testid="wi-edit-category">
                    {(stats.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><Label>Region</Label><Input className="mt-1 h-10 rounded-sm" value={editArt.region} onChange={(e) => setEditArt((p) => ({ ...p, region: e.target.value }))} data-testid="wi-edit-region" /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="rounded-sm" onClick={() => setEditArt(null)}>Cancel</Button>
                <Button className="rounded-sm bg-[#002FA7] hover:bg-[#00227A] text-white" onClick={saveEdit} data-testid="wi-edit-save">Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Settings dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="wi-settings-dialog">
          <DialogHeader><DialogTitle>Water Intelligence Settings</DialogTitle><DialogDescription>Control what is collected, when, and the AI quality bar.</DialogDescription></DialogHeader>
          {settings && (
            <div className="space-y-5">
              <div>
                <Label className="mb-1.5 block">Search topics ({(settings.topics || []).length})</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(settings.topics || []).map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-sm border border-slate-300 bg-slate-50 text-slate-700">
                      {t}
                      <button onClick={() => setSettings((p) => ({ ...p, topics: p.topics.filter((x) => x !== t) }))} className="text-slate-400 hover:text-red-500" data-testid={`wi-topic-remove-${t.replace(/\s/g, '-')}`}><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
                <Input className="h-10 rounded-sm" placeholder="Add a topic and press Enter (e.g. desalination India)" data-testid="wi-topic-input"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      const v = e.target.value.trim();
                      setSettings((p) => ({ ...p, topics: [...new Set([...(p.topics || []), v])] }));
                      e.target.value = '';
                    }
                  }} />
              </div>
              <div>
                <Label className="mb-1.5 block">Custom RSS feeds</Label>
                {(settings.custom_feeds || []).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <Input className="h-9 rounded-sm w-44" placeholder="Name" value={f.name || ''} onChange={(e) => setSettings((p) => ({ ...p, custom_feeds: p.custom_feeds.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} />
                    <Input className="h-9 rounded-sm flex-1" placeholder="https://example.com/feed.xml" value={f.url || ''} onChange={(e) => setSettings((p) => ({ ...p, custom_feeds: p.custom_feeds.map((x, j) => j === i ? { ...x, url: e.target.value } : x) }))} />
                    <Button size="icon" variant="ghost" className="h-9 w-9 text-red-500" onClick={() => setSettings((p) => ({ ...p, custom_feeds: p.custom_feeds.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="rounded-sm mt-1" onClick={() => setSettings((p) => ({ ...p, custom_feeds: [...(p.custom_feeds || []), { name: '', url: '' }] }))} data-testid="wi-add-feed-btn">+ Add feed</Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Minimum AI relevance score (0–100)</Label>
                  <Input type="number" min="0" max="100" className="mt-1 h-10 rounded-sm" value={settings.min_score} onChange={(e) => setSettings((p) => ({ ...p, min_score: e.target.value }))} data-testid="wi-min-score-input" />
                </div>
                <div>
                  <Label>Max articles AI-reviewed per run</Label>
                  <Input type="number" min="5" max="100" className="mt-1 h-10 rounded-sm" value={settings.max_articles_per_run} onChange={(e) => setSettings((p) => ({ ...p, max_articles_per_run: e.target.value }))} data-testid="wi-max-articles-input" />
                </div>
              </div>
              <div className="border border-slate-200 rounded-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Daily automatic run</p>
                    <p className="text-xs text-slate-500">Collects and AI-reviews news once a day at the set time (IST).</p>
                  </div>
                  <Switch checked={!!settings.schedule_enabled} onCheckedChange={(v) => setSettings((p) => ({ ...p, schedule_enabled: v }))} data-testid="wi-schedule-toggle" />
                </div>
                {settings.schedule_enabled && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Run at</Label>
                    <Input type="number" min="0" max="23" className="h-9 w-20 rounded-sm text-center" value={settings.schedule_hour} onChange={(e) => setSettings((p) => ({ ...p, schedule_hour: e.target.value }))} data-testid="wi-schedule-hour" />
                    <span className="text-slate-500 font-bold">:</span>
                    <Input type="number" min="0" max="59" className="h-9 w-20 rounded-sm text-center" value={settings.schedule_minute} onChange={(e) => setSettings((p) => ({ ...p, schedule_minute: e.target.value }))} data-testid="wi-schedule-minute" />
                    <span className="text-xs text-slate-500">IST (24-hour)</span>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="rounded-sm" onClick={() => setShowSettings(false)}>Cancel</Button>
                <Button className="rounded-sm bg-[#002FA7] hover:bg-[#00227A] text-white" onClick={saveSettings} data-testid="wi-settings-save">Save Settings</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Runs dialog */}
      <Dialog open={showRuns} onOpenChange={setShowRuns}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto" data-testid="wi-runs-dialog">
          <DialogHeader><DialogTitle>Collection Runs</DialogTitle><DialogDescription>Last 20 collection runs.</DialogDescription></DialogHeader>
          {runs.length === 0 ? <p className="text-sm text-slate-500">No runs yet.</p> : (
            <div className="space-y-2">
              {runs.map((r) => (
                <div key={r.id} className="border border-slate-200 rounded-sm p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{new Date(r.started_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className={`px-2 py-0.5 rounded-sm border text-[11px] font-bold uppercase ${r.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : r.status === 'running' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{r.status}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {r.trigger}{r.triggered_by ? ` by ${r.triggered_by}` : ''} · fetched {r.fetched} · duplicates {r.duplicates} · reviewed {r.reviewed} · kept {r.kept} · low-score {r.rejected_low_score}
                  </p>
                  {(r.errors || []).length > 0 && <p className="text-xs text-red-500 mt-1">{r.errors.slice(0, 2).join(' · ')}</p>}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
