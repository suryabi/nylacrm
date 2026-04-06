import React, { useState, useEffect, useCallback } from 'react';
import { marketingAPI } from '../utils/api';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon,
  Film, Image, Video, MoreHorizontal, X, Save, Trash2,
  ArrowRight, Sparkles, Eye, Send, PenLine,
} from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const VIEWS = ['month','week','day'];

const STATUS_STYLES = {
  draft: { bg: '#E2E8F0', text: '#1C1C1C', border: '#1C1C1C', label: 'Draft', icon: PenLine },
  review: { bg: '#FDE74C', text: '#1C1C1C', border: '#1C1C1C', label: 'Review', icon: Eye },
  scheduled: { bg: '#4EA8DE', text: '#FFFFFF', border: '#1C1C1C', label: 'Scheduled', icon: CalendarIcon },
  published: { bg: '#A8E6CF', text: '#1C1C1C', border: '#1C1C1C', label: 'Published', icon: Send },
};

const CONTENT_TYPE_ICONS = { reel: Film, image: Image, video: Video, other: MoreHorizontal };

const PLATFORM_COLORS = {
  linkedin: '#0A66C2', whatsapp: '#25D366', youtube: '#FF0000',
  instagram: '#E1306C', facebook: '#1877F2',
};

const PLATFORM_LABELS = {
  linkedin: 'LinkedIn', whatsapp: 'WhatsApp', youtube: 'YouTube',
  instagram: 'Instagram', facebook: 'Facebook',
};

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

// --- Post Form Side Panel ---
function PostFormDialog({ open, onClose, post, categories, platforms, onSave, onDelete }) {
  const [form, setForm] = useState({
    post_date: '', category: '', content_type: 'image',
    concept: '', message: '', platforms: ['linkedin','whatsapp','youtube','instagram','facebook'],
    status: 'draft', owner_name: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (post?.id) {
      setForm({
        post_date: post.post_date || '',
        category: post.category || '',
        content_type: post.content_type || 'image',
        concept: post.concept || '',
        message: post.message || '',
        platforms: post.platforms || ['linkedin','whatsapp','youtube','instagram','facebook'],
        status: post.status || 'draft',
        owner_name: post.owner_name || '',
        id: post.id,
      });
    } else if (open) {
      setForm({
        post_date: post?.post_date || '',
        category: '',
        content_type: 'image',
        concept: '',
        message: '',
        platforms: ['linkedin','whatsapp','youtube','instagram','facebook'],
        status: 'draft',
        owner_name: '',
      });
    }
  }, [post, open]);

  const handleSave = async () => {
    if (!form.post_date) { toast.error('Please select a date'); return; }
    if (!form.concept.trim()) { toast.error('Please add a concept'); return; }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch {
      toast.error('Failed to save post');
    } finally {
      setSaving(false);
    }
  };

  const togglePlatform = (key) => {
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(key)
        ? prev.platforms.filter(p => p !== key)
        : [...prev.platforms, key]
    }));
  };

  const enabledPlatforms = platforms.filter(p => p.enabled !== false);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg border-l-2 border-[#1C1C1C] p-0 bg-white overflow-y-auto [&>button]:hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b-2 border-[#1C1C1C] bg-[#FAF9F6] sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-xl font-bold text-[#1C1C1C]" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {post?.id ? 'Edit Post' : 'Plan New Post'}
            </SheetTitle>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors" data-testid="close-panel-btn">
              <X size={18} className="text-[#4B5563]" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Date & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#4B5563] mb-1.5 block">Post Date</label>
              <input type="date" value={form.post_date?.slice(0, 10) || ''} onChange={e => setForm(p => ({ ...p, post_date: e.target.value }))}
                className="w-full bg-white border-2 border-[#1C1C1C] rounded-lg px-4 py-2.5 font-medium focus:ring-2 focus:ring-[#FF6B6B] focus:outline-none transition-all"
                data-testid="post-date-input" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#4B5563] mb-1.5 block">Category</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                className="w-full bg-white border-2 border-[#1C1C1C] rounded-lg px-4 py-2.5 font-medium focus:ring-2 focus:ring-[#FF6B6B] focus:outline-none transition-all"
                data-testid="post-category-select">
                <option value="">Select category...</option>
                {categories.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Content Type */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#4B5563] mb-2 block">Content Type</label>
            <div className="flex gap-2" data-testid="content-type-group">
              {['reel', 'image', 'video', 'other'].map(t => {
                const Icon = CONTENT_TYPE_ICONS[t];
                const active = form.content_type === t;
                return (
                  <button key={t} onClick={() => setForm(p => ({ ...p, content_type: t }))}
                    className={`flex items-center gap-2 px-4 py-2.5 border-2 border-[#1C1C1C] rounded-lg font-bold text-sm capitalize transition-all ${active ? 'bg-[#FF6B6B] text-white shadow-[2px_2px_0px_#1C1C1C]' : 'bg-white text-[#1C1C1C] hover:bg-[#FAF9F6]'}`}
                    data-testid={`content-type-${t}`}>
                    <Icon size={16} /> {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Concept — large textarea */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#4B5563] mb-1.5 block">Concept</label>
            <textarea value={form.concept} onChange={e => setForm(p => ({ ...p, concept: e.target.value }))}
              placeholder="Describe the idea for this post — theme, angle, visual direction..."
              rows={4}
              className="w-full bg-white border-2 border-[#1C1C1C] rounded-lg px-4 py-3 text-base font-medium focus:ring-2 focus:ring-[#FF6B6B] focus:outline-none transition-all resize-none leading-relaxed"
              data-testid="post-concept-input" />
          </div>

          {/* Message */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#4B5563] mb-1.5 block">Message / Caption</label>
            <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
              placeholder="Final message or caption..."
              rows={3}
              className="w-full bg-white border-2 border-[#1C1C1C] rounded-lg px-4 py-2.5 font-medium focus:ring-2 focus:ring-[#FF6B6B] focus:outline-none transition-all resize-none"
              data-testid="post-message-input" />
          </div>

          {/* Platforms */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#4B5563] mb-2 block">Platforms</label>
            <div className="flex flex-wrap gap-2" data-testid="platform-selection">
              {enabledPlatforms.map(p => {
                const selected = form.platforms.includes(p.key);
                return (
                  <button key={p.key} onClick={() => togglePlatform(p.key)}
                    className={`flex items-center gap-2 px-3 py-2 border-2 rounded-lg text-sm font-bold transition-all ${selected ? 'border-[#1C1C1C] shadow-[2px_2px_0px_#1C1C1C]' : 'border-slate-300 opacity-50'}`}
                    style={selected ? { backgroundColor: p.color || PLATFORM_COLORS[p.key], color: '#fff' } : {}}
                    data-testid={`platform-${p.key}`}>
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#4B5563] mb-2 block">Status</label>
            <div className="flex gap-2" data-testid="status-group">
              {Object.entries(STATUS_STYLES).map(([key, s]) => {
                const active = form.status === key;
                const Icon = s.icon;
                return (
                  <button key={key} onClick={() => setForm(p => ({ ...p, status: key }))}
                    className={`flex items-center gap-1.5 px-3 py-2 border-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${active ? 'border-[#1C1C1C] shadow-[2px_2px_0px_#1C1C1C]' : 'border-slate-300'}`}
                    style={active ? { backgroundColor: s.bg, color: s.text } : {}}
                    data-testid={`status-${key}`}>
                    <Icon size={14} /> {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions — sticky footer */}
        <div className="px-6 py-4 border-t-2 border-[#1C1C1C] bg-[#FAF9F6] sticky bottom-0 flex items-center justify-between">
          <div>
            {post?.id && (
              <button onClick={() => { onDelete(post.id); onClose(); }}
                className="text-red-500 hover:text-red-700 font-bold text-sm flex items-center gap-1 transition-colors"
                data-testid="delete-post-btn">
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="bg-white text-[#1C1C1C] border-2 border-[#1C1C1C] shadow-[2px_2px_0px_#1C1C1C] hover:shadow-[4px_4px_0px_#1C1C1C] hover:-translate-y-0.5 transition-all font-bold px-5 py-2.5 rounded-lg text-sm"
              data-testid="cancel-post-btn">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="bg-[#FF6B6B] text-white border-2 border-[#1C1C1C] shadow-[2px_2px_0px_#1C1C1C] hover:shadow-[4px_4px_0px_#1C1C1C] hover:-translate-y-0.5 transition-all font-bold px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
              data-testid="save-post-btn">
              <Save size={14} /> {saving ? 'Saving...' : 'Save Post'}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// --- Post Pill (calendar cell item) ---
function PostPill({ post, onClick, onDelete, onDragStart }) {
  const status = STATUS_STYLES[post.status] || STATUS_STYLES.draft;
  const Icon = CONTENT_TYPE_ICONS[post.content_type] || MoreHorizontal;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', post.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(post.id);
      }}
      className="w-full text-left px-2.5 py-2 rounded-lg text-[11px] font-semibold border-2 transition-all hover:-translate-y-0.5 cursor-grab active:cursor-grabbing group/pill relative shadow-[1px_1px_0px_#1C1C1C]"
      style={{ backgroundColor: status.bg, color: status.text, borderColor: status.border }}
      data-testid={`post-pill-${post.id}`}>
      <div className="flex items-start justify-between gap-1">
        <button onClick={(e) => { e.stopPropagation(); onClick(post); }} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Icon size={11} className="shrink-0" />
            <span className="font-bold text-[11px] uppercase tracking-wide opacity-70">{post.category || post.content_type}</span>
          </div>
          <p className="text-xs font-bold leading-snug line-clamp-2">{post.concept || 'Untitled'}</p>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(post.id); }}
          className="shrink-0 opacity-0 group-hover/pill:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10 mt-0.5"
          title="Delete post"
          data-testid={`delete-pill-${post.id}`}>
          <X size={11} />
        </button>
      </div>
    </div>
  );
}

// --- Event Marker ---
function EventMarker({ event }) {
  const colors = {
    indian: { bg: '#FFF7ED', border: '#FB923C', text: '#9A3412', icon: 'text-orange-500' },
    global: { bg: '#EFF6FF', border: '#60A5FA', text: '#1E40AF', icon: 'text-blue-500' },
    custom: { bg: '#FAF5FF', border: '#C084FC', text: '#6B21A8', icon: 'text-purple-500' },
  };
  const c = colors[event.type] || colors.global;
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-bold mb-0.5"
      style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}
      title={event.name}>
      <Sparkles size={10} className={c.icon} />
      <span className="truncate">{event.name}</span>
    </div>
  );
}


// ---- Main Calendar Component ----

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

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [clickedDate, setClickedDate] = useState('');

  // Week view state
  const [weekStart, setWeekStart] = useState(null);

  // Drag & drop state
  const [draggingPostId, setDraggingPostId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  useEffect(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day;
    setWeekStart(new Date(today.getFullYear(), today.getMonth(), diff));
  }, []);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const [calRes, catRes, platRes] = await Promise.all([
        marketingAPI.getCalendar(month, year),
        marketingAPI.getCategories(),
        marketingAPI.getPlatforms(),
      ]);
      setPostsByDate(calRes.data.posts_by_date || {});
      setEvents(calRes.data.events || []);
      setStats(calRes.data.stats || { total: 0, by_status: {} });
      setCategories(catRes.data || []);
      setPlatforms(platRes.data || []);
    } catch {
      toast.error('Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else { setMonth(month - 1); } };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else { setMonth(month + 1); } };
  const goToday = () => { setMonth(now.getMonth() + 1); setYear(now.getFullYear()); };

  // Calendar cell click → open new post dialog
  const handleCellClick = (dateStr) => {
    setEditingPost(null);
    setClickedDate(dateStr);
    setDialogOpen(true);
  };

  // Post pill click → open edit dialog
  const handlePostClick = (post) => {
    setEditingPost(post);
    setClickedDate(post.post_date);
    setDialogOpen(true);
  };

  const handleSavePost = async (formData) => {
    if (editingPost?.id) {
      await marketingAPI.updatePost(editingPost.id, formData);
      toast.success('Post updated');
    } else {
      await marketingAPI.createPost(formData);
      toast.success('Post created');
    }
    loadCalendar();
  };

  const handleDeletePost = async (id) => {
    await marketingAPI.deletePost(id);
    toast.success('Post deleted');
    loadCalendar();
  };

  // Drag & drop: move post to a new date
  const handleDropOnDate = async (dateStr) => {
    if (!draggingPostId) return;
    setDropTarget(null);
    setDraggingPostId(null);
    try {
      await marketingAPI.updatePost(draggingPostId, { post_date: dateStr });
      toast.success('Post moved');
      loadCalendar();
    } catch {
      toast.error('Failed to move post');
    }
  };

  // Build calendar grid
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);

  // Week view helpers
  const getWeekDates = () => {
    if (!weekStart) return [];
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
    if (d.getMonth() + 1 !== month || d.getFullYear() !== year) {
      setMonth(d.getMonth() + 1);
      setYear(d.getFullYear());
    }
  };
  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
    if (d.getMonth() + 1 !== month || d.getFullYear() !== year) {
      setMonth(d.getMonth() + 1);
      setYear(d.getFullYear());
    }
  };

  const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const getEventsForDate = (mmdd) => events.filter(e => e.date === mmdd);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF9F6', fontFamily: "'Manrope', sans-serif" }} data-testid="marketing-calendar">
      {/* Header */}
      <div className="bg-white border-b-2 border-[#1C1C1C] sticky top-0 z-40">
        <div className="px-6 lg:px-10 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#1C1C1C]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Content Calendar
              </h1>
              <p className="text-sm font-medium text-[#4B5563] mt-1">Plan, schedule & publish marketing content</p>
            </div>
            <button onClick={() => { setEditingPost(null); setClickedDate(todayStr); setDialogOpen(true); }}
              className="bg-[#FF6B6B] text-white border-2 border-[#1C1C1C] shadow-[2px_2px_0px_#1C1C1C] hover:shadow-[4px_4px_0px_#1C1C1C] hover:-translate-y-0.5 transition-all font-bold px-6 py-3 rounded-lg flex items-center gap-2"
              data-testid="new-post-btn">
              <Plus size={18} /> New Post
            </button>
          </div>

          {/* Controls Row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-5">
            {/* Month Nav */}
            <div className="flex items-center gap-3">
              <button onClick={view === 'week' ? prevWeek : prevMonth}
                className="bg-white border-2 border-[#1C1C1C] rounded-lg p-2 shadow-[2px_2px_0px_#1C1C1C] hover:shadow-[4px_4px_0px_#1C1C1C] hover:-translate-y-0.5 transition-all"
                data-testid="prev-period-btn"><ChevronLeft size={18} /></button>
              <h2 className="text-xl font-bold text-[#1C1C1C] min-w-[200px] text-center" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {view === 'day' ? todayStr : `${MONTHS[month - 1]} ${year}`}
              </h2>
              <button onClick={view === 'week' ? nextWeek : nextMonth}
                className="bg-white border-2 border-[#1C1C1C] rounded-lg p-2 shadow-[2px_2px_0px_#1C1C1C] hover:shadow-[4px_4px_0px_#1C1C1C] hover:-translate-y-0.5 transition-all"
                data-testid="next-period-btn"><ChevronRight size={18} /></button>
              <button onClick={goToday}
                className="bg-[#FDE74C] text-[#1C1C1C] border-2 border-[#1C1C1C] shadow-[2px_2px_0px_#1C1C1C] hover:shadow-[4px_4px_0px_#1C1C1C] hover:-translate-y-0.5 transition-all font-bold px-4 py-2 rounded-lg text-sm"
                data-testid="today-btn">Today</button>
            </div>

            {/* View Toggle + Stats */}
            <div className="flex items-center gap-3">
              {/* Mini Stats */}
              <div className="hidden md:flex items-center gap-2 mr-3">
                {Object.entries(STATUS_STYLES).map(([key, s]) => (
                  <span key={key} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border"
                    style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}>
                    {stats.by_status[key] || 0} {s.label}
                  </span>
                ))}
              </div>
              {/* View Buttons */}
              <div className="flex border-2 border-[#1C1C1C] rounded-lg overflow-hidden" data-testid="view-toggle">
                {VIEWS.map(v => (
                  <button key={v} onClick={() => setView(v)}
                    className={`px-4 py-2 text-sm font-bold capitalize transition-all ${view === v ? 'bg-[#1C1C1C] text-white' : 'bg-white text-[#1C1C1C] hover:bg-[#FAF9F6]'}`}
                    data-testid={`view-${v}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Body */}
      <div className="px-6 lg:px-10 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-[#4B5563] font-medium">Loading calendar...</div>
          </div>
        ) : (
          <>
            {/* === MONTH VIEW === */}
            {view === 'month' && (
              <div className="bg-white border-2 border-[#1C1C1C] rounded-xl shadow-[4px_4px_0px_#1C1C1C] overflow-hidden">
                {/* Day Headers */}
                <div className="grid grid-cols-7 border-b-2 border-[#1C1C1C]">
                  {DAYS.map(d => (
                    <div key={d} className="py-3 text-center text-xs font-bold uppercase tracking-widest text-[#4B5563] bg-[#FAF9F6] border-r border-[#1C1C1C] last:border-r-0">
                      {d}
                    </div>
                  ))}
                </div>
                {/* Calendar Grid */}
                <div className="grid grid-cols-7">
                  {calendarDays.map((day, i) => {
                    if (day === null) return <div key={`e-${i}`} className="min-h-[120px] bg-[#FAF9F6] border-r border-b border-[#1C1C1C]/20" />;
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isToday = dateStr === todayStr;
                    const posts = postsByDate[dateStr] || [];
                    const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayEvents = getEventsForDate(mmdd);

                    return (
                      <div key={dateStr}
                        className={`min-h-[120px] p-2 border-r border-b border-[#1C1C1C]/20 cursor-pointer transition-colors relative group ${isToday ? 'bg-[#FFF3E0]/30' : 'bg-white'} ${dropTarget === dateStr ? 'bg-[#FF6B6B]/10 ring-2 ring-[#FF6B6B] ring-inset' : 'hover:bg-[#FFF8E1]/40'}`}
                        onClick={() => handleCellClick(dateStr)}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(dateStr); }}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={(e) => { e.preventDefault(); handleDropOnDate(dateStr); }}
                        data-testid={`cal-cell-${dateStr}`}>
                        {/* Date Number */}
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-sm font-bold ${isToday ? 'bg-[#FF6B6B] text-white w-7 h-7 flex items-center justify-center rounded-full' : 'text-[#1C1C1C]'}`}>
                            {day}
                          </span>
                          {posts.length === 0 && (
                            <Plus size={14} className="text-[#4B5563]/0 group-hover:text-[#4B5563]/60 transition-all" />
                          )}
                        </div>
                        {/* Events */}
                        {dayEvents.map((ev, ei) => <EventMarker key={ei} event={ev} />)}
                        {/* Posts */}
                        <div className="space-y-1 mt-1">
                          {posts.slice(0, 3).map(p => (
                            <PostPill key={p.id} post={p}
                              onClick={handlePostClick}
                              onDelete={handleDeletePost}
                              onDragStart={setDraggingPostId} />
                          ))}
                          {posts.length > 3 && (
                            <div className="text-[10px] font-bold text-[#4B5563]">+{posts.length - 3} more</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* === WEEK VIEW === */}
            {view === 'week' && (
              <div className="bg-white border-2 border-[#1C1C1C] rounded-xl shadow-[4px_4px_0px_#1C1C1C] overflow-hidden">
                <div className="grid grid-cols-7 border-b-2 border-[#1C1C1C]">
                  {getWeekDates().map(d => {
                    const ds = fmtDate(d);
                    const isToday = ds === todayStr;
                    return (
                      <div key={ds} className={`py-3 text-center border-r border-[#1C1C1C] last:border-r-0 ${isToday ? 'bg-[#FF6B6B]/10' : 'bg-[#FAF9F6]'}`}>
                        <div className="text-xs font-bold uppercase tracking-widest text-[#4B5563]">{DAYS[d.getDay()]}</div>
                        <div className={`text-lg font-bold mt-1 ${isToday ? 'text-[#FF6B6B]' : 'text-[#1C1C1C]'}`}>{d.getDate()}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-7 min-h-[400px]">
                  {getWeekDates().map(d => {
                    const ds = fmtDate(d);
                    const posts = postsByDate[ds] || [];
                    const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    const dayEvents = getEventsForDate(mmdd);
                    return (
                      <div key={ds} className={`p-2 border-r border-[#1C1C1C]/20 last:border-r-0 cursor-pointer transition-colors ${dropTarget === ds ? 'bg-[#FF6B6B]/10 ring-2 ring-[#FF6B6B] ring-inset' : 'hover:bg-[#FFF8E1]/40'}`}
                        onClick={() => handleCellClick(ds)}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(ds); }}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={(e) => { e.preventDefault(); handleDropOnDate(ds); }}>
                        {dayEvents.map((ev, ei) => <EventMarker key={ei} event={ev} />)}
                        <div className="space-y-1.5 mt-1">
                          {posts.map(p => <PostPill key={p.id} post={p} onClick={handlePostClick} onDelete={handleDeletePost} onDragStart={setDraggingPostId} />)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* === DAY VIEW === */}
            {view === 'day' && (() => {
              const dayPosts = postsByDate[todayStr] || [];
              const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              const dayEvents = getEventsForDate(mmdd);
              return (
                <div className="max-w-2xl mx-auto space-y-4">
                  <div className="bg-white border-2 border-[#1C1C1C] rounded-xl shadow-[4px_4px_0px_#1C1C1C] p-6">
                    <h3 className="text-xl font-bold text-[#1C1C1C] mb-4" style={{ fontFamily: "'Outfit', sans-serif" }}>
                      Today — {MONTHS[now.getMonth()]} {now.getDate()}, {now.getFullYear()}
                    </h3>
                    {dayEvents.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {dayEvents.map((ev, i) => (
                          <span key={i} className="px-3 py-1 bg-[#FDE74C] border-2 border-[#1C1C1C] rounded-full text-xs font-bold flex items-center gap-1">
                            <Sparkles size={10} /> {ev.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {dayPosts.length === 0 ? (
                      <div className="text-center py-10 text-[#4B5563]">
                        <CalendarIcon size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="font-medium">No posts planned for today</p>
                        <button onClick={() => handleCellClick(todayStr)}
                          className="mt-3 bg-[#FF6B6B] text-white border-2 border-[#1C1C1C] shadow-[2px_2px_0px_#1C1C1C] hover:shadow-[4px_4px_0px_#1C1C1C] hover:-translate-y-0.5 transition-all font-bold px-5 py-2.5 rounded-lg text-sm inline-flex items-center gap-2">
                          <Plus size={14} /> Plan a Post
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {dayPosts.map(post => {
                          const status = STATUS_STYLES[post.status] || STATUS_STYLES.draft;
                          const Icon = CONTENT_TYPE_ICONS[post.content_type] || MoreHorizontal;
                          return (
                            <div key={post.id}
                              onClick={() => handlePostClick(post)}
                              className="bg-white border-2 border-[#1C1C1C] rounded-xl p-4 cursor-pointer shadow-[2px_2px_0px_#1C1C1C] hover:shadow-[4px_4px_0px_#1C1C1C] hover:-translate-y-0.5 transition-all"
                              data-testid={`day-post-${post.id}`}>
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  <Icon size={16} className="text-[#4B5563]" />
                                  <span className="font-bold text-[#1C1C1C]">{post.concept || 'Untitled'}</span>
                                </div>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border"
                                  style={{ backgroundColor: status.bg, color: status.text, borderColor: status.border }}>
                                  {status.label}
                                </span>
                              </div>
                              {post.message && <p className="text-sm text-[#4B5563] mt-2 line-clamp-2">{post.message}</p>}
                              <div className="flex gap-1 mt-2">
                                {(post.platforms || []).map(pk => (
                                  <span key={pk} className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                                    style={{ backgroundColor: PLATFORM_COLORS[pk] }} title={PLATFORM_LABELS[pk]}>
                                    {pk[0].toUpperCase()}
                                  </span>
                                ))}
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

      {/* Post Form Dialog */}
      <PostFormDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingPost(null); }}
        post={editingPost || { post_date: clickedDate }}
        categories={categories}
        platforms={platforms}
        onSave={handleSavePost}
        onDelete={handleDeletePost}
      />
    </div>
  );
}
