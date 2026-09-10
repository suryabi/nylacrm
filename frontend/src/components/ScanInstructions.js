import React, { useState } from 'react';
import { Card, CardContent } from './ui/card';
import { BookOpen, Wrench, Repeat, FileText, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { scanAuthHeaders } from '../lib/staffSession';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const ScanInstructions = ({ equipmentId, maintenance, replacement, files = [] }) => {
  const [show, setShow] = useState(true);
  const [tab, setTab] = useState(maintenance ? 'maintenance' : 'replacement');
  if (!maintenance && !replacement && files.length === 0) return null;

  const openFile = async (f) => {
    try {
      const res = await fetch(`${API_URL}/api/production/equipment/${equipmentId}/files/${f.id}`, { headers: scanAuthHeaders() });
      if (!res.ok) throw new Error('Could not open file');
      const url = URL.createObjectURL(await res.blob());
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast.error(e.message); }
  };

  const html = tab === 'maintenance' ? maintenance : replacement;
  return (
    <Card className="border-emerald-200" data-testid="scan-instructions">
      <CardContent className="p-4">
        <button type="button" className="w-full flex items-center gap-2 text-left" onClick={() => setShow((v) => !v)} data-testid="scan-instructions-toggle">
          <BookOpen className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="font-semibold text-sm flex-1">How to do it — instructions</span>
          <span className="text-xs text-emerald-700 font-semibold">{show ? 'Hide' : 'Show'}</span>
        </button>
        {show && (
          <div className="mt-3 space-y-3">
            {(maintenance || replacement) && (
              <div className="flex gap-2">
                {maintenance && (
                  <button type="button" onClick={() => setTab('maintenance')} data-testid="scan-instr-tab-maintenance"
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${tab === 'maintenance' ? 'bg-emerald-600 text-white border-emerald-600' : 'text-slate-600 hover:bg-emerald-50'}`}>
                    <Wrench className="h-3.5 w-3.5" /> Maintenance
                  </button>
                )}
                {replacement && (
                  <button type="button" onClick={() => setTab('replacement')} data-testid="scan-instr-tab-replacement"
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${tab === 'replacement' ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-600 hover:bg-indigo-50'}`}>
                    <Repeat className="h-3.5 w-3.5" /> Replacement
                  </button>
                )}
              </div>
            )}
            {html && (
              <div className="prose prose-sm max-w-none text-sm [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                dangerouslySetInnerHTML={{ __html: html }} data-testid="scan-instructions-html" />
            )}
            {files.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reference documents</p>
                {files.map((f) => (
                  <button key={f.id} type="button" onClick={() => openFile(f)}
                    className="w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-left hover:bg-emerald-50"
                    data-testid={`scan-instr-file-${f.id}`}>
                    {(f.content_type || '').startsWith('image/') ? <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" /> : <FileText className="h-4 w-4 text-slate-400 shrink-0" />}
                    <span className="truncate">{f.filename}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ScanInstructions;
