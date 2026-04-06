import React, { useState, useEffect, useCallback } from 'react';
import { marketingAPI } from '../utils/api';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon,
  Film, Image, Video, MoreHorizontal, X, Save, Trash2,
  Sparkles, Eye, Send, PenLine, GripVertical,
} from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const VIEWS = ['month','week','day'];

const STATUS_CONFIG = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', label: 'Draft', icon: PenLine },
  review: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400', label: 'Review', icon: Eye },
  scheduled: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', label: 'Scheduled', icon: CalendarIcon },
  published: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Published', icon: Send },
};

const CONTENT_TYPE_ICONS = { reel: Film, image: Image, video: Video, other: MoreHorizontal };

const PLATFORM_STYLES = {
  linkedin: { color: '#0A66C2', label: 'LinkedIn', short: 'Li' },
  whatsapp: { color: '#25D366', label: 'WhatsApp', short: 'Wa' },
  youtube: { color: '#FF0000', label: 'YouTube', short: 'Yt' },
  instagram: { color: '#E1306C', label: 'Instagram', short: 'Ig' },
  facebook: { color: '#1877F2', label: 'Facebook', short: 'Fb' },
};

function getDaysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function getFirstDayOfMonth(y, m) { return new Date(y, m - 1, 1).getDay(); }

// --- Side Panel Form ---
function PostPanel({ open, onClose, post, categories, platforms, onSave, onDelete }) {
  const [form, setForm] = useState({
    post_date: '', category: '', content_type: 'image',
    concept: '', message: '', platforms: ['linkedin','whatsapp','youtube','instagram','facebook'],
    status: 'draft', owner_name: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (post?.id) {
      setForm({
        post_date: post.post_date || '', category: post.category || '',
        content_type: post.content_type || 'image', concept: post.concept || '',
        message: post.message || '',
        platforms: post.platforms || ['linkedin','whatsapp','youtube','instagram','facebook'],
        status: post.status || 'draft', owner_name: post.owner_name || '', id: post.id,
      });
    } else if (open) {
      setForm({
        post_date: post?.post_date || '', category: '', content_type: 'image',
        concept: '', message: '',
        platforms: ['linkedin','whatsapp','youtube','instagram','facebook'],
        status: 'draft', owner_name: '',
      });
    }
  }, [post, open]);

  const handleSave = async () => {
    if (!form.post_date) { toast.error('Please select a date'); return; }
    if (!form.concept.trim()) { toast.error('Please add a concept'); return; }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch { toast.error('Failed to save post'); }
    finally { setSaving(false); }
  };

  const togglePlatform = (key) => {
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(key) ? prev.platforms.filter(p => p !== key) : [...prev.platforms, key]
    }));
  };

  const enabledPlatforms = platforms.filter(p => p.enabled !== false);
  const statusDef = STATUS_CONFIG[form.status] || STATUS_CONFIG.draft;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md border-l border-slate-200 p-0 bg-white overflow-y-auto [&>button]:hidden">
        <div className="px-6 pt-5 pb-4 border-b border-slate-200 sticky top-0 z-10 bg-white">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold text-slate-900">{post?.id ? 'Edit Post' : 'New Post'}</SheetTitle>
            <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 transition-colors" data-testid="close-panel-btn"><X size={18} className="text-slate-400" /></button>
          </div>
          {/* Status row */}
          <div className="flex gap-1.5 mt-3" data-testid="status-group">
            {Object.entries(STATUS_CONFIG).map(([key, s]) => (
              <button key={key} onClick={() => setForm(p => ({ ...p, status: key }))}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${form.status === key ? `${s.bg} ${s.text} ring-1 ring-current` : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                data-testid={`status-${key}`}>{s.label}</button>
            ))}
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1 block">Date</label>
              <input type="date" value={form.post_date?.slice(0, 10) || ''} onChange={e => setForm(p => ({ ...p, post_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                data-testid="post-date-input" />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1 block">Category</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                data-testid="post-category-select">
                <option value="">Select...</option>
                {categories.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Content Type */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2 block">Content Type</label>
            <div className="flex gap-1.5" data-testid="content-type-group">
              {['reel', 'image', 'video', 'other'].map(t => {
                const Icon = CONTENT_TYPE_ICONS[t];
                const active = form.content_type === t;
                return (
                  <button key={t} onClick={() => setForm(p => ({ ...p, content_type: t }))}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium capitalize transition-all ${active ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                    data-testid={`content-type-${t}`}><Icon size={14} /> {t}</button>
                );
              })}
            </div>
          </div>

          {/* Concept */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1 block">Concept</label>
            <textarea value={form.concept} onChange={e => setForm(p => ({ ...p, concept: e.target.value }))}
              placeholder="Describe the idea, theme, visual direction..."
              rows={4}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none leading-relaxed"
              data-testid="post-concept-input" />
          </div>

          {/* Message */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1 block">Message / Caption</label>
            <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
              placeholder="Final message or caption..."
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none"
              data-testid="post-message-input" />
          </div>

          {/* Platforms */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2 block">Platforms</label>
            <div className="flex flex-wrap gap-2" data-testid="platform-selection">
              {enabledPlatforms.map(p => {
                const selected = form.platforms.includes(p.key);
                const ps = PLATFORM_STYLES[p.key] || {};
                return (
                  <button key={p.key} onClick={() => togglePlatform(p.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selected ? 'text-white border-transparent' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
                    style={selected ? { backgroundColor: ps.color } : {}}
                    data-testid={`platform-${p.key}`}>{p.name}</button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50 sticky bottom-0 flex items-center justify-between">
          {post?.id ? (
            <button onClick={() => { onDelete(post.id); onClose(); }} className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-1" data-testid="delete-post-btn"><Trash2 size={14} /> Delete</button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors" data-testid="cancel-post-btn">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              data-testid="save-post-btn"><Save size={14} /> {saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// --- Post Card (in calendar cell) ---
function PostCard({ post, onClick, onDelete, onDragStart }) {
  const status = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft;
  const Icon = CONTENT_TYPE_ICONS[post.content_type] || MoreHorizontal;

  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', post.id); e.dataTransfer.effectAllowed = 'move'; onDragStart?.(post.id); }}
      className={`w-full text-left px-2.5 py-2 rounded-lg border border-slate-200 ${status.bg} transition-all hover:shadow-sm cursor-grab active:cursor-grabbing group/card`}
      data-testid={`post-pill-${post.id}`}>
      <div className="flex items-start justify-between gap-1">
        <button onClick={(e) => { e.stopPropagation(); onClick(post); }} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot} shrink-0`} />
            <Icon size={10} className="text-slate-400 shrink-0" />
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider truncate">{post.category || post.content_type}</span>
          </div>
          <p className="text-xs font-medium text-slate-700 leading-snug line-clamp-2">{post.concept || 'Untitled'}</p>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(post.id); }}
          className="shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-200/50 mt-0.5"
          data-testid={`delete-pill-${post.id}`}><X size={11} className="text-slate-400" /></button>
      </div>
    </div>
  );
}

// --- Event Badge ---
function EventBadge({ event }) {
  const isIndian = event.type === 'indian';
  const isCustom = event.type === 'custom';
  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium mb-0.5 ${isIndian ? 'bg-orange-50 text-orange-600' : isCustom ? 'bg-violet-50 text-violet-600' : 'bg-sky-50 text-sky-600'}`} title={event.name}>
      <Sparkles size={8} />
      <span className="truncate">{event.name}</span>
    </div>
  );
}


// ---- Main Calendar ----
export default function MarketingCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [view, setView] = useState('month');
  const [loading, setLoading] = useState(true);

  const [postsByDate, setPostsByDate] = useState({});
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({ total: 0, by_status: {} });
  const [categories, setCategories] = useState([]);
  const [platforms, setPlatforms] = useState([]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [clickedDate, setClickedDate] = useState('');

  const [weekStart, setWeekStart] = useState(null);
  const [draggingPostId, setDraggingPostId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  useEffect(() => {
    const today = new Date();
    const d = today.getDay();
    setWeekStart(new Date(today.getFullYear(), today.getMonth(), today.getDate() - d));
  }, []);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const [calRes, catRes, platRes] = await Promise.all([
        marketingAPI.getCalendar(month, year), marketingAPI.getCategories(), marketingAPI.getPlatforms(),
      ]);
      setPostsByDate(calRes.data.posts_by_date || {});
      setEvents(calRes.data.events || []);
      setStats(calRes.data.stats || { total: 0, by_status: {} });
      setCategories(catRes.data || []);
      setPlatforms(platRes.data || []);
    } catch { toast.error('Failed to load calendar'); }
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); };
  const goToday = () => { setMonth(now.getMonth() + 1); setYear(now.getFullYear()); };

  const openNew = (dateStr) => { setEditingPost(null); setClickedDate(dateStr); setPanelOpen(true); };
  const openEdit = (post) => { setEditingPost(post); setClickedDate(post.post_date); setPanelOpen(true); };

  const savePost = async (formData) => {
    if (editingPost?.id) { await marketingAPI.updatePost(editingPost.id, formData); toast.success('Post updated'); }
    else { await marketingAPI.createPost(formData); toast.success('Post created'); }
    loadCalendar();
  };

  const deletePost = async (id) => { await marketingAPI.deletePost(id); toast.success('Post deleted'); loadCalendar(); };

  const handleDrop = async (dateStr) => {
    if (!draggingPostId) return;
    setDropTarget(null); setDraggingPostId(null);
    try { await marketingAPI.updatePost(draggingPostId, { post_date: dateStr }); toast.success('Post moved'); loadCalendar(); }
    catch { toast.error('Failed to move post'); }
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);

  const getWeekDates = () => {
    if (!weekStart) return [];
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
  };
  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); if (d.getMonth() + 1 !== month) { setMonth(d.getMonth() + 1); setYear(d.getFullYear()); } };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); if (d.getMonth() + 1 !== month) { setMonth(d.getMonth() + 1); setYear(d.getFullYear()); } };
  const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const getEventsForDate = (mmdd) => events.filter(e => e.date === mmdd);

  return (
    <div className="min-h-screen bg-white" data-testid="marketing-calendar">
      {/* Header */}
      <div className="border-b border-slate-200 sticky top-0 z-40 bg-white">
        <div className="px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Content Calendar</h1>
              <p className="text-sm text-slate-500 mt-0.5">Plan, schedule & publish</p>
            </div>
            <button onClick={() => openNew(todayStr)}
              className="bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm"
              data-testid="new-post-btn"><Plus size={16} /> New Post</button>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <button onClick={view === 'week' ? prevWeek : prevMonth} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-600" data-testid="prev-period-btn"><ChevronLeft size={18} /></button>
              <h2 className="text-base font-semibold text-slate-900 min-w-[180px] text-center">{view === 'day' ? todayStr : `${MONTHS[month - 1]} ${year}`}</h2>
              <button onClick={view === 'week' ? nextWeek : nextMonth} className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-600" data-testid="next-period-btn"><ChevronRight size={18} /></button>
              <button onClick={goToday} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors ml-1" data-testid="today-btn">Today</button>
            </div>

            <div className="flex items-center gap-4">
              {/* Status counts */}
              <div className="hidden md:flex items-center gap-3">
                {Object.entries(STATUS_CONFIG).map(([key, s]) => (
                  <span key={key} className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                    {stats.by_status[key] || 0} {s.label}
                  </span>
                ))}
              </div>
              <div className="h-4 w-px bg-slate-200 hidden md:block" />
              {/* View toggle */}
              <div className="flex bg-slate-100 rounded-lg p-0.5" data-testid="view-toggle">
                {VIEWS.map(v => (
                  <button key={v} onClick={() => setView(v)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md capitalize transition-all ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    data-testid={`view-${v}`}>{v}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Body */}
      <div className="px-6 lg:px-8 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="text-sm text-slate-400">Loading...</div></div>
        ) : (
          <>
            {/* MONTH VIEW */}
            {view === 'month' && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                  {DAYS.map((d, di) => (
                    <div key={d} className={`py-2.5 text-center text-[11px] font-medium uppercase tracking-wider border-r border-slate-200 last:border-r-0 ${di === 0 || di === 6 ? 'text-slate-400/70 bg-slate-100/60' : 'text-slate-400'}`}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {calendarDays.map((day, i) => {
                    const colIndex = i % 7;
                    const isWeekend = colIndex === 0 || colIndex === 6;
                    if (day === null) return <div key={`e-${i}`} className={`min-h-[130px] border-r border-b border-slate-100 ${isWeekend ? 'bg-slate-50/80' : 'bg-slate-50/50'}`} />;
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isToday = dateStr === todayStr;
                    const posts = postsByDate[dateStr] || [];
                    const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayEvents = getEventsForDate(mmdd);
                    const isDrop = dropTarget === dateStr;

                    return (
                      <div key={dateStr}
                        className={`min-h-[130px] p-2 border-r border-b border-slate-100 cursor-pointer transition-all group ${isToday ? 'bg-blue-50/30' : isWeekend ? 'bg-slate-50/60 hover:bg-slate-100/40' : 'bg-white hover:bg-slate-50/50'} ${isDrop ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset' : ''}`}
                        onClick={() => openNew(dateStr)}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(dateStr); }}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={(e) => { e.preventDefault(); handleDrop(dateStr); }}
                        data-testid={`cal-cell-${dateStr}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-sm ${isToday ? 'bg-blue-600 text-white w-7 h-7 flex items-center justify-center rounded-full font-semibold' : isWeekend ? 'text-slate-400 font-medium' : 'text-slate-500 font-medium'}`}>{day}</span>
                          <Plus size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        {dayEvents.map((ev, ei) => <EventBadge key={ei} event={ev} />)}
                        <div className="space-y-1.5 mt-1">
                          {posts.slice(0, 3).map(p => (
                            <PostCard key={p.id} post={p} onClick={openEdit} onDelete={deletePost} onDragStart={setDraggingPostId} />
                          ))}
                          {posts.length > 3 && <div className="text-[10px] text-slate-400 font-medium pl-1">+{posts.length - 3} more</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* WEEK VIEW */}
            {view === 'week' && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                  {getWeekDates().map(d => {
                    const ds = fmtDate(d);
                    const isToday = ds === todayStr;
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div key={ds} className={`py-3 text-center border-r border-slate-200 last:border-r-0 ${isToday ? 'bg-blue-50' : isWeekend ? 'bg-slate-100/60' : ''}`}>
                        <div className={`text-[11px] font-medium uppercase tracking-wider ${isWeekend ? 'text-slate-400/70' : 'text-slate-400'}`}>{DAYS[d.getDay()]}</div>
                        <div className={`text-lg font-semibold mt-0.5 ${isToday ? 'text-blue-600' : isWeekend ? 'text-slate-400' : 'text-slate-700'}`}>{d.getDate()}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-7 min-h-[420px]">
                  {getWeekDates().map(d => {
                    const ds = fmtDate(d);
                    const posts = postsByDate[ds] || [];
                    const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    const dayEvents = getEventsForDate(mmdd);
                    const isDrop = dropTarget === ds;
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div key={ds} className={`p-2 border-r border-slate-100 last:border-r-0 cursor-pointer transition-all ${isWeekend ? 'bg-slate-50/60 hover:bg-slate-100/40' : 'hover:bg-slate-50/50'} ${isDrop ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset' : ''}`}
                        onClick={() => openNew(ds)}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(ds); }}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={(e) => { e.preventDefault(); handleDrop(ds); }}>
                        {dayEvents.map((ev, ei) => <EventBadge key={ei} event={ev} />)}
                        <div className="space-y-1.5 mt-1">
                          {posts.map(p => <PostCard key={p.id} post={p} onClick={openEdit} onDelete={deletePost} onDragStart={setDraggingPostId} />)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* DAY VIEW */}
            {view === 'day' && (() => {
              const dayPosts = postsByDate[todayStr] || [];
              const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              const dayEvents = getEventsForDate(mmdd);
              return (
                <div className="max-w-xl mx-auto space-y-4">
                  <div className="border border-slate-200 rounded-lg p-6 bg-white">
                    <h3 className="text-lg font-semibold text-slate-900">{MONTHS[now.getMonth()]} {now.getDate()}, {now.getFullYear()}</h3>
                    {dayEvents.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {dayEvents.map((ev, i) => (
                          <span key={i} className="px-2.5 py-1 bg-sky-50 text-sky-600 rounded-full text-xs font-medium flex items-center gap-1">
                            <Sparkles size={10} /> {ev.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {dayPosts.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        <CalendarIcon size={32} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium">No posts planned</p>
                        <button onClick={() => openNew(todayStr)}
                          className="mt-3 bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium px-4 py-2 rounded-lg text-sm inline-flex items-center gap-1.5">
                          <Plus size={14} /> Plan a Post
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 mt-4">
                        {dayPosts.map(post => {
                          const s = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft;
                          const Icon = CONTENT_TYPE_ICONS[post.content_type] || MoreHorizontal;
                          return (
                            <div key={post.id} onClick={() => openEdit(post)}
                              className="border border-slate-200 rounded-lg p-4 cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all"
                              data-testid={`day-post-${post.id}`}>
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  <Icon size={14} className="text-slate-400" />
                                  <span className="font-medium text-slate-900 text-sm">{post.concept || 'Untitled'}</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${s.bg} ${s.text}`}>{s.label}</span>
                              </div>
                              {post.message && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{post.message}</p>}
                              <div className="flex gap-1 mt-2.5">
                                {(post.platforms || []).map(pk => {
                                  const ps = PLATFORM_STYLES[pk] || {};
                                  return (
                                    <span key={pk} className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white" style={{ backgroundColor: ps.color }} title={ps.label}>
                                      {ps.short}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>

      <PostPanel open={panelOpen} onClose={() => { setPanelOpen(false); setEditingPost(null); }}
        post={editingPost || { post_date: clickedDate }} categories={categories} platforms={platforms}
        onSave={savePost} onDelete={deletePost} />
    </div>
  );
}
