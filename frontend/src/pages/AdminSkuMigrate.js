import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Alert, AlertDescription } from '../components/ui/alert';
import { AlertTriangle, ArrowRight, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import AppBreadcrumb from '../components/AppBreadcrumb';

export default function AdminSkuMigrate() {
  const [skus, setSkus] = useState([]);
  const [fromSku, setFromSku] = useState('');
  const [toSku, setToSku] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem('token');
        const { data } = await axios.get(
          `${process.env.REACT_APP_BACKEND_URL}/api/master-skus`,
          { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
        );
        const list = (data?.skus || data?.data || data || []).filter((s) => s.is_active !== false);
        list.sort((a, b) => (a.sku || a.name || '').localeCompare(b.sku || b.name || ''));
        setSkus(list);
      } catch {
        toast.error('Failed to load SKU list');
      }
    };
    load();
  }, []);

  const callMigrate = async (dryRun) => {
    const token = localStorage.getItem('token');
    const { data } = await axios.post(
      `${process.env.REACT_APP_BACKEND_URL}/api/admin/migrate-sku`,
      { from_sku_id: fromSku, to_sku_id: toSku, dry_run: dryRun },
      { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
    );
    return data;
  };

  const handlePreview = async () => {
    if (!fromSku || !toSku) return toast.error('Pick both SKUs');
    if (fromSku === toSku) return toast.error('Pick two different SKUs');
    try {
      setLoading(true);
      const data = await callMigrate(true);
      setPreview(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview) return;
    if (!window.confirm(
      `This will update ${preview.total_affected} reference(s) in the database and cannot be undone. Continue?`
    )) return;
    try {
      setApplying(true);
      const data = await callMigrate(false);
      toast.success(data.message || 'Migration complete');
      setPreview(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Migration failed');
    } finally {
      setApplying(false);
    }
  };

  const fromName = skus.find((s) => s.id === fromSku)?.sku || skus.find((s) => s.id === fromSku)?.name;
  const toName = skus.find((s) => s.id === toSku)?.sku || skus.find((s) => s.id === toSku)?.name;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6" data-testid="admin-sku-migrate-page">
      <AppBreadcrumb />

      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-rose-500/10">
          <ShieldAlert className="h-6 w-6 text-rose-600 dark:text-rose-400" />
        </div>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">
            Replace SKU (Admin)
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Migrates every reference of a wrong SKU to a correct one across accounts, leads, cost cards, COGS, production, shipments and invoices.
          </p>
        </div>
      </div>

      <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Always run <strong>Preview</strong> first. The action is <strong>not reversible</strong> — take a DB snapshot before applying on production.
        </AlertDescription>
      </Alert>

      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Wrong SKU (from)
            </label>
            <Select value={fromSku} onValueChange={(v) => { setFromSku(v); setPreview(null); }}>
              <SelectTrigger data-testid="from-sku-select">
                <SelectValue placeholder="Select the SKU to replace" />
              </SelectTrigger>
              <SelectContent>
                {skus.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.sku || s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-center pb-2">
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Correct SKU (to)
            </label>
            <Select value={toSku} onValueChange={(v) => { setToSku(v); setPreview(null); }}>
              <SelectTrigger data-testid="to-sku-select">
                <SelectValue placeholder="Select the correct SKU" />
              </SelectTrigger>
              <SelectContent>
                {skus.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.sku || s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={loading || !fromSku || !toSku || fromSku === toSku}
            data-testid="preview-button"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Preview impact
          </Button>
          <Button
            variant="destructive"
            onClick={handleApply}
            disabled={applying || !preview || !preview.dry_run || preview.total_affected === 0}
            data-testid="apply-button"
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Apply migration
          </Button>
        </div>
      </Card>

      {preview && (
        <Card className="p-5 space-y-3" data-testid="preview-result">
          <div className="flex items-center gap-2">
            {preview.dry_run ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-300 text-xs font-semibold">
                DRY RUN
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                <CheckCircle2 className="h-3 w-3" /> APPLIED
              </span>
            )}
            <p className="text-sm text-muted-foreground">{preview.message}</p>
          </div>

          <div className="text-sm">
            <span className="font-semibold text-slate-800 dark:text-white">{preview.from.name}</span>
            <ArrowRight className="inline h-4 w-4 mx-2 text-muted-foreground" />
            <span className="font-semibold text-slate-800 dark:text-white">{preview.to.name}</span>
          </div>

          <div className="border-t pt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(preview.counts).map(([k, v]) => (
              <div
                key={k}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                  v > 0 ? 'border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/50 dark:bg-indigo-950/20' : 'border-slate-200 dark:border-slate-700/50'
                }`}
              >
                <span className="text-xs text-muted-foreground font-mono truncate">{k}</span>
                <span className={`text-sm font-semibold tabular-nums ${v > 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-muted-foreground'}`}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
