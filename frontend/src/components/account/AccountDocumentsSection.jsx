import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { FileText, Upload, Trash2, Download, RefreshCw, Loader2, FolderOpen, FileCheck } from 'lucide-react';
import { filesAPI } from '../../utils/api';
import { toast } from 'sonner';

const API_BASE = process.env.REACT_APP_BACKEND_URL + '/api';
const authHeaders = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const humanSize = (b) => {
  if (!b && b !== 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const openBase64 = (b64, contentType, fileName) => {
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: contentType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    toast.error('Could not open file');
  }
};

export const AccountDocumentsSection = ({ accountId, contract }) => {
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [busyId, setBusyId] = useState(null);
  const uploadRef = useRef(null);
  const reuploadRefs = useRef({});

  const fetchDocs = useCallback(async () => {
    try {
      const res = await filesAPI.getDocuments({ linked_entity_type: 'account', linked_entity_id: accountId });
      setDocuments(res.data.documents || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    (async () => {
      try {
        const c = await filesAPI.getCategories();
        setCategories(c.data.categories || []);
      } catch { /* ignore */ }
      fetchDocs();
    })();
  }, [accountId, fetchDocs]);

  const categoryName = (id) => categories.find((c) => c.id === id)?.name || 'Uncategorised';

  const handleUploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (!categoryId) {
      toast.error('Please select a category first');
      return;
    }
    setUploading(true);
    let ok = 0;
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', file.name);
      fd.append('category_id', categoryId);
      fd.append('linked_entity_type', 'account');
      fd.append('linked_entity_id', accountId);
      try {
        await filesAPI.uploadDocument(fd);
        ok += 1;
      } catch (e) {
        toast.error(`${file.name}: ${e.response?.data?.detail || 'upload failed'}`);
      }
    }
    if (ok) toast.success(`${ok} document${ok > 1 ? 's' : ''} uploaded`);
    setUploading(false);
    if (uploadRef.current) uploadRef.current.value = '';
    fetchDocs();
  };

  const handleDelete = async (id) => {
    setBusyId(id);
    try {
      await filesAPI.deleteDocument(id);
      toast.success('Document deleted');
      fetchDocs();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete');
    } finally {
      setBusyId(null);
    }
  };

  const handleReupload = async (id, file) => {
    if (!file) return;
    setBusyId(id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await filesAPI.reuploadDocument(id, fd);
      toast.success('Document replaced');
      fetchDocs();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to re-upload');
    } finally {
      setBusyId(null);
    }
  };

  const viewDoc = async (id) => {
    try {
      const res = await filesAPI.getDocument(id);
      const d = res.data.document;
      openBase64(d.file_data, d.content_type, d.file_name);
    } catch {
      toast.error('Could not open document');
    }
  };

  const viewContract = async () => {
    try {
      const res = await axios.get(`${API_BASE}/accounts/${accountId}/contract/download`, { headers: authHeaders() });
      const c = res.data.contract;
      openBase64(c.file_data, c.content_type, c.file_name);
    } catch {
      toast.error('Could not open contract');
    }
  };

  const showContract = contract && contract.status === 'approved';

  return (
    <Card className="overflow-hidden" data-testid="account-documents-section">
      <div className="p-4 bg-gradient-to-r from-slate-700 to-slate-900">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <FolderOpen className="h-5 w-5" /> Documents
        </h2>
        <p className="text-sm text-white/70 mt-1">Uploads here are saved to Files &amp; Documents and linked to this account</p>
      </div>

      <div className="p-6 space-y-5">
        {/* Upload row */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger data-testid="account-doc-category-select" className="h-10">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id} data-testid={`account-doc-category-${c.id}`}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <input
            ref={uploadRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp"
            onChange={(e) => handleUploadFiles(e.target.files)}
            className="hidden"
            data-testid="account-doc-upload-input"
          />
          <Button
            onClick={() => (categoryId ? uploadRef.current?.click() : toast.error('Please select a category first'))}
            disabled={uploading}
            className="bg-slate-800 hover:bg-slate-900 text-white h-10"
            data-testid="account-doc-upload-button"
          >
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload
          </Button>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">PDF, DOC/DOCX or images (max 5 MB each). You can select multiple files.</p>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-2" data-testid="account-documents-list">
            {showContract && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-indigo-200 bg-indigo-50/50" data-testid="account-doc-contract-row">
                <FileCheck className="h-5 w-5 text-indigo-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{contract.file_name}</p>
                  <p className="text-xs text-muted-foreground">Signed contract · v{contract.version}</p>
                </div>
                <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">Signed Contract</Badge>
                <Button variant="ghost" size="sm" onClick={viewContract} data-testid="account-doc-contract-view">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            )}

            {documents.length === 0 && !showContract ? (
              <div className="text-center py-6 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No documents yet</p>
              </div>
            ) : (
              documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50" data-testid={`account-doc-row-${doc.id}`}>
                  <FileText className="h-5 w-5 text-slate-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {humanSize(doc.file_size)} · {doc.uploaded_by_name}
                    </p>
                  </div>
                  <Badge variant="secondary" className="hidden sm:inline-flex">{categoryName(doc.category_id)}</Badge>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => viewDoc(doc.id)} title="View / download" data-testid={`account-doc-view-${doc.id}`}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <input
                      ref={(el) => { reuploadRefs.current[doc.id] = el; }}
                      type="file"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp"
                      onChange={(e) => handleReupload(doc.id, e.target.files?.[0])}
                      className="hidden"
                    />
                    <Button variant="ghost" size="sm" onClick={() => reuploadRefs.current[doc.id]?.click()} disabled={busyId === doc.id} title="Re-upload" data-testid={`account-doc-reupload-${doc.id}`}>
                      {busyId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(doc.id)} disabled={busyId === doc.id} title="Delete" className="text-red-500 hover:text-red-700" data-testid={`account-doc-delete-${doc.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default AccountDocumentsSection;
