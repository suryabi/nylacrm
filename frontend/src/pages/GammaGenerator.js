import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Sparkles, ExternalLink, Download, Clock, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react';
import GammaComposer from '../components/gamma/GammaComposer';
import GammaTemplateManager from '../components/gamma/GammaTemplateManager';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const STATUS_BADGE = {
  completed: { cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  failed: { cls: 'bg-rose-100 text-rose-700', icon: AlertCircle },
  pending: { cls: 'bg-amber-100 text-amber-700', icon: Clock },
  processing: { cls: 'bg-blue-100 text-blue-700', icon: Loader2 },
  finalizing: { cls: 'bg-blue-100 text-blue-700', icon: Loader2 },
};

export default function GammaGenerator() {
  const [history, setHistory] = useState([]);

  const load = () => {
    axios.get(`${API}/gamma/generations?limit=15`, { headers: HEAD() })
      .then((r) => setHistory(r.data.generations || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800">Presentation Generator</h1>
            <p className="text-sm text-slate-500">Turn any outline into a polished presentation</p>
          </div>
        </div>
        <GammaTemplateManager />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Compose</CardTitle></CardHeader>
            <CardContent>
              <GammaComposer />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent decks</CardTitle>
              <Button variant="ghost" size="sm" onClick={load} data-testid="gamma-refresh-history">Refresh</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No decks generated yet.</p>
              ) : history.map((g) => {
                const sb = STATUS_BADGE[g.status] || STATUS_BADGE.processing;
                const Icon = sb.icon;
                return (
                  <div key={g.id} className="border rounded-lg p-3 space-y-2" data-testid={`gamma-history-${g.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800 line-clamp-2">{g.title}</p>
                      <Badge className={sb.cls}><Icon className={`h-3 w-3 mr-1 ${['processing', 'finalizing'].includes(g.status) ? 'animate-spin' : ''}`} />{g.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(g.created_at).toLocaleString()}{g.source_label ? ` · ${g.source_label}` : ''}</p>
                    {g.status === 'completed' && (
                      <div className="flex gap-2">
                        <a href={g.gamma_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Open</a>
                        {g.export_url && <a href={g.export_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1"><Download className="h-3 w-3" /> PDF</a>}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
