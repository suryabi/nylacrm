/* Public (unauthenticated) page shown to the client via a share link.
 * They can review design options, pick one, approve, or request changes.
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Sparkles, CheckCircle2, ArrowRight, Loader2, Paperclip } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function PublicMarketingRequest() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [showReview, setShowReview] = useState(null); // {mode: 'approve' | 'changes' | 'select', optionId?}
  const [comment, setComment] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      // Public endpoint does NOT need auth headers — use plain fetch to avoid axios
      // defaults attaching any cached token
      const res = await fetch(`${API}/public/marketing-requests/${token}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('not_found');
      setData(await res.json());
    } catch {
      setData({ __error: 'This share link is invalid or has expired.' });
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [token]);

  const callPublic = async (path, body) => {
    const res = await fetch(`${API}/public/marketing-requests/${token}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed');
    }
    return res.json();
  };

  const approve = async () => {
    setActing(true);
    try {
      await callPublic('/approve', { comment });
      toast.success('Approved. Marketing has been notified.');
      setShowReview(null); setComment('');
      refresh();
    } catch (e) { toast.error(e.message); }
    finally { setActing(false); }
  };

  const requestChanges = async () => {
    if (!comment.trim()) { toast.error('Please share what needs to change.'); return; }
    setActing(true);
    try {
      await callPublic('/request-changes', { comment });
      toast.success('Feedback sent.');
      setShowReview(null); setComment('');
      refresh();
    } catch (e) { toast.error(e.message); }
    finally { setActing(false); }
  };

  const selectOption = async () => {
    setActing(true);
    try {
      await callPublic('/select-option', { option_id: showReview.optionId, comment });
      toast.success('Selection recorded. Thank you!');
      setShowReview(null); setComment('');
      refresh();
    } catch (e) { toast.error(e.message); }
    finally { setActing(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (data?.__error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md text-center p-8">
          <div className="mb-3 text-4xl">🔗</div>
          <h1 className="text-xl font-bold text-slate-800 mb-1">Link Unavailable</h1>
          <p className="text-slate-600">{data.__error}</p>
        </div>
      </div>
    );
  }

  const canAct = data.status !== 'completed' && data.status !== 'approved';

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-center gap-2 mb-6 text-indigo-600">
          <Sparkles className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em]">Design Preview</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{data.title}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-2 mb-8">
          {data.request_type_name && <Badge variant="outline" className="bg-white">{data.request_type_name}</Badge>}
          <Badge variant="outline" className="bg-white">Priority: {data.priority}</Badge>
          <Badge variant="outline" className="bg-white">Status: {data.status.replace(/_/g, ' ')}</Badge>
        </div>

        {data.description && (
          <div className="mb-8 text-sm text-slate-700 whitespace-pre-wrap bg-white p-4 rounded-xl border border-slate-200">
            {data.description}
          </div>
        )}

        <h2 className="text-sm font-semibold text-slate-700 mb-3">Proposed Designs</h2>
        {(data.design_options || []).length === 0 ? (
          <p className="text-slate-500 italic">Marketing hasn't uploaded any options yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.design_options.map((o) => (
              <div key={o.id} className={`rounded-2xl border-2 bg-white p-4 transition-all ${o.selected ? 'border-emerald-400 shadow-lg' : 'border-slate-200'}`} data-testid={`public-option-${o.id}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs bg-indigo-50 text-indigo-700 border-indigo-200">v{o.version}</Badge>
                    <h3 className="font-semibold text-slate-800">{o.label}</h3>
                  </div>
                  {o.selected && <Badge className="bg-emerald-600 text-white text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Selected</Badge>}
                </div>
                {o.notes && <p className="text-xs text-slate-600 whitespace-pre-wrap mb-3">{o.notes}</p>}
                {(o.image_urls || []).length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {o.image_urls.map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-slate-200 aspect-square hover:ring-2 hover:ring-indigo-300">
                        <img src={u} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      </a>
                    ))}
                  </div>
                )}
                {(o.files || []).length > 0 && (
                  <div className="flex gap-1 flex-wrap mb-3">
                    {o.files.map((f) => (
                      <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-slate-700 bg-slate-50 rounded px-2 py-1 hover:bg-slate-100">
                        <Paperclip className="h-3 w-3" />{f.name}
                      </a>
                    ))}
                  </div>
                )}
                {canAct && !o.selected && (
                  <Button onClick={() => { setShowReview({ mode: 'select', optionId: o.id }); setComment(''); }} className="w-full bg-emerald-600 hover:bg-emerald-700" data-testid={`public-pick-${o.id}`}>
                    Pick this design
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {canAct && (data.design_options || []).length > 0 && (
          <div className="mt-8 flex flex-wrap gap-3 justify-center" data-testid="public-action-row">
            <Button onClick={() => { setShowReview({ mode: 'approve' }); setComment(''); }} className="bg-indigo-600 hover:bg-indigo-700">
              <CheckCircle2 className="h-4 w-4 mr-2" />Approve All
            </Button>
            <Button onClick={() => { setShowReview({ mode: 'changes' }); setComment(''); }} variant="outline">
              <ArrowRight className="h-4 w-4 mr-2" />Request Changes
            </Button>
          </div>
        )}

        {!canAct && (
          <div className="mt-8 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
            <p className="text-emerald-800 font-semibold">This request has already been {data.status.replace(/_/g, ' ')}.</p>
            <p className="text-xs text-emerald-700 mt-1">Thank you for your feedback!</p>
          </div>
        )}
      </div>

      <Dialog open={!!showReview} onOpenChange={(o) => { if (!o) { setShowReview(null); setComment(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showReview?.mode === 'approve' ? 'Approve designs' : showReview?.mode === 'changes' ? 'Request changes' : 'Confirm selection'}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            rows={4}
            placeholder={showReview?.mode === 'changes' ? 'Tell us what to change…' : 'Add a note (optional)…'}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            data-testid="public-comment-input"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowReview(null); setComment(''); }}>Cancel</Button>
            <Button
              disabled={acting}
              onClick={showReview?.mode === 'approve' ? approve : showReview?.mode === 'changes' ? requestChanges : selectOption}
              className={showReview?.mode === 'changes' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}
              data-testid="public-confirm-btn"
            >
              {acting ? 'Sending…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
