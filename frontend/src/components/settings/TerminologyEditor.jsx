import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Loader2, Languages, RotateCcw, Wand2 } from 'lucide-react';
import { useTenantConfig, DEFAULT_TERMINOLOGY } from '../../context/TenantConfigContext';
import { TERMINOLOGY_PRESETS } from '../../config/terminologyPresets';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const TERM_META = [
  { key: 'unit', label: 'Sales Unit', hint: 'The individual item you sell — e.g. Bottle, Piece, Pouch, Can' },
  { key: 'package', label: 'Bulk Package', hint: 'How units are packed for transport — e.g. Crate, Carton, Case, Box' },
  { key: 'distributor', label: 'Channel Partner', hint: 'Who moves your stock — e.g. Distributor, Dealer, Stockist, Franchisee' },
  { key: 'factory', label: 'Production Site', hint: 'Where products are made — e.g. Factory, Plant, Kitchen, Workshop' },
  { key: 'sku', label: 'Product Variant', hint: 'A sellable product variant — e.g. SKU, Product, Item, Article' },
];

export const TerminologyEditor = () => {
  const { tenantConfig, refreshConfig } = useTenantConfig();
  const [values, setValues] = useState(DEFAULT_TERMINOLOGY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const overrides = tenantConfig?.terminology || {};
    const merged = {};
    Object.entries(DEFAULT_TERMINOLOGY).forEach(([k, v]) => {
      merged[k] = {
        singular: overrides[k]?.singular || v.singular,
        plural: overrides[k]?.plural || v.plural,
      };
    });
    setValues(merged);
  }, [tenantConfig]);

  const setField = (key, field, val) =>
    setValues((p) => ({ ...p, [key]: { ...p[key], [field]: val } }));

  const save = async () => {
    for (const { key, label } of TERM_META) {
      if (!values[key]?.singular?.trim() || !values[key]?.plural?.trim()) {
        toast.error(`${label}: both singular and plural are required`);
        return;
      }
    }
    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/tenants/current/terminology`, values, { headers: HEAD() });
      toast.success('Terminology saved — applied across the app');
      refreshConfig();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save terminology');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => setValues(JSON.parse(JSON.stringify(DEFAULT_TERMINOLOGY)));

  return (
    <Card data-testid="terminology-editor">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Languages className="h-5 w-5" /> Terminology
        </CardTitle>
        <CardDescription>
          Rename core concepts to match your industry. These names are used across dashboards,
          stock screens and dialogs — e.g. a garment brand might use Piece / Carton / Dealer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-2 rounded-lg border bg-slate-50 p-3">
          <Wand2 className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium whitespace-nowrap">Industry preset:</span>
          <Select onValueChange={(v) => setValues(JSON.parse(JSON.stringify(TERMINOLOGY_PRESETS[v])))}>
            <SelectTrigger className="h-9 flex-1" data-testid="term-preset-select"><SelectValue placeholder="Apply a one-click term set…" /></SelectTrigger>
            <SelectContent>
              {Object.keys(TERMINOLOGY_PRESETS).map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="hidden sm:grid grid-cols-[1.4fr_1fr_1fr] gap-3 text-xs font-semibold uppercase tracking-wider text-slate-500 px-1">
          <span>Concept</span><span>Singular</span><span>Plural</span>
        </div>
        {TERM_META.map(({ key, label, hint }) => (
          <div key={key} className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr] gap-3 items-start">
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-[11px] text-muted-foreground">{hint}</p>
            </div>
            <Input
              value={values[key]?.singular || ''}
              onChange={(e) => setField(key, 'singular', e.target.value)}
              maxLength={40}
              data-testid={`term-${key}-singular`}
            />
            <Input
              value={values[key]?.plural || ''}
              onChange={(e) => setField(key, 'plural', e.target.value)}
              maxLength={40}
              data-testid={`term-${key}-plural`}
            />
          </div>
        ))}
        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={resetDefaults} data-testid="term-reset-btn">
            <RotateCcw className="h-4 w-4 mr-1.5" /> Reset to defaults
          </Button>
          <Button onClick={save} disabled={saving} data-testid="term-save-btn">
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Save Terminology
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default TerminologyEditor;
