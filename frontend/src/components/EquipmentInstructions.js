import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { toast } from 'sonner';
import RichTextField from './RichTextField';
import { BookOpen, Upload, Download, Trash2, Loader2, FileText, Image as ImageIcon } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export default function EquipmentInstructions({ equipment, onClose, onSaved }) {
  const [maint, setMaint] = useState('');
  const [repl, setRepl] = useState('');
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (equipment) {
      setMaint(equipment.maintenance_instructions || '');
      setRepl(equipment.replacement_instructions || '');
      setFiles((equipment.attachments || []).filter((f) => f.category === 'instruction'));
    }
  }, [equipment]);

  if (!equipment) return null;
  const base = `${API_URL}/api/production/equipment/${equipment.id}`;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${base}/instructions`, {
        method: 'PUT', headers: { ...HEAD(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ maintenance_instructions: maint, replacement_instructions: repl }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Save failed');
      toast.success('Instructions saved');
      onSaved?.();
      onClose();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const upload = async (fileList) => {
    setUploading(true);
    try {
      for (const f of Array.from(fileList)) {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('category', 'instruction');
        const res = await fetch(`${base}/files`, { method: 'POST', headers: HEAD(), body: fd });
        const meta = await res.json();
        if (!res.ok) throw new Error(meta.detail || 'Upload failed');
        setFiles((p) => [...p, meta]);
      }
      toast.success('Uploaded');
      onSaved?.();
    } catch (e) { toast.error(e.message); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const download = async (f) => {
    try {
      const res = await fetch(`${base}/files/${f.id}`, { headers: HEAD() });
      if (!res.ok) throw new Error('Download failed');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = f.filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e.message); }
  };

  const remove = async (f) => {
    try {
      const res = await fetch(`${base}/files/${f.id}`, { method: 'DELETE', headers: HEAD() });
      if (!res.ok) throw new Error('Delete failed');
      setFiles((p) => p.filter((x) => x.id !== f.id));
      onSaved?.();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="eq-instructions-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-emerald-600" /> Maintenance & Replacement Instructions — {equipment.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold mb-1.5">Maintenance instructions</p>
            <RichTextField value={maint} onChange={setMaint} placeholder="Step-by-step maintenance procedure, safety notes, tools required…" testId="eq-instr-maint" minHeight={140} />
          </div>
          <div>
            <p className="text-sm font-semibold mb-1.5">Replacement instructions</p>
            <RichTextField value={repl} onChange={setRepl} placeholder="How to replace this equipment/part, spares needed, shutdown steps…" testId="eq-instr-repl" minHeight={140} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">Reference documents & pictures</p>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="eq-instr-upload-btn">
                {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />} Upload
              </Button>
              <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => upload(e.target.files)} data-testid="eq-instr-file-input" />
            </div>
            {files.length === 0 ? (
              <p className="text-xs text-muted-foreground border border-dashed rounded-lg p-4 text-center">No documents yet — upload manuals, SOP pictures or diagrams for the team.</p>
            ) : (
              <div className="space-y-1.5">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" data-testid={`eq-instr-file-${f.id}`}>
                    {(f.content_type || '').startsWith('image/') ? <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" /> : <FileText className="h-4 w-4 text-slate-400 shrink-0" />}
                    <span className="truncate flex-1" title={f.original_filename || f.filename}>{f.filename}</span>
                    <span className="text-[11px] text-muted-foreground">{f.uploaded_by || ''}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => download(f)} data-testid={`eq-instr-dl-${f.id}`}><Download className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500 hover:text-rose-600" onClick={() => remove(f)} data-testid={`eq-instr-del-${f.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {equipment.instructions_updated_by && (
            <p className="text-[11px] text-muted-foreground">Last updated by {equipment.instructions_updated_by}{equipment.instructions_updated_at ? ` on ${equipment.instructions_updated_at.slice(0, 10)}` : ''}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="eq-instr-save">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Save Instructions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
