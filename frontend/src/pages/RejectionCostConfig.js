import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { AlertCircle, Save, Plus, Trash2, IndianRupee, Package } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const headers = () => ({
  Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('session_token') || ''}`,
});

export default function RejectionCostConfig() {
  const [bootstrap, setBootstrap] = useState({ skus: [], components: [], reasons: [] });
  const [selectedSkuId, setSelectedSkuId] = useState('');
  const [skuConfig, setSkuConfig] = useState({ sku: null, stages: [], mappings: [] });
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingSku, setLoadingSku] = useState(false);
  const [saving, setSaving] = useState({});
  const [filterStage, setFilterStage] = useState('');
  const [newRow, setNewRow] = useState({ stage_name: '', reason_id: '' });
  const [draft, setDraft] = useState({});

  // Initial load: SKUs + components + reasons
  useEffect(() => {
    (async () => {
      setLoadingBootstrap(true);
      try {
        const res = await axios.get(`${API_URL}/api/production/rejection-cost-config`, { headers: headers() });
        setBootstrap({
          skus: res.data.skus || [],
          components: res.data.components || [],
          reasons: res.data.reasons || [],
        });
      } catch (e) {
        toast.error(e.response?.data?.detail || 'Failed to load');
      } finally {
        setLoadingBootstrap(false);
      }
    })();
  }, []);

  // Load SKU-scoped data when SKU changes
  const loadSku = useCallback(async (skuId) => {
    if (!skuId) {
      setSkuConfig({ sku: null, stages: [], mappings: [] });
      setDraft({});
      return;
    }
    setLoadingSku(true);
    try {
      const res = await axios.get(
        `${API_URL}/api/production/rejection-cost-config?sku_id=${encodeURIComponent(skuId)}`,
        { headers: headers() }
      );
      setSkuConfig({
        sku: res.data.sku || null,
        stages: res.data.stages || [],
        mappings: res.data.mappings || [],
      });
      const seeded = {};
      (res.data.mappings || []).forEach((m) => {
        seeded[`${m.stage_name}|${m.reason_id}`] = new Set(m.impacted_component_keys || []);
      });
      setDraft(seeded);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load SKU mappings');
    } finally {
      setLoadingSku(false);
    }
  }, []);

  useEffect(() => { loadSku(selectedSkuId); }, [selectedSkuId, loadSku]);

  const mappingByKey = useMemo(() => {
    const m = {};
    (skuConfig.mappings || []).forEach((x) => { m[`${x.stage_name}|${x.reason_id}`] = x; });
    return m;
  }, [skuConfig.mappings]);

  const rows = useMemo(() => {
    const existing = (skuConfig.mappings || []).map((m) => ({
      key: `${m.stage_name}|${m.reason_id}`,
      stage_name: m.stage_name,
      reason_id: m.reason_id,
      reason_name: m.reason_name,
      mapping: m,
    }));
    return filterStage ? existing.filter((r) => r.stage_name === filterStage) : existing;
  }, [skuConfig.mappings, filterStage]);

  const toggleComponent = (rowKey, ckey) => {
    setDraft((prev) => {
      const next = { ...prev };
      const set = new Set(next[rowKey] || []);
      if (set.has(ckey)) set.delete(ckey); else set.add(ckey);
      next[rowKey] = set;
      return next;
    });
  };

  const isDirty = (rowKey) => {
    const m = mappingByKey[rowKey];
    const draftSet = draft[rowKey] || new Set();
    const savedSet = new Set(m?.impacted_component_keys || []);
    if (draftSet.size !== savedSet.size) return true;
    for (const k of draftSet) if (!savedSet.has(k)) return true;
    return false;
  };

  const saveRow = async (stage_name, reason_id) => {
    const rowKey = `${stage_name}|${reason_id}`;
    setSaving((s) => ({ ...s, [rowKey]: true }));
    try {
      await axios.post(`${API_URL}/api/production/rejection-cost-mappings`, {
        sku_id: selectedSkuId,
        stage_name,
        reason_id,
        impacted_component_keys: Array.from(draft[rowKey] || []),
      }, { headers: headers() });
      toast.success('Saved');
      loadSku(selectedSkuId);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving((s) => ({ ...s, [rowKey]: false }));
    }
  };

  const deleteRow = async (mapping_id) => {
    if (!window.confirm('Remove this rejection-cost mapping?')) return;
    try {
      await axios.delete(`${API_URL}/api/production/rejection-cost-mappings/${mapping_id}`, { headers: headers() });
      toast.success('Removed');
      loadSku(selectedSkuId);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Delete failed');
    }
  };

  const addNewRow = async () => {
    if (!selectedSkuId) {
      toast.error('Select a SKU first'); return;
    }
    if (!newRow.stage_name || !newRow.reason_id) {
      toast.error('Pick a stage and a reason'); return;
    }
    const rowKey = `${newRow.stage_name}|${newRow.reason_id}`;
    if (mappingByKey[rowKey]) {
      toast.error('A mapping already exists for this Stage × Reason'); return;
    }
    try {
      await axios.post(`${API_URL}/api/production/rejection-cost-mappings`, {
        sku_id: selectedSkuId,
        stage_name: newRow.stage_name,
        reason_id: newRow.reason_id,
        impacted_component_keys: [],
      }, { headers: headers() });
      setNewRow({ stage_name: '', reason_id: '' });
      loadSku(selectedSkuId);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    }
  };

  const skuValueLabel = bootstrap.skus.find((s) => s.id === selectedSkuId)?.sku_name;
  const skuCogs = skuConfig.sku?.cogs_components_values || {};
  const hasAnyPrice = Object.values(skuCogs).some((v) => Number(v) > 0);

  // Total cost / unit = sum of SKU's COGS prices for the components currently ticked
  const computeRowUnitCost = (rowKey) => {
    const set = draft[rowKey] || new Set();
    let total = 0;
    set.forEach((k) => { total += parseFloat(skuCogs[k]) || 0; });
    return total;
  };
  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="p-6 max-w-[1400px] mx-auto" data-testid="rejection-cost-config-page">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <IndianRupee className="h-6 w-6 text-rose-600" />
          Rejection Cost Configuration
        </h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
          Configure per SKU. For each <strong>(Stage × Rejection Reason)</strong>, select which COGS components are impacted.
          Cost = <span className="font-mono text-xs">qty × Σ(SKU's component price)</span> for the impacted components.
        </p>
      </div>

      {/* SKU Picker */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-500" />
            Select SKU
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedSkuId} onValueChange={setSelectedSkuId} disabled={loadingBootstrap}>
              <SelectTrigger className="w-80" data-testid="sku-picker">
                <SelectValue placeholder={loadingBootstrap ? 'Loading SKUs…' : 'Select a SKU to configure'} />
              </SelectTrigger>
              <SelectContent>
                {bootstrap.skus.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.sku_name}
                    {s.category ? <span className="text-slate-400 text-xs"> · {s.category}</span> : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSkuId && skuConfig.stages.length === 0 && !loadingSku && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                No QC route configured for this SKU yet — add a route in QC Routes first.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedSkuId ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Package className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <div className="text-sm text-slate-500">Select a SKU above to configure rejection cost mappings.</div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Add a new mapping (SKU-scoped) */}
          <Card className="mb-6 border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Add new mapping for <span className="text-rose-600">{skuValueLabel}</span></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3">
                <Select value={newRow.stage_name} onValueChange={(v) => setNewRow({ ...newRow, stage_name: v })} disabled={skuConfig.stages.length === 0}>
                  <SelectTrigger className="w-56" data-testid="new-mapping-stage-select">
                    <SelectValue placeholder={skuConfig.stages.length === 0 ? 'No stages — add QC route' : 'Select stage'} />
                  </SelectTrigger>
                  <SelectContent>
                    {skuConfig.stages.map((s) => (
                      <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={newRow.reason_id} onValueChange={(v) => setNewRow({ ...newRow, reason_id: v })}>
                  <SelectTrigger className="w-64" data-testid="new-mapping-reason-select">
                    <SelectValue placeholder="Select rejection reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {(bootstrap.reasons || []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={addNewRow} data-testid="add-mapping-btn">
                  <Plus className="h-4 w-4 mr-1.5" /> Add
                </Button>

                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-slate-500">Filter:</span>
                  <Select value={filterStage || '__all__'} onValueChange={(v) => setFilterStage(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="w-44 h-9" data-testid="filter-stage-select">
                      <SelectValue placeholder="All stages" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All stages</SelectItem>
                      {skuConfig.stages.map((s) => (
                        <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Matrix */}
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="text-base">Stage × Reason → Impacted Components</CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    "Cost / unit" = Σ of <strong>{skuValueLabel}</strong>'s component prices for the ticked items.
                    Total rejection cost for an event = <span className="font-mono">qty × Cost/unit</span>.
                  </p>
                </div>
                {!hasAnyPrice && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2 max-w-md">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      No COGS prices set for this SKU. Set them under <strong>SKU Management → Edit SKU → COGS Costs</strong> for cost numbers to appear here.
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingSku ? (
                <div className="p-10 text-center text-sm text-slate-500">Loading…</div>
              ) : rows.length === 0 ? (
                <div className="p-12 text-center">
                  <AlertCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                  <div className="text-sm text-slate-500">
                    No mappings yet for this SKU. Use the form above to add one.
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="rejection-cost-matrix">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-slate-700 sticky left-0 bg-slate-50 min-w-[160px]">Stage</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-700 min-w-[180px]">Rejection Reason</th>
                        {(bootstrap.components || []).map((c) => {
                          const price = parseFloat(skuCogs[c.key]) || 0;
                          return (
                            <th key={c.key} className="text-center px-3 py-3 font-medium text-slate-600 text-xs whitespace-nowrap">
                              <div>{c.label}</div>
                              <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                                {price > 0 ? fmt(price) : <span className="text-amber-500">— not set</span>}
                              </div>
                            </th>
                          );
                        })}
                        <th className="text-right px-3 py-3 font-semibold text-slate-700 text-xs whitespace-nowrap bg-rose-50/40">Cost / unit</th>
                        <th className="px-3 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((r) => {
                        const dirty = isDirty(r.key);
                        const isSaving = saving[r.key];
                        const draftSet = draft[r.key] || new Set();
                        const unitCost = computeRowUnitCost(r.key);
                        return (
                          <tr key={r.key} className="hover:bg-slate-50/60" data-testid={`mapping-row-${r.mapping.id}`}>
                            <td className="px-4 py-3 sticky left-0 bg-white">
                              <Badge variant="outline" className="font-mono text-[10px] bg-slate-50">{r.stage_name}</Badge>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-800">{r.reason_name}</td>
                            {(bootstrap.components || []).map((c) => (
                              <td key={c.key} className="text-center px-3 py-3">
                                <Checkbox
                                  checked={draftSet.has(c.key)}
                                  onCheckedChange={() => toggleComponent(r.key, c.key)}
                                  data-testid={`cell-${r.mapping.id}-${c.key}`}
                                />
                              </td>
                            ))}
                            <td className="px-3 py-3 text-right whitespace-nowrap bg-rose-50/40 font-semibold text-rose-700" data-testid={`row-cost-${r.mapping.id}`}>
                              {draftSet.size === 0 ? (
                                <span className="text-slate-400 font-normal italic text-xs">—</span>
                              ) : (
                                fmt(unitCost)
                              )}
                            </td>
                            <td className="px-3 py-3 text-right whitespace-nowrap">
                              <Button
                                size="sm"
                                disabled={!dirty || isSaving}
                                onClick={() => saveRow(r.stage_name, r.reason_id)}
                                className="mr-1.5"
                                data-testid={`save-${r.mapping.id}`}
                              >
                                <Save className="h-3.5 w-3.5 mr-1" /> {isSaving ? 'Saving' : dirty ? 'Save' : 'Saved'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-rose-600 border-rose-200"
                                onClick={() => deleteRow(r.mapping.id)}
                                data-testid={`delete-${r.mapping.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
