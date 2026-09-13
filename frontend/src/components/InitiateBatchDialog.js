import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Play, Tag } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const H = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

// Wizard entry point: pick the SKU → server creates the draft run → caller navigates to the wizard.
export const InitiateBatchDialog = ({ open, onOpenChange, skus, onInitiated }) => {
  const [skuId, setSkuId] = useState('');
  const [childId, setChildId] = useState('');
  const [children, setChildren] = useState([]);
  const [busy, setBusy] = useState(false);
  const sku = skus.find((s) => s.id === skuId);

  useEffect(() => {
    setChildId(''); setChildren([]);
    if (skuId && sku?.allows_child_skus) axios.get(`${API_URL}/api/child-skus?parent_sku_id=${skuId}`, H()).then((r) => setChildren(r.data.child_skus || [])).catch(() => {});
  }, [skuId]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/production/run/initiate`, { sku_id: skuId, target_child_sku_id: childId || null }, H());
      toast.success(`Run ${data.batch_code} initiated — complete the pre-production checklist`);
      onOpenChange(false); setSkuId('');
      onInitiated(data.batch_id);
    } catch (e) { toast.error(e.response?.data?.detail || 'Could not initiate the production run'); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="initiate-batch-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Play className="h-5 w-5 text-[#002FA7]" /> Initiate Production Batch</DialogTitle>
          <DialogDescription>Select the SKU to be produced. You'll be taken straight to its pre-production checklist.</DialogDescription>
        </DialogHeader>
        <label className="text-xs font-medium text-slate-600 block">SKU to produce *
          <select value={skuId} onChange={(e) => setSkuId(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white" data-testid="initiate-sku-select">
            <option value="">Select SKU…</option>
            {skus.map((s) => <option key={s.id} value={s.id}>{s.sku_name}{s.category ? ` (${s.category})` : ''}</option>)}
          </select>
        </label>
        {children.length > 0 && (
          <label className="text-xs font-medium text-slate-600 block">Branding target (optional)
            <select value={childId} onChange={(e) => setChildId(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white" data-testid="initiate-child-select">
              <option value="">Generic / decide later</option>
              {children.map((c) => <option key={c.id} value={c.id}>{c.child_sku_name}{c.customer_account_name ? ` · ${c.customer_account_name}` : ''}</option>)}
            </select>
          </label>
        )}
        {sku && <p className="text-[11px] text-slate-500 flex items-center gap-1"><Tag size={11} /> Batch code auto-generated · date today · packaging from SKU default — editable when the batch is created.</p>}
        <Button className="w-full bg-[#002FA7] hover:bg-blue-800 text-white font-bold h-11" disabled={!skuId || busy} onClick={go} data-testid="initiate-batch-submit"><Play size={16} className="mr-2" /> Open Pre-Production Checklist</Button>
      </DialogContent>
    </Dialog>
  );
};

export default InitiateBatchDialog;
