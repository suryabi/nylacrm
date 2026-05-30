import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { toast } from 'sonner';
import { Tags, Loader2, RefreshCw, Trash2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { skuAliasAPI } from '../utils/api';

const skuLabel = (s) => `${s.sku_name}${s.external_sku_id ? ` (${s.external_sku_id})` : ''}`;

export const SkuAliasTool = () => {
  const [loading, setLoading] = useState(true);
  const [unmapped, setUnmapped] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [skus, setSkus] = useState([]);
  const [picks, setPicks] = useState({});      // alias_value -> target_sku_id
  const [savingKey, setSavingKey] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, a] = await Promise.all([skuAliasAPI.unmapped(), skuAliasAPI.list()]);
      setUnmapped(u.data?.unmapped || []);
      setSkus(u.data?.skus || a.data?.skus || []);
      setAliases(a.data?.aliases || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load SKU aliases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const mapAlias = async (item) => {
    const key = `${item.alias_type}::${item.alias_value}`;
    const target = picks[key];
    if (!target) { toast.error('Pick a current SKU first'); return; }
    setSavingKey(key);
    try {
      const res = await skuAliasAPI.upsert({
        alias_value: item.alias_value,
        alias_type: item.alias_type,
        target_sku_id: target,
      });
      toast.success(`Mapped "${item.alias_value}" → ${res.data.target_sku_name}`);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save alias');
    } finally {
      setSavingKey(null);
    }
  };

  const removeAlias = async (id) => {
    try {
      await skuAliasAPI.remove(id);
      toast.success('Alias removed');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to remove alias');
    }
  };

  return (
    <Card data-testid="sku-alias-tool">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Tags className="h-5 w-5" />
          SKU Aliases (old → current)
        </CardTitle>
        <CardDescription>
          Historical invoices may reference retired SKU codes or old names. Map each leftover
          identifier to a current SKU so Revenue Analytics, SKU Performance &amp; Invoices all show
          the current SKU. This never edits your invoices — it&apos;s applied when reports are read.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="sku-alias-refresh">
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Re-scan invoices
        </Button>

        {/* Unmapped identifiers */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            Unmapped SKUs found in invoices
            <Badge variant={unmapped.length ? 'destructive' : 'secondary'}>{unmapped.length}</Badge>
          </h4>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : unmapped.length === 0 ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2" data-testid="sku-alias-all-mapped">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> All invoice SKUs resolve to a current SKU. Nothing to map.
            </p>
          ) : (
            <div className="space-y-2" data-testid="sku-alias-unmapped-list">
              {unmapped.map((u) => {
                const key = `${u.alias_type}::${u.alias_value}`;
                return (
                  <div key={key} className="flex flex-wrap items-center gap-2 rounded-lg border p-3" data-testid={`unmapped-${u.alias_value}`}>
                    <div className="min-w-[180px] flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{u.alias_value}</span>
                        <Badge variant="outline" className="text-[10px]">{u.alias_type}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{u.count} line{u.count === 1 ? '' : 's'}</Badge>
                      </div>
                      {u.sample_invoices?.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">e.g. {u.sample_invoices.slice(0, 3).join(', ')}</p>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Select value={picks[key] || ''} onValueChange={(v) => setPicks((p) => ({ ...p, [key]: v }))}>
                      <SelectTrigger className="w-[260px]" data-testid={`map-select-${u.alias_value}`}>
                        <SelectValue placeholder="Map to current SKU…" />
                      </SelectTrigger>
                      <SelectContent>
                        {skus.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{skuLabel(s)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={() => mapAlias(u)} disabled={savingKey === key} data-testid={`map-btn-${u.alias_value}`}>
                      {savingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Map'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Existing aliases */}
        {aliases.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Active aliases <Badge variant="secondary">{aliases.length}</Badge></h4>
            <div className="space-y-1.5" data-testid="sku-alias-active-list">
              {aliases.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm" data-testid={`alias-${a.alias_value}`}>
                  <span className="font-medium">{a.alias_value}</span>
                  <Badge variant="outline" className="text-[10px]">{a.alias_type}</Badge>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-emerald-700">{a.target_sku_name}</span>
                  <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={() => removeAlias(a.id)} data-testid={`alias-delete-${a.alias_value}`}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SkuAliasTool;
