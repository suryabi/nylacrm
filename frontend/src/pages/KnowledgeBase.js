import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Card } from '../components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  BookOpen, Upload, FileText, Globe, Trash2, Plus, Loader2, FileType, Calendar, User,
  AlertCircle, Sparkles,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const ADMIN_ROLES = ['CEO', 'System Admin', 'Admin'];
const SUPPORTED_EXTS = '.pdf,.docx,.pptx,.xlsx,.xls,.csv,.txt,.md';

const SOURCE_BADGE = {
  file: { label: 'File', icon: FileType, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  text: { label: 'Note', icon: FileText, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  url:  { label: 'URL',  icon: Globe,    color: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function fmtSize(chars) {
  if (!chars) return '0';
  if (chars < 1000) return `${chars} chars`;
  return `${Math.round(chars / 1000)}k chars`;
}

export default function KnowledgeBase() {
  const { user } = useAuth();
  const isAdmin = user && ADMIN_ROLES.includes(user.role);

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Add-text state
  const [textTitle, setTextTitle] = useState('');
  const [textBody, setTextBody] = useState('');
  const [textOpen, setTextOpen] = useState(false);

  // Add-URL state
  const [urlValue, setUrlValue] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [urlOpen, setUrlOpen] = useState(false);

  const fileInputRef = useRef(null);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/kb/documents`, { withCredentials: true });
      setDocs(res.data?.documents || []);
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Could not load knowledge base';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocs(); }, []);

  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API}/kb/documents/upload`, fd, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setDocs(prev => [res.data, ...prev]);
      toast.success(`"${res.data.title}" added to knowledge base`);
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddText = async () => {
    if (!textTitle.trim() || !textBody.trim()) {
      toast.error('Title and content are required');
      return;
    }
    setUploading(true);
    try {
      const res = await axios.post(`${API}/kb/documents/text`, {
        title: textTitle, content: textBody,
      }, { withCredentials: true });
      setDocs(prev => [res.data, ...prev]);
      toast.success('Note added');
      setTextTitle(''); setTextBody(''); setTextOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not save note');
    } finally {
      setUploading(false);
    }
  };

  const handleAddUrl = async () => {
    if (!urlValue.trim()) {
      toast.error('URL is required');
      return;
    }
    setUploading(true);
    try {
      const res = await axios.post(`${API}/kb/documents/url`, {
        url: urlValue, title: urlTitle || undefined,
      }, { withCredentials: true });
      setDocs(prev => [res.data, ...prev]);
      toast.success('URL indexed');
      setUrlValue(''); setUrlTitle(''); setUrlOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not index URL');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/kb/documents/${id}`, { withCredentials: true });
      setDocs(prev => prev.filter(d => d.id !== id));
      toast.success('Deleted');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not delete');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl" data-testid="knowledge-base-page">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-violet-50 via-white to-pink-50 p-5 sm:p-6">
        <div className="absolute -top-16 -right-12 w-72 h-72 rounded-full bg-gradient-to-br from-violet-200/40 to-pink-200/30 blur-3xl pointer-events-none" />
        <div className="relative flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 shadow-lg shadow-violet-300/40 flex-shrink-0">
            <BookOpen className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 leading-tight">
              Knowledge Base
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 font-medium max-w-2xl">
              {isAdmin
                ? 'Upload product docs, sales playbooks, FAQs and pricing here. Sales reps can ask Nyla questions and get instant answers grounded in this content.'
                : 'View the documents your team has access to. Use the floating Ask Nyla button to ask questions.'}
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-violet-700">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Powered by GPT — answers cite the source document.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Admin-only upload bar */}
      {isAdmin && (
        <Card className="p-4 sm:p-5 border-slate-200">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_EXTS}
              onChange={(e) => handleFileUpload(e.target.files?.[0])}
              className="hidden"
              data-testid="kb-file-input"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-violet-600 hover:bg-violet-700 text-white"
              data-testid="kb-upload-file-btn"
            >
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload File
            </Button>

            <Dialog open={textOpen} onOpenChange={setTextOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="kb-add-text-btn">
                  <FileText className="h-4 w-4 mr-2" /> Add Note / FAQ
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add a note or FAQ</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Title</label>
                    <Input value={textTitle} onChange={(e) => setTextTitle(e.target.value)} placeholder="e.g. Pricing FAQ" data-testid="kb-text-title" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Content</label>
                    <Textarea value={textBody} onChange={(e) => setTextBody(e.target.value)} rows={10} placeholder="Paste FAQ content, sales playbook, or any text..." data-testid="kb-text-body" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setTextOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddText} disabled={uploading} className="bg-violet-600 hover:bg-violet-700" data-testid="kb-text-save">
                    {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={urlOpen} onOpenChange={setUrlOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="kb-add-url-btn">
                  <Globe className="h-4 w-4 mr-2" /> Add URL
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Index a web page</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">URL *</label>
                    <Input value={urlValue} onChange={(e) => setUrlValue(e.target.value)} placeholder="https://nylaairwater.com/products" data-testid="kb-url-value" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Title (optional)</label>
                    <Input value={urlTitle} onChange={(e) => setUrlTitle(e.target.value)} placeholder="Product page" data-testid="kb-url-title" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setUrlOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddUrl} disabled={uploading} className="bg-violet-600 hover:bg-violet-700" data-testid="kb-url-save">
                    {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Index
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <span className="text-xs text-slate-500 ml-auto">Supports {SUPPORTED_EXTS.replace(/\./g, ' ').trim()}</span>
          </div>
        </Card>
      )}

      {/* Documents list */}
      <Card className="border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-900">Documents <span className="text-slate-500 font-medium">({docs.length})</span></h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-12 px-4">
            <BookOpen className="h-10 w-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500 font-medium">No documents yet</p>
            <p className="text-xs text-slate-400 mt-1">
              {isAdmin ? 'Upload files, add notes, or index URLs to give Nyla content to answer from.' : 'Ask your admin to upload documents.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {docs.map(d => {
              const badge = SOURCE_BADGE[d.source_type] || SOURCE_BADGE.text;
              const Icon = badge.icon;
              return (
                <div key={d.id} className="px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3" data-testid={`kb-doc-${d.id}`}>
                  <div className={`p-2 rounded-lg border ${badge.color} flex-shrink-0`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-900 truncate">{d.title}</h3>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmtDate(d.created_at)}</span>
                      {d.uploaded_by_name && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {d.uploaded_by_name}</span>}
                      <span>{fmtSize(d.content_length)}</span>
                      {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate max-w-xs">{d.url}</a>}
                    </div>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(d.id, d.title)}
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      data-testid={`kb-doc-delete-${d.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {!isAdmin && (
        <div className="flex items-start gap-2 text-xs text-slate-500 px-1">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>Only CEO and System Admin can upload or delete documents. Use the floating <strong>Ask Nyla</strong> button (bottom-right) to ask questions.</span>
        </div>
      )}
    </div>
  );
}
