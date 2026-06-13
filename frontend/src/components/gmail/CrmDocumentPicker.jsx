import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2, Search, FileText, Check, Paperclip } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';
import { humanSize } from './gmailUtils';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

/**
 * Modal picker to select documents from the CRM "Files & Documents" store,
 * filterable by category / subcategory (mirrors the Files & Documents page),
 * to attach to an outgoing email.
 */
export default function CrmDocumentPicker({ open, onOpenChange, onSelect, alreadySelectedIds = [] }) {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [categoryId, setCategoryId] = useState('all');
  const [subcategoryId, setSubcategoryId] = useState('all');
  const [search, setSearch] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState({});

  useEffect(() => {
    if (!open) return;
    setSelected({});
    setSearch('');
    setCategoryId('all');
    setSubcategoryId('all');
    axios.get(`${API_URL}/document-categories`, { headers: authHeaders() })
      .then((r) => setCategories(r.data.categories || []))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (categoryId === 'all') { setSubcategories([]); setSubcategoryId('all'); return; }
    axios.get(`${API_URL}/document-subcategories`, { headers: authHeaders(), params: { category_id: categoryId } })
      .then((r) => setSubcategories(r.data.subcategories || []))
      .catch(() => {});
    setSubcategoryId('all');
  }, [categoryId]);

  const loadDocuments = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const params = {};
      if (categoryId !== 'all') params.category_id = categoryId;
      if (subcategoryId !== 'all') params.subcategory_id = subcategoryId;
      const r = await axios.get(`${API_URL}/documents`, { headers: authHeaders(), params });
      setDocuments(r.data.documents || []);
    } catch {
      toast.error('Could not load documents');
    } finally {
      setLoading(false);
    }
  }, [open, categoryId, subcategoryId]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const filtered = documents.filter((d) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (d.name || '').toLowerCase().includes(q) || (d.file_name || '').toLowerCase().includes(q);
  });

  const toggle = (doc) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[doc.id]) delete next[doc.id]; else next[doc.id] = doc;
      return next;
    });
  };

  const confirm = () => {
    const docs = Object.values(selected).map((d) => ({
      id: d.id, name: d.name, file_name: d.file_name, file_size: d.file_size, content_type: d.content_type,
    }));
    onSelect(docs);
    onOpenChange(false);
  };

  const selectedCount = Object.keys(selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="crm-document-picker">
        <DialogHeader><DialogTitle>Attach from Files &amp; Documents</DialogTitle></DialogHeader>

        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="sm:w-44" data-testid="doc-picker-category"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={subcategoryId} onValueChange={setSubcategoryId} disabled={categoryId === 'all'}>
            <SelectTrigger className="sm:w-44" data-testid="doc-picker-subcategory"><SelectValue placeholder="Subcategory" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subcategories</SelectItem>
              {subcategories.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents" className="pl-8" data-testid="doc-picker-search" />
          </div>
        </div>

        <div className="mt-3 border rounded-lg max-h-[320px] overflow-y-auto divide-y divide-slate-100">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">No documents found</div>
          ) : filtered.map((d) => {
            const isSel = !!selected[d.id];
            const alreadyAttached = alreadySelectedIds.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => toggle(d)}
                disabled={alreadyAttached}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 ${isSel ? 'bg-rose-50/60' : ''} ${alreadyAttached ? 'opacity-50 cursor-not-allowed' : ''}`}
                data-testid={`doc-picker-item-${d.id}`}
              >
                <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${isSel ? 'bg-rose-600 border-rose-600' : 'border-slate-300'}`}>
                  {isSel && <Check className="h-3 w-3 text-white" />}
                </div>
                <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800">{d.name}</p>
                  <p className="truncate text-[11px] text-slate-400">{d.file_name} · {humanSize(d.file_size)}{alreadyAttached ? ' · attached' : ''}</p>
                </div>
              </button>
            );
          })}
        </div>

        <DialogFooter className="sm:justify-between">
          <span className="text-xs text-muted-foreground self-center">{selectedCount} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="bg-rose-600 hover:bg-rose-700 text-white" onClick={confirm} disabled={selectedCount === 0} data-testid="doc-picker-confirm">
              <Paperclip className="h-4 w-4 mr-1.5" /> Attach {selectedCount > 0 ? `(${selectedCount})` : ''}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
