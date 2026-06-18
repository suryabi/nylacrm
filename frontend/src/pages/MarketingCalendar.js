import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { marketingAPI } from '../utils/api';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import EventPanel from '../components/EventPanel';
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon,
  Film, Image, Video, MoreHorizontal, X, Save, Trash2,
  Sparkles, Eye, Send, PenLine, GripVertical, List,
  Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2,
  CalendarDays, MapPin, Users,
} from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const VIEWS = ['month','week','day','list'];

const STATUS_CONFIG = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', label: 'Draft', icon: PenLine },
  review: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400', label: 'Review', icon: Eye },
  scheduled: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', label: 'Scheduled', icon: CalendarIcon },
  published: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Published', icon: Send },
};

const CONTENT_TYPE_ICONS = {
  reel: { icon: Film, color: '#8b5cf6', bg: 'bg-violet-100', text: 'text-violet-700', label: 'Reel' },
  image: { icon: Image, color: '#0ea5e9', bg: 'bg-sky-100', text: 'text-sky-700', label: 'Image' },
  video: { icon: Video, color: '#f43f5e', bg: 'bg-rose-100', text: 'text-rose-700', label: 'Video' },
  other: { icon: MoreHorizontal, color: '#64748b', bg: 'bg-slate-100', text: 'text-slate-600', label: 'Other' },
};

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
                const ctDef = CONTENT_TYPE_ICONS[t];
                const CtIcon = ctDef.icon;
                const active = form.content_type === t;
                return (
                  <button key={t} onClick={() => setForm(p => ({ ...p, content_type: t }))}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium capitalize transition-all ${active ? 'bg-slate-900 text-white' : `${ctDef.bg} ${ctDef.text} hover:opacity-80`}`}
                    data-testid={`content-type-${t}`}><CtIcon size={14} /> {t}</button>
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
  const ct = CONTENT_TYPE_ICONS[post.content_type] || CONTENT_TYPE_ICONS.other;
  const CtIcon = ct.icon;
  const borderColor = {
    draft: 'border-l-slate-400',
    review: 'border-l-amber-400',
    scheduled: 'border-l-blue-500',
    published: 'border-l-emerald-500',
  }[post.status] || 'border-l-slate-400';

  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', post.id); e.dataTransfer.effectAllowed = 'move'; onDragStart?.(post.id); }}
      className={`w-full text-left rounded-lg border-l-[3px] ${borderColor} ${status.bg} hover:brightness-95 transition-all cursor-grab active:cursor-grabbing group/card`}
      data-testid={`post-pill-${post.id}`}>
      <div className="flex items-start justify-between gap-1 px-2 py-1.5">
        <button onClick={(e) => { e.stopPropagation(); onClick(post); }} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1 mb-0.5">
            <CtIcon className={`w-3 h-3 ${ct.text}`} />
            <span className={`text-[10px] font-bold uppercase tracking-wider ${status.text} truncate`}>{post.category || ct.label}</span>
          </div>
          <p className={`text-xs font-semibold ${status.text} leading-snug line-clamp-2`}>{post.concept || 'Untitled'}</p>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(post.id); }}
          className="shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/60"
          data-testid={`delete-pill-${post.id}`}><X className="w-3 h-3 text-slate-400" /></button>
      </div>
    </div>
  );
}

// --- Event Badge (prominent) ---
function EventBadge({ event }) {
  const isIndian = event.type === 'indian';
  const isCustom = event.type === 'custom';
  const styles = isIndian
    ? { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-l-orange-500' }
    : isCustom
    ? { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-l-violet-500' }
    : { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-l-sky-500' };
  return (
    <div className={`flex items-center gap-1.5 rounded-lg border-l-[3px] ${styles.border} ${styles.bg} px-2 py-1`} title={event.name}>
      <Sparkles className={`w-3 h-3 ${styles.text} shrink-0`} />
      <span className={`text-[11px] font-semibold ${styles.text} truncate`}>{event.name}</span>
    </div>
  );
}

// --- Calendar Event Card (full events with requirements/tasks) ---
function CalendarEventCard({ event, onClick }) {
  const styles = {
    planned: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-l-violet-500' },
    in_progress: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-l-amber-500' },
    completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-l-emerald-500' },
    cancelled: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-l-rose-400' },
  };
  const s = styles[event.status] || styles.planned;
  const tasksDone = (event.tasks || []).filter(t => t.status === 'done').length;
  const tasksTotal = (event.tasks || []).length;

  return (
    <div
      className={`w-full text-left rounded-lg border-l-[3px] ${s.border} ${s.bg} hover:brightness-95 transition-all cursor-pointer group/evcard ${event.status === 'cancelled' ? 'opacity-60' : ''}`}
      onClick={(e) => { e.stopPropagation(); onClick(event); }}
      data-testid={`cal-event-${event.id}`}
    >
      <div className="px-2 py-1.5">
        <div className="flex items-center gap-1 mb-0.5">
          <CalendarDays className={`w-3 h-3 ${s.text} shrink-0`} />
          {event.event_type && (
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: event.event_type_color || '#8B5CF6' }} />
          )}
          <span className={`text-[10px] font-bold uppercase tracking-wider ${s.text} truncate`}>{event.event_type || 'Event'}</span>
        </div>
        <p className={`text-xs font-semibold ${s.text} leading-snug line-clamp-1`}>{event.name}</p>
        {(event.start_time || event.location || tasksTotal > 0) && (
          <div className={`flex items-center gap-2 mt-0.5 text-[10px] ${s.text} opacity-70`}>
            {event.start_time && <span className="tabular-nums">{event.start_time}</span>}
            {event.location && <span className="flex items-center gap-0.5 truncate"><MapPin className="w-2.5 h-2.5" />{event.location}</span>}
            {tasksTotal > 0 && <span className="tabular-nums">{tasksDone}/{tasksTotal}</span>}
          </div>
        )}
      </div>
    </div>
  );
}



// ---- Main Calendar ----
export default function MarketingCalendar() {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [view, setView] = useState('month');
  const [loading, setLoading] = useState(true);

  const [postsByDate, setPostsByDate] = useState({});
  const [events, setEvents] = useState([]);
  const [calEventsByDate, setCalEventsByDate] = useState({});
  const [eventTypes, setEventTypes] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [stats, setStats] = useState({ total: 0, by_status: {} });
  const [categories, setCategories] = useState([]);
  const [platforms, setPlatforms] = useState([]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [clickedDate, setClickedDate] = useState('');

  // Event panel state
  const [eventPanelOpen, setEventPanelOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

  const [weekStart, setWeekStart] = useState(null);
  const [draggingPostId, setDraggingPostId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  // List view filters
  const [listStatus, setListStatus] = useState('all');
  const [listCategory, setListCategory] = useState('all');

  // Upload flow
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState('choose'); // choose | preview | done
  const [uploadParsed, setUploadParsed] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const today = new Date();
    const d = today.getDay();
    setWeekStart(new Date(today.getFullYear(), today.getMonth(), today.getDate() - d));
  }, []);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const [calRes, catRes, platRes, etRes] = await Promise.all([
        marketingAPI.getCalendar(month, year), marketingAPI.getCategories(), marketingAPI.getPlatforms(),
        marketingAPI.getEventTypes(),
      ]);
      setPostsByDate(calRes.data.posts_by_date || {});
      setEvents(calRes.data.events || []);
      setCalEventsByDate(calRes.data.calendar_events_by_date || {});
      setStats(calRes.data.stats || { total: 0, by_status: {} });
      setCategories(catRes.data || []);
      setPlatforms(platRes.data || []);
      setEventTypes(etRes.data || []);
    } catch { toast.error('Failed to load calendar'); }
    finally { setLoading(false); }
  }, [month, year]);

  // Load team members for task assignment
  useEffect(() => {
    const loadTeam = async () => {
      try {
        const { data } = await require('axios').get(process.env.REACT_APP_BACKEND_URL + '/api/users', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'X-Tenant-ID': localStorage.getItem('tenant_id') }
        });
        const marketing = data.filter(u => {
          if (!u.is_active) return false;
          const depts = Array.isArray(u.department) ? u.department : [u.department || ''];
          return depts.some(d => d === 'Marketing' || d === 'Admin');
        });
        setTeamMembers(marketing);
      } catch { }
    };
    loadTeam();
  }, []);

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

  // Calendar Event handlers
  const openNewEvent = (dateStr) => { setEditingEvent(null); setClickedDate(dateStr); setEventPanelOpen(true); };
  const openEditEvent = (ev) => { setEditingEvent(ev); setClickedDate(ev.event_date); setEventPanelOpen(true); };
  const saveEvent = async (formData) => {
    if (editingEvent?.id) { await marketingAPI.updateCalendarEvent(editingEvent.id, formData); toast.success('Event updated'); }
    else { await marketingAPI.createCalendarEvent(formData); toast.success('Event created'); }
    loadCalendar();
  };
  const deleteEvent = async (id) => { await marketingAPI.deleteCalendarEvent(id); toast.success('Event deleted'); loadCalendar(); };

  const handleDrop = async (dateStr) => {
    if (!draggingPostId) return;
    setDropTarget(null); setDraggingPostId(null);
    try { await marketingAPI.updatePost(draggingPostId, { post_date: dateStr }); toast.success('Post moved'); loadCalendar(); }
    catch { toast.error('Failed to move post'); }
  };

  // --- Spreadsheet Upload / Download ---
  const handleDownloadTemplate = async () => {
    try {
      const res = await marketingAPI.downloadTemplate();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = 'marketing_calendar_template.xlsx';
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch { toast.error('Failed to download template'); }
  };

  const handleExport = async () => {
    try {
      const res = await marketingAPI.exportPosts(month, year);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = `marketing_calendar_${year}_${String(month).padStart(2,'0')}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
      toast.success('Calendar exported');
    } catch { toast.error('Failed to export'); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await marketingAPI.uploadPreview(file);
      setUploadParsed(res.data);
      setUploadStep('preview');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to parse file');
    } finally { setUploading(false); }
  };

  const removePreviewRow = (rowNum) => {
    if (!uploadParsed) return;
    const rows = uploadParsed.rows.filter(r => r.row_num !== rowNum);
    setUploadParsed({
      ...uploadParsed,
      rows,
      total: rows.length,
      valid_count: rows.filter(r => r.valid).length,
      error_count: rows.filter(r => !r.valid).length,
    });
  };

  const handleUploadConfirm = async () => {
    if (!uploadParsed) return;
    const validRows = uploadParsed.rows.filter(r => r.valid);
    if (!validRows.length) { toast.error('No valid rows to save'); return; }

    // Determine month/year from the first row's date
    const firstDate = validRows[0].post_date;
    const uploadMonth = parseInt(firstDate.split('-')[1], 10);
    const uploadYear = parseInt(firstDate.split('-')[0], 10);

    setConfirming(true);
    try {
      const res = await marketingAPI.uploadConfirm(uploadMonth, uploadYear, validRows);
      toast.success(res.data.message);
      setUploadStep('done');
      setMonth(uploadMonth);
      setYear(uploadYear);
      loadCalendar();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save');
    } finally { setConfirming(false); }
  };

  const resetUpload = () => { setUploadOpen(false); setUploadStep('choose'); setUploadParsed(null); };

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
  const getEventsForDate = (mmdd, fullDate) => events.filter(e => e.date === mmdd || e.date === fullDate);

  return (
    <div className="space-y-5 sm:space-y-6 p-6 lg:p-8 bg-slate-50/40 min-h-screen" data-testid="marketing-calendar">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center shadow-lg shadow-slate-900/10">
              <CalendarIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Content Calendar</h1>
              <p className="text-sm text-slate-500 mt-0.5">Plan, schedule & publish your marketing posts and events</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="hidden sm:flex items-center gap-2 px-3 h-10 rounded-xl bg-white border border-slate-200">
            <span className="text-xs text-slate-500">Posts</span>
            <span className="text-sm font-bold text-slate-900 tabular-nums">{stats.total}</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">Events</span>
            <span className="text-sm font-bold text-slate-900 tabular-nums">{stats.calendar_events_count || events.length}</span>
          </div>
          <button onClick={handleExport}
            className="h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
            data-testid="export-btn"><Download className="w-4 h-4" /> Export</button>
          <button onClick={() => { setUploadOpen(true); setUploadStep('choose'); setUploadParsed(null); }}
            className="h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
            data-testid="upload-btn"><Upload className="w-4 h-4" /> Upload</button>
          <button onClick={() => openNewEvent(todayStr)}
            className="h-10 px-3.5 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 text-sm font-semibold flex items-center gap-1.5"
            data-testid="new-event-btn"><CalendarDays className="w-4 h-4" /> New Event</button>
          <button onClick={() => openNew(todayStr)}
            className="h-10 px-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 text-white text-sm font-semibold hover:from-slate-800 flex items-center gap-2"
            data-testid="new-post-btn"><Plus className="w-4 h-4" /> New Post</button>
        </div>
      </div>

      {/* Calendar shell */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
              <button onClick={view === 'week' ? prevWeek : prevMonth} className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-sm flex items-center justify-center" data-testid="prev-period-btn">
                <ChevronLeft className="w-4 h-4 text-slate-700" />
              </button>
              <button onClick={goToday} className="px-3 h-8 rounded-lg text-xs font-semibold text-slate-700 hover:bg-white hover:shadow-sm" data-testid="today-btn">Today</button>
              <button onClick={view === 'week' ? nextWeek : nextMonth} className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-sm flex items-center justify-center" data-testid="next-period-btn">
                <ChevronRight className="w-4 h-4 text-slate-700" />
              </button>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {view === 'day'
                ? <>{MONTHS[now.getMonth()]} {now.getDate()}, <span className="text-slate-400 font-light">{now.getFullYear()}</span></>
                : <>{MONTHS[month - 1]} <span className="text-slate-400 font-light">{year}</span></>}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-4">
              {Object.entries(STATUS_CONFIG).map(([key, s]) => (
                <span key={key} className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />{stats.by_status[key] || 0} {s.label}
                </span>
              ))}
            </div>
            <div className="flex items-center bg-slate-100 rounded-xl p-1" data-testid="view-toggle">
              {VIEWS.map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3.5 h-8 rounded-lg text-xs font-semibold capitalize transition-all ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  data-testid={`view-${v}`}>
                  {v === 'list' ? <span className="flex items-center gap-1"><List className="w-3 h-3" /> List</span> : v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calendar Body */}
        {loading ? (
          <div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
        ) : (
          <>
            {/* MONTH VIEW */}
            {view === 'month' && (
              <>
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/50">
                  {DAYS.map((d, di) => (
                    <div key={d} className={`text-center text-[11px] font-bold uppercase tracking-[0.14em] py-2.5 ${di === 0 || di === 6 ? 'text-slate-400' : 'text-slate-500'}`}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {calendarDays.map((day, i) => {
                    const colIndex = i % 7;
                    const isWeekend = colIndex === 0 || colIndex === 6;
                    if (day === null) return <div key={`e-${i}`} className="min-h-[170px] sm:min-h-[200px] border-r border-b border-slate-100 bg-slate-50/40" />;
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isToday = dateStr === todayStr;
                    const posts = postsByDate[dateStr] || [];
                    const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayEvents = getEventsForDate(mmdd, dateStr);
                    const isDrop = dropTarget === dateStr;

                    return (
                      <div key={dateStr}
                        className={`group relative min-h-[170px] sm:min-h-[200px] border-r border-b border-slate-100 p-2 sm:p-2.5 cursor-pointer transition-all hover:bg-slate-50/70 ${isToday ? 'bg-sky-50/40' : isWeekend ? 'bg-slate-50/30' : 'bg-white'} ${isDrop ? 'bg-sky-50 ring-2 ring-sky-400 ring-inset' : ''}`}
                        onClick={() => openNew(dateStr)}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(dateStr); }}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={(e) => { e.preventDefault(); handleDrop(dateStr); }}
                        data-testid={`cal-cell-${dateStr}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full text-sm font-bold tabular-nums ${isToday ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-700 group-hover:bg-slate-100'}`}>{day}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); openNew(dateStr); }}
                            className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center hover:scale-110 transition-all"
                            title="New post"
                            data-testid={`day-create-${dateStr}`}>
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="space-y-1 overflow-hidden">
                          {dayEvents.map((ev, ei) => <EventBadge key={ei} event={ev} />)}
                          {(calEventsByDate[dateStr] || []).map(ce => <CalendarEventCard key={ce.id} event={ce} onClick={openEditEvent} />)}
                          {posts.slice(0, 3).map(p => (
                            <PostCard key={p.id} post={p} onClick={openEdit} onDelete={deletePost} onDragStart={setDraggingPostId} />
                          ))}
                          {posts.length > 3 && (
                            <button onClick={(e) => { e.stopPropagation(); openNew(dateStr); }} className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 px-1.5 py-0.5">
                              +{posts.length - 3} more
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* WEEK VIEW */}
            {view === 'week' && (
              <>
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/50">
                  {getWeekDates().map(d => {
                    const ds = fmtDate(d);
                    const isToday = ds === todayStr;
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div key={ds} className={`px-3 py-3 ${isToday ? 'border-b-2 border-sky-300' : ''} ${isWeekend ? 'bg-slate-50/40' : ''}`}>
                        <div className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isWeekend ? 'text-slate-400' : 'text-slate-400'}`}>{DAYS[d.getDay()]}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-xl font-black tabular-nums ${isToday ? 'bg-slate-900 text-white' : isWeekend ? 'text-slate-400' : 'text-slate-800'}`}>{d.getDate()}</span>
                          {(postsByDate[ds] || []).length > 0 && (
                            <span className="text-[11px] font-semibold text-slate-500">
                              {(postsByDate[ds] || []).length} post{(postsByDate[ds] || []).length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-7 min-h-[460px] divide-x divide-slate-100">
                  {getWeekDates().map(d => {
                    const ds = fmtDate(d);
                    const posts = postsByDate[ds] || [];
                    const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    const dayEvents = getEventsForDate(mmdd, ds);
                    const isDrop = dropTarget === ds;
                    const isToday = ds === todayStr;
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div key={ds} className={`p-2 cursor-pointer transition-all group ${isToday ? 'bg-sky-50/30' : isWeekend ? 'bg-slate-50/30' : 'bg-white hover:bg-slate-50/40'} ${isDrop ? 'bg-sky-50 ring-2 ring-sky-400 ring-inset' : ''}`}
                        onClick={() => openNew(ds)}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(ds); }}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={(e) => { e.preventDefault(); handleDrop(ds); }}>
                        <div className="space-y-1">
                          {dayEvents.map((ev, ei) => <EventBadge key={ei} event={ev} />)}
                          {(calEventsByDate[ds] || []).map(ce => <CalendarEventCard key={ce.id} event={ce} onClick={openEditEvent} />)}
                          {posts.map(p => <PostCard key={p.id} post={p} onClick={openEdit} onDelete={deletePost} onDragStart={setDraggingPostId} />)}
                          {posts.length === 0 && dayEvents.length === 0 && (calEventsByDate[ds] || []).length === 0 && (
                            <div className="opacity-0 group-hover:opacity-100 mt-2 rounded-lg border border-dashed border-slate-300 py-2 text-center text-[11px] text-slate-400 flex items-center justify-center gap-1">
                              <Plus className="w-3 h-3" /> Add
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* DAY VIEW */}
            {view === 'day' && (() => {
              const dayPosts = postsByDate[todayStr] || [];
              const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              const dayEvents = getEventsForDate(mmdd, todayStr);
              return (
                <div className="flex flex-col">
                  <div className="px-5 py-4 border-b border-slate-100 bg-sky-50/30">
                    <div className="flex items-baseline gap-3">
                      <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl text-2xl font-black tabular-nums bg-slate-900 text-white">{now.getDate()}</span>
                      <div>
                        <div className="text-sm font-bold text-slate-900">{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()]}</div>
                        <div className="text-xs text-slate-500">{MONTHS[now.getMonth()]} {now.getFullYear()} · {dayPosts.length + (calEventsByDate[todayStr] || []).length} item{dayPosts.length + (calEventsByDate[todayStr] || []).length !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    {dayEvents.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {dayEvents.map((ev, i) => (
                          <span key={i} className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-semibold flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> {ev.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="px-5 py-4 space-y-3">
                    {(calEventsByDate[todayStr] || []).length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1">Events</div>
                        {(calEventsByDate[todayStr] || []).map(ce => (
                          <CalendarEventCard key={ce.id} event={ce} onClick={openEditEvent} />
                        ))}
                      </div>
                    )}

                    {dayPosts.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        <CalendarIcon className="w-8 h-8 mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium">No posts planned</p>
                        <button onClick={() => openNew(todayStr)}
                          className="mt-3 h-9 px-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 text-white text-sm font-semibold hover:from-slate-800 inline-flex items-center gap-1.5">
                          <Plus className="w-4 h-4" /> Plan a Post
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1">Posts</div>
                        {dayPosts.map(post => {
                          const s = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft;
                          const ct = CONTENT_TYPE_ICONS[post.content_type] || CONTENT_TYPE_ICONS.other;
                          const CtIcon = ct.icon;
                          return (
                            <div key={post.id} onClick={() => openEdit(post)}
                              className={`rounded-xl border-l-[3px] ${s.dot.replace('bg-', 'border-l-')} bg-white border-y border-r border-slate-200 p-3.5 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all`}
                              data-testid={`day-post-${post.id}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ct.bg}`}>
                                    <CtIcon className={`w-4 h-4 ${ct.text}`} />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-900 line-clamp-1">{post.concept || 'Untitled'}</p>
                                    {post.category && <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mt-0.5">{post.category}</p>}
                                  </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${s.bg} ${s.text}`}>{s.label}</span>
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

            {/* LIST VIEW */}
            {view === 'list' && (() => {
              // Flatten all posts from postsByDate
              const allPosts = Object.values(postsByDate).flat();
              const filtered = allPosts.filter(p => {
                if (listStatus !== 'all' && p.status !== listStatus) return false;
                if (listCategory !== 'all' && p.category !== listCategory) return false;
                return true;
              });

              return (
                <div>
                  {/* Filters */}
                  <div className="flex flex-wrap items-center gap-3 mb-4" data-testid="list-filters">
                    <select value={month} onChange={e => setMonth(Number(e.target.value))}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid="filter-month">
                      {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                    <select value={year} onChange={e => setYear(Number(e.target.value))}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid="filter-year">
                      {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select value={listStatus} onChange={e => setListStatus(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid="filter-status">
                      <option value="all">All Statuses</option>
                      {Object.entries(STATUS_CONFIG).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                    </select>
                    <select value={listCategory} onChange={e => setListCategory(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid="filter-category">
                      <option value="all">All Categories</option>
                      {categories.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
                    </select>
                    <span className="text-xs text-slate-400 ml-1">{filtered.length} post{filtered.length !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Table */}
                  {filtered.length === 0 ? (
                    <div className="border border-slate-200 rounded-lg p-12 text-center text-slate-400">
                      <CalendarIcon size={32} className="mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">No posts found</p>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left" data-testid="list-table">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">Date</th>
                            <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">Concept</th>
                            <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">Category</th>
                            <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">Type</th>
                            <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">Platforms</th>
                            <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">Status</th>
                            <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-400 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filtered.map(post => {
                            const s = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft;
                            const ct = CONTENT_TYPE_ICONS[post.content_type] || CONTENT_TYPE_ICONS.other;
                            const CtIcon = ct.icon;
                            const catDef = categories.find(c => c.name === post.category);
                            const dateObj = post.post_date ? new Date(post.post_date + 'T00:00:00') : null;
                            const dateLabel = dateObj ? dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';

                            return (
                              <tr key={post.id}
                                className="hover:bg-slate-50/50 cursor-pointer transition-colors group"
                                onClick={() => navigate(`/marketing-post/${post.id}`)}
                                data-testid={`list-row-${post.id}`}>
                                <td className="px-4 py-3 text-sm text-slate-600 font-medium whitespace-nowrap">{dateLabel}</td>
                                <td className="px-4 py-3">
                                  <div className="text-sm font-medium text-slate-900 line-clamp-1">{post.concept || 'Untitled'}</div>
                                  {post.message && <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{post.message}</div>}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                                    {catDef && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: catDef.color }} />}
                                    {post.category || '—'}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center gap-2 text-xs font-medium capitalize ${ct.text}`}>
                                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${ct.bg}`}>
                                      <CtIcon size={16} className={ct.text} />
                                    </span>
                                    {ct.label}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-1">
                                    {(post.platforms || []).map(pk => {
                                      const ps = PLATFORM_STYLES[pk] || {};
                                      return <span key={pk} className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white" style={{ backgroundColor: ps.color }} title={ps.label}>{ps.short}</span>;
                                    })}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${s.bg} ${s.text}`}>{s.label}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <button onClick={(e) => { e.stopPropagation(); deletePost(post.id); }}
                                    className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                                    data-testid={`list-delete-${post.id}`}><Trash2 size={14} /></button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>

      <PostPanel open={panelOpen} onClose={() => { setPanelOpen(false); setEditingPost(null); }}
        post={editingPost || { post_date: clickedDate }} categories={categories} platforms={platforms}
        onSave={savePost} onDelete={deletePost} />

      {/* Upload Sheet */}
      <Sheet open={uploadOpen} onOpenChange={resetUpload}>
        <SheetContent side="right" className="w-full sm:max-w-2xl border-l border-slate-200 p-0 bg-white overflow-y-auto [&>button]:hidden">
          <div className="px-6 pt-5 pb-4 border-b border-slate-200 sticky top-0 z-10 bg-white">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-semibold text-slate-900">
                {uploadStep === 'choose' ? 'Upload Calendar' : uploadStep === 'preview' ? 'Preview Upload' : 'Upload Complete'}
              </SheetTitle>
              <button onClick={resetUpload} className="p-1 rounded hover:bg-slate-100 transition-colors" data-testid="close-upload-btn"><X size={18} className="text-slate-400" /></button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Step 1: Choose file */}
            {uploadStep === 'choose' && (
              <>
                {/* Download template */}
                <div className="border border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50/50">
                  <FileSpreadsheet size={32} className="mx-auto text-slate-400 mb-3" />
                  <h3 className="text-sm font-semibold text-slate-800 mb-1">Start with the template</h3>
                  <p className="text-xs text-slate-500 mb-4">Download the Excel template, fill in your posts, then upload it back.</p>
                  <button onClick={handleDownloadTemplate}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-white transition-colors inline-flex items-center gap-2"
                    data-testid="download-template-btn"><Download size={14} /> Download Template</button>
                </div>

                {/* Upload area */}
                <div className="relative">
                  <div className="border-2 border-dashed border-blue-200 rounded-xl p-8 text-center bg-blue-50/30 hover:bg-blue-50/60 transition-colors cursor-pointer">
                    <Upload size={28} className="mx-auto text-blue-400 mb-3" />
                    <h3 className="text-sm font-semibold text-slate-800 mb-1">Upload your spreadsheet</h3>
                    <p className="text-xs text-slate-500 mb-1">Supports .xlsx and .csv files</p>
                    {uploading && <div className="flex items-center justify-center gap-2 mt-3 text-sm text-blue-600"><Loader2 size={14} className="animate-spin" /> Parsing file...</div>}
                    <input type="file" accept=".xlsx,.csv" onChange={handleFileUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer" disabled={uploading}
                      data-testid="upload-file-input" />
                  </div>
                </div>

                <div className="border border-amber-200 bg-amber-50 rounded-lg px-4 py-3">
                  <p className="text-xs text-amber-800 flex items-start gap-2">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>Uploading will <strong>replace existing posts only for the dates</strong> present in your spreadsheet. Posts on other dates will remain unchanged.</span>
                  </p>
                </div>
              </>
            )}

            {/* Step 2: Preview */}
            {uploadStep === 'preview' && uploadParsed && (
              <>
                {/* Summary */}
                <div className="flex gap-3">
                  <div className="flex-1 border border-slate-200 rounded-lg px-4 py-3">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Total Rows</div>
                    <div className="text-xl font-semibold text-slate-900">{uploadParsed.total}</div>
                  </div>
                  <div className="flex-1 border border-emerald-200 rounded-lg px-4 py-3 bg-emerald-50/50">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-600">Valid</div>
                    <div className="text-xl font-semibold text-emerald-700">{uploadParsed.valid_count}</div>
                  </div>
                  {uploadParsed.error_count > 0 && (
                    <div className="flex-1 border border-red-200 rounded-lg px-4 py-3 bg-red-50/50">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-red-600">Errors</div>
                      <div className="text-xl font-semibold text-red-700">{uploadParsed.error_count}</div>
                    </div>
                  )}
                </div>

                {/* Preview table */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-left" data-testid="upload-preview-table">
                      <thead className="bg-slate-50 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">#</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Date</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Concept</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Category</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Type</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Platforms</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</th>
                          <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadParsed.rows.map((row) => {
                          const s = STATUS_CONFIG[row.status] || STATUS_CONFIG.draft;
                          return (
                            <tr key={row.row_num} className={`border-t border-slate-100 ${!row.valid ? 'bg-red-50/50' : ''}`} data-testid={`preview-row-${row.row_num}`}>
                              <td className="px-3 py-2 text-xs text-slate-400">{row.row_num}</td>
                              <td className="px-3 py-2 text-xs text-slate-700 whitespace-nowrap">{row.post_date}</td>
                              <td className="px-3 py-2 text-xs text-slate-800 font-medium max-w-[160px] truncate">{row.concept || '—'}</td>
                              <td className="px-3 py-2 text-xs text-slate-600">{row.category || '—'}</td>
                              <td className="px-3 py-2">
                                {(() => { const pct = CONTENT_TYPE_ICONS[row.content_type] || CONTENT_TYPE_ICONS.other; const PIcon = pct.icon; return (
                                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${pct.text}`}>
                                    <span className={`w-5 h-5 rounded flex items-center justify-center ${pct.bg}`}><PIcon size={12} className={pct.text} /></span>
                                    {pct.label}
                                  </span>
                                ); })()}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex gap-0.5">
                                  {(row.platforms || []).map(pk => {
                                    const ps = PLATFORM_STYLES[pk] || {};
                                    return <span key={pk} className="w-4 h-4 rounded-full flex items-center justify-center text-[6px] font-bold text-white" style={{ backgroundColor: ps.color }}>{ps.short}</span>;
                                  })}
                                </div>
                              </td>
                              <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-[9px] font-medium ${s.bg} ${s.text}`}>{s.label}</span></td>
                              <td className="px-3 py-2">
                                {row.valid ? (
                                  <button onClick={() => removePreviewRow(row.row_num)} className="text-slate-300 hover:text-red-500 transition-colors" data-testid={`remove-row-${row.row_num}`}><X size={13} /></button>
                                ) : (
                                  <span className="text-red-400" title={row.errors?.join(', ')}><AlertCircle size={13} /></span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Error rows detail */}
                {uploadParsed.error_count > 0 && (
                  <div className="space-y-1">
                    {uploadParsed.rows.filter(r => !r.valid).map(r => (
                      <div key={r.row_num} className="text-xs text-red-600 flex items-start gap-1.5 px-1">
                        <AlertCircle size={11} className="mt-0.5 shrink-0" />
                        <span>Row {r.row_num}: {r.errors?.join(', ')}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => { setUploadStep('choose'); setUploadParsed(null); }}
                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                    data-testid="upload-back-btn">Back</button>
                  <button onClick={handleUploadConfirm} disabled={confirming || uploadParsed.valid_count === 0}
                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    data-testid="upload-confirm-btn">
                    {confirming ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <>
                      <CheckCircle2 size={14} /> Confirm Upload ({uploadParsed.valid_count} posts)
                    </>}
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Done */}
            {uploadStep === 'done' && (
              <div className="text-center py-8">
                <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-1">Upload Complete</h3>
                <p className="text-sm text-slate-500 mb-6">Your calendar has been updated successfully.</p>
                <button onClick={resetUpload}
                  className="px-6 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  data-testid="upload-done-btn">Done</button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Event Panel */}
      <EventPanel
        open={eventPanelOpen}
        onClose={() => setEventPanelOpen(false)}
        event={editingEvent}
        eventTypes={eventTypes}
        teamMembers={teamMembers}
        onSave={saveEvent}
        onDelete={deleteEvent}
        clickedDate={clickedDate}
      />
    </div>
  );
}
