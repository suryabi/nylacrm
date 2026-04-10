import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { marketingAPI } from '../utils/api';
import { toast } from 'sonner';
import {
  ArrowLeft, Film, Image, Video, MoreHorizontal, Save, Trash2,
  Eye, Send, PenLine, Calendar as CalendarIcon, ExternalLink,
  BarChart3, Users, Heart, MessageCircle, Share2, Link as LinkIcon,
} from 'lucide-react';
import CommentThread from '../components/CommentThread';

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
  const [editingLinks, setEditingLinks] = useState(false);
  const [savingLinks, setSavingLinks] = useState(false);
  const [linkForm, setLinkForm] = useState({});

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
      setLinkForm(postRes.data.platform_links || {});
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

  const updateLinkField = (platformKey, field, value) => {
    setLinkForm(prev => ({
      ...prev,
      [platformKey]: { ...(prev[platformKey] || {}), [field]: value },
    }));
  };

  const handleSaveLinks = async () => {
    setSavingLinks(true);
    try {
      await marketingAPI.updatePostLinks(postId, linkForm);
      toast.success('Links & analytics saved');
      setEditingLinks(false);
      load();
    } catch {
      toast.error('Failed to save links');
    } finally {
      setSavingLinks(false);
    }
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

  // Compute analytics totals from platform_links
  const pLinks = post.platform_links || {};
  const totals = { views: 0, likes: 0, comments: 0, shares: 0, subscribers_added: 0 };
  let hasAnyLink = false;
  for (const pk of (post.platforms || [])) {
    const m = pLinks[pk] || {};
    if (m.url) hasAnyLink = true;
    totals.views += m.views || 0;
    totals.likes += m.likes || 0;
    totals.comments += m.comments || 0;
    totals.shares += m.shares || 0;
    totals.subscribers_added += m.subscribers_added || 0;
  }

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

            {/* Platform Links & Analytics */}
            <div className="border border-slate-200 rounded-lg p-5" data-testid="section-links">
              <div className="flex items-center justify-between mb-4">
                <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Platform Links & Analytics</label>
                {!editingLinks ? (
                  <button onClick={() => setEditingLinks(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors border border-blue-200"
                    data-testid="edit-links-btn">
                    <span className="flex items-center gap-1"><LinkIcon size={12} /> {hasAnyLink ? 'Update Links' : 'Add Links'}</span>
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingLinks(false); setLinkForm(post.platform_links || {}); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                      data-testid="cancel-links-btn">Cancel</button>
                    <button onClick={handleSaveLinks} disabled={savingLinks}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                      data-testid="save-links-btn"><Save size={12} /> {savingLinks ? 'Saving...' : 'Save'}</button>
                  </div>
                )}
              </div>

              {/* Analytics Summary */}
              {hasAnyLink && !editingLinks && (
                <div className="grid grid-cols-5 gap-2 mb-4" data-testid="analytics-summary">
                  {[
                    { label: 'Views', value: totals.views, icon: Eye, color: 'text-blue-600' },
                    { label: 'Likes', value: totals.likes, icon: Heart, color: 'text-rose-500' },
                    { label: 'Comments', value: totals.comments, icon: MessageCircle, color: 'text-amber-600' },
                    { label: 'Shares', value: totals.shares, icon: Share2, color: 'text-emerald-600' },
                    { label: 'New Subs', value: totals.subscribers_added, icon: Users, color: 'text-violet-600' },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="border border-slate-100 rounded-lg px-3 py-2 bg-slate-50/50 text-center" data-testid={`analytics-total-${label.toLowerCase().replace(' ', '-')}`}>
                      <Icon size={14} className={`mx-auto ${color} mb-0.5`} />
                      <div className="text-lg font-semibold text-slate-900">{value.toLocaleString()}</div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Per-Platform Rows */}
              <div className="space-y-2">
                {(post.platforms || []).map(pk => {
                  const ps = PLATFORM_STYLES[pk] || {};
                  const metrics = editingLinks ? (linkForm[pk] || {}) : (pLinks[pk] || {});
                  const hasLink = !!metrics.url;

                  return (
                    <div key={pk} className="rounded-lg border border-slate-100 overflow-hidden" data-testid={`link-row-${pk}`}>
                      {/* Platform header */}
                      <div className={`flex items-center justify-between py-2.5 px-3 ${hasLink && !editingLinks ? 'bg-white' : 'bg-slate-50'}`}>
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: ps.color }}>{ps.short}</span>
                          <span className="text-sm font-medium text-slate-700">{ps.label}</span>
                        </div>
                        {!editingLinks && (
                          hasLink ? (
                            <a href={metrics.url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                              data-testid={`link-open-${pk}`}
                              onClick={e => e.stopPropagation()}>
                              <ExternalLink size={11} /> Open
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No link yet</span>
                          )
                        )}
                      </div>

                      {/* Editable fields */}
                      {editingLinks && (
                        <div className="px-3 pb-3 pt-1 space-y-2 bg-white">
                          <div>
                            <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5 block">URL</label>
                            <input type="url" value={metrics.url || ''} placeholder={`https://${pk}.com/...`}
                              onChange={e => updateLinkField(pk, 'url', e.target.value)}
                              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                              data-testid={`link-url-${pk}`} />
                          </div>
                          <div className="grid grid-cols-5 gap-2">
                            {[
                              { key: 'views', label: 'Views', icon: Eye },
                              { key: 'likes', label: 'Likes', icon: Heart },
                              { key: 'comments', label: 'Comments', icon: MessageCircle },
                              { key: 'shares', label: 'Shares', icon: Share2 },
                              { key: 'subscribers_added', label: 'New Subs', icon: Users },
                            ].map(({ key, label, icon: MIcon }) => (
                              <div key={key}>
                                <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5 flex items-center gap-1"><MIcon size={9} /> {label}</label>
                                <input type="number" min="0" value={metrics[key] || ''}
                                  onChange={e => updateLinkField(pk, key, e.target.value)}
                                  placeholder="0"
                                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-center"
                                  data-testid={`link-${key}-${pk}`} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Read-only analytics row */}
                      {!editingLinks && hasLink && (
                        <div className="grid grid-cols-5 gap-px bg-slate-100 border-t border-slate-100">
                          {[
                            { v: metrics.views, label: 'Views' },
                            { v: metrics.likes, label: 'Likes' },
                            { v: metrics.comments, label: 'Comments' },
                            { v: metrics.shares, label: 'Shares' },
                            { v: metrics.subscribers_added, label: 'New Subs' },
                          ].map(({ v, label }) => (
                            <div key={label} className="bg-white px-2 py-2 text-center">
                              <div className="text-sm font-semibold text-slate-800">{(v || 0).toLocaleString()}</div>
                              <div className="text-[9px] text-slate-400 uppercase tracking-wider">{label}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Comments */}
            <CommentThread entityType="post" entityId={postId} accentColor="blue" />
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
