import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { marketingAPI } from '../utils/api';
import { toast } from 'sonner';
import {
  ArrowLeft, Film, Image, Video, MoreHorizontal, Save, Trash2,
  Eye, Send, PenLine, Calendar as CalendarIcon, ExternalLink,
} from 'lucide-react';

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

const WORKFLOW_ORDER = ['draft', 'review', 'scheduled', 'published'];

export default function MarketingPostDetail() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [categories, setCategories] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [postRes, catRes, platRes] = await Promise.all([
        marketingAPI.getPost(postId),
        marketingAPI.getCategories(),
        marketingAPI.getPlatforms(),
      ]);
      setPost(postRes.data);
      setForm(postRes.data);
      setCategories(catRes.data || []);
      setPlatforms(platRes.data || []);
    } catch {
      toast.error('Failed to load post');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await marketingAPI.updatePost(postId, form);
      toast.success('Post updated');
      setEditing(false);
      load();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await marketingAPI.updatePostStatus(postId, newStatus);
      toast.success(`Status changed to ${newStatus}`);
      load();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async () => {
    try {
      await marketingAPI.deletePost(postId);
      toast.success('Post deleted');
      navigate('/marketing-calendar');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const togglePlatform = (key) => {
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms?.includes(key)
        ? prev.platforms.filter(p => p !== key)
        : [...(prev.platforms || []), key]
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-sm text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-slate-400 mb-3">Post not found</p>
          <button onClick={() => navigate('/marketing-calendar')} className="text-blue-600 hover:text-blue-700 text-sm font-medium">Back to Calendar</button>
        </div>
      </div>
    );
  }

  const status = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft;
  const ContentIcon = CONTENT_TYPE_ICONS[post.content_type] || MoreHorizontal;
  const catDef = categories.find(c => c.name === post.category);
  const dateObj = post.post_date ? new Date(post.post_date + 'T00:00:00') : null;
  const dateFormatted = dateObj ? dateObj.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const currentIdx = WORKFLOW_ORDER.indexOf(post.status);
  const enabledPlatforms = platforms.filter(p => p.enabled !== false);

  return (
    <div className="min-h-screen bg-white" data-testid="marketing-post-detail">
      {/* Header */}
      <div className="border-b border-slate-200 sticky top-0 z-40 bg-white">
        <div className="px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate('/marketing-calendar')}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
                data-testid="back-btn"><ArrowLeft size={18} /></button>
              <div>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">{post.concept || 'Untitled Post'}</h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm text-slate-500">{dateFormatted}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium ${status.bg} ${status.text}`}>{status.label}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!editing ? (
                <>
                  <button onClick={() => setEditing(true)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200"
                    data-testid="edit-btn">Edit</button>
                  <button onClick={handleDelete}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                    data-testid="detail-delete-btn"><Trash2 size={14} /></button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditing(false); setForm(post); }}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                    data-testid="cancel-edit-btn">Cancel</button>
                  <button onClick={handleSave} disabled={saving}
                    className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    data-testid="save-detail-btn"><Save size={14} /> {saving ? 'Saving...' : 'Save'}</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-8 py-6 max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content — left 2 cols */}
          <div className="lg:col-span-2 space-y-6">
            {/* Concept */}
            <div className="border border-slate-200 rounded-lg p-5" data-testid="section-concept">
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-2 block">Concept</label>
              {editing ? (
                <textarea value={form.concept || ''} onChange={e => setForm(p => ({ ...p, concept: e.target.value }))}
                  rows={4}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none leading-relaxed"
                  data-testid="detail-concept-input" />
              ) : (
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{post.concept || '—'}</p>
              )}
            </div>

            {/* Message / Caption */}
            <div className="border border-slate-200 rounded-lg p-5" data-testid="section-message">
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-2 block">Message / Caption</label>
              {editing ? (
                <textarea value={form.message || ''} onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                  rows={4}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none leading-relaxed"
                  data-testid="detail-message-input" />
              ) : (
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{post.message || '—'}</p>
              )}
            </div>

            {/* Platform Links (future — placeholder) */}
            <div className="border border-slate-200 rounded-lg p-5" data-testid="section-links">
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-3 block">Platform Links & Analytics</label>
              <div className="space-y-2">
                {(post.platforms || []).map(pk => {
                  const ps = PLATFORM_STYLES[pk] || {};
                  return (
                    <div key={pk} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: ps.color }}>{ps.short}</span>
                        <span className="text-sm font-medium text-slate-700">{ps.label}</span>
                      </div>
                      <span className="text-xs text-slate-400 italic">Link not added yet</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-3">Platform links and analytics tracking will be available in a future update.</p>
            </div>
          </div>

          {/* Sidebar — right col */}
          <div className="space-y-5">
            {/* Workflow */}
            <div className="border border-slate-200 rounded-lg p-5" data-testid="section-workflow">
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-3 block">Workflow</label>
              <div className="space-y-1.5">
                {WORKFLOW_ORDER.map((wf, idx) => {
                  const wfConf = STATUS_CONFIG[wf];
                  const isActive = post.status === wf;
                  const isPast = idx < currentIdx;
                  const isNext = idx === currentIdx + 1;
                  const WfIcon = wfConf.icon;
                  return (
                    <button key={wf} onClick={() => handleStatusChange(wf)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive ? `${wfConf.bg} ${wfConf.text} ring-1 ring-current` : isPast ? 'text-slate-400 bg-slate-50' : isNext ? 'text-slate-600 hover:bg-slate-50 border border-dashed border-slate-300' : 'text-slate-400 hover:bg-slate-50'}`}
                      data-testid={`workflow-${wf}`}>
                      <WfIcon size={14} />
                      {wfConf.label}
                      {isActive && <span className="ml-auto text-[10px] font-medium opacity-70">Current</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Details */}
            <div className="border border-slate-200 rounded-lg p-5" data-testid="section-details">
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-3 block">Details</label>
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] text-slate-400 mb-0.5">Date</div>
                  {editing ? (
                    <input type="date" value={form.post_date?.slice(0, 10) || ''} onChange={e => setForm(p => ({ ...p, post_date: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid="detail-date-input" />
                  ) : (
                    <div className="text-sm font-medium text-slate-700">{dateFormatted}</div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] text-slate-400 mb-0.5">Category</div>
                  {editing ? (
                    <select value={form.category || ''} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid="detail-category-select">
                      <option value="">Select...</option>
                      {categories.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  ) : (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                      {catDef && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: catDef.color }} />}
                      {post.category || '—'}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] text-slate-400 mb-1">Content Type</div>
                  {editing ? (
                    <div className="flex gap-1.5">
                      {['reel', 'image', 'video', 'other'].map(t => {
                        const TIcon = CONTENT_TYPE_ICONS[t];
                        return (
                          <button key={t} onClick={() => setForm(p => ({ ...p, content_type: t }))}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${form.content_type === t ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                            data-testid={`detail-type-${t}`}><TIcon size={12} /> {t}</button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 capitalize">
                      <ContentIcon size={14} /> {post.content_type}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] text-slate-400 mb-1">Created By</div>
                  <div className="text-sm text-slate-700">{post.created_by_name || '—'}</div>
                </div>
              </div>
            </div>

            {/* Platforms */}
            <div className="border border-slate-200 rounded-lg p-5" data-testid="section-platforms">
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-2 block">Platforms</label>
              {editing ? (
                <div className="flex flex-wrap gap-1.5">
                  {enabledPlatforms.map(p => {
                    const selected = form.platforms?.includes(p.key);
                    const ps = PLATFORM_STYLES[p.key] || {};
                    return (
                      <button key={p.key} onClick={() => togglePlatform(p.key)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-all ${selected ? 'text-white border-transparent' : 'bg-white text-slate-400 border-slate-200'}`}
                        style={selected ? { backgroundColor: ps.color } : {}}
                        data-testid={`detail-plat-${p.key}`}>{p.name}</button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(post.platforms || []).map(pk => {
                    const ps = PLATFORM_STYLES[pk] || {};
                    return (
                      <span key={pk} className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: ps.color }}>
                        {ps.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
