import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { AlertCircle, Save, Plus, Trash2, IndianRupee } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const headers = () => ({
  Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('session_token') || ''}`,
});

export default function RejectionCostConfig() {
  const [config, setConfig] = useState({ components: [], stages: [], reasons: [], mappings: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [filterStage, setFilterStage] = useState('');
  const [newRow, setNewRow] = useState({ stage_name: '', reason_id: '' });
  // Local edit buffer keyed by `${stage_name}|${reason_id}` → Set(component_key)
  const [draft, setDraft] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/production/rejection-cost-config`, { headers: headers() });
      setConfig(res.data);
      // Seed draft from existing mappings
      const seeded = {};
      (res.data.mappings || []).forEach((m) => {
        seeded[`${m.stage_name}|${m.reason_id}`] = new Set(m.impacted_component_keys || []);
      });
      setDraft(seeded);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Index existing mappings: stage|reason → mapping object
  const mappingByKey = useMemo(() => {
    const m = {};
    (config.mappings || []).forEach((x) => { m[`${x.stage_name}|${x.reason_id}`] = x; });
    return m;
  }, [config.mappings]);

  // Visible rows: existing mappings + any new draft rows
  const rows = useMemo(() => {
    const existing = (config.mappings || []).map((m) => ({
      key: `${m.stage_name}|${m.reason_id}`,
      stage_name: m.stage_name,
      reason_id: m.reason_id,
      reason_name: m.reason_name,
      mapping: m,
    }));
    return filterStage ? existing.filter((r) => r.stage_name === filterStage) : existing;
  }, [config.mappings, filterStage]);

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
        stage_name,
        reason_id,
        impacted_component_keys: Array.from(draft[rowKey] || []),
      }, { headers: headers() });
      toast.success('Saved');
      load();
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
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Delete failed');
    }
  };

  const addNewRow = async () => {
    if (!newRow.stage_name || !newRow.reason_id) {
      toast.error('Pick a stage and a reason');
      return;
    }
    const rowKey = `${newRow.stage_name}|${newRow.reason_id}`;
    if (mappingByKey[rowKey]) {
      toast.error('A mapping already exists for this Stage × Reason');
      return;
    }
    // Create empty mapping; user then ticks components and saves
    try {
      await axios.post(`${API_URL}/api/production/rejection-cost-mappings`, {
        stage_name: newRow.stage_name,
        reason_id: newRow.reason_id,
        impacted_component_keys: [],
      }, { headers: headers() });
      setNewRow({ stage_name: '', reason_id: '' });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto" data-testid="rejection-cost-config-page">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <IndianRupee className="h-6 w-6 text-rose-600" />
          Rejection Cost Configuration
        </h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
          For each <strong>(Stage × Rejection Reason)</strong>, select which COGS components are impacted. The system computes
          rejection cost as <span className="font-mono text-xs">qty × Σ(SKU's component price)</span> for the impacted components.
        </p>
      </div>

      {/* Add a new mapping */}
      <Card className="mb-6 border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add new mapping</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={newRow.stage_name} onValueChange={(v) => setNewRow({ ...newRow, stage_name: v })}>
              <SelectTrigger className="w-56" data-testid="new-mapping-stage-select">
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                {(config.stages || []).map((s) => (
                  <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newRow.reason_id} onValueChange={(v) => setNewRow({ ...newRow, reason_id: v })}>
              <SelectTrigger className="w-64" data-testid="new-mapping-reason-select">
                <SelectValue placeholder="Select rejection reason" />
              </SelectTrigger>
              <SelectContent>
                {(config.reasons || []).map((r) => (
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
                  {(config.stages || []).map((s) => (
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
          <CardTitle className="text-base">Stage × Reason → Impacted Components</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <AlertCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <div className="text-sm text-slate-500">
                No mappings yet. Use the form above to create one for each (stage, reason) you want to track.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="rejection-cost-matrix">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 sticky left-0 bg-slate-50 min-w-[160px]">Stage</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 min-w-[180px]">Rejection Reason</th>
                    {(config.components || []).map((c) => (
                      <th key={c.key} className="text-center px-3 py-3 font-medium text-slate-600 text-xs whitespace-nowrap">{c.label}</th>
                    ))}
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => {
                    const dirty = isDirty(r.key);
                    const isSaving = saving[r.key];
                    const draftSet = draft[r.key] || new Set();
                    return (
                      <tr key={r.key} className="hover:bg-slate-50/60" data-testid={`mapping-row-${r.mapping.id}`}>
                        <td className="px-4 py-3 sticky left-0 bg-white">
                          <Badge variant="outline" className="font-mono text-[10px] bg-slate-50">{r.stage_name}</Badge>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{r.reason_name}</td>
                        {(config.components || []).map((c) => (
                          <td key={c.key} className="text-center px-3 py-3">
                            <Checkbox
                              checked={draftSet.has(c.key)}
                              onCheckedChange={() => toggleComponent(r.key, c.key)}
                              data-testid={`cell-${r.mapping.id}-${c.key}`}
                            />
                          </td>
                        ))}
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
    </div>
  );
}
