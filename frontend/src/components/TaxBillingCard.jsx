import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Receipt, MapPin, Edit2, Save, X, Loader2, Copy, Building2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Tax & Billing Information Card.
 *
 * Two modes:
 *  - editable: shows Edit button → inline form for GST, PAN and structured billing
 *    address (address_line1, address_line2, city, state, pincode). Calls onSave with
 *    a payload `{ gst_number, pan_number, billing_address: {...} }`.
 *  - readOnly: pure display card used by the Distributor → Account Assignments view
 *    so a distributor can see the customer's tax/billing details without leaving the
 *    Commercials tab.
 *
 * Props:
 *   data: { gst_number, pan_number, billing_address, gst_legal_name, gst_trade_name }
 *   editable (bool, default false)
 *   onSave (async fn, required when editable)
 *   compact (bool) — tighter layout for inline use inside an expanded table row
 */
const emptyBilling = { address_line1: '', address_line2: '', city: '', state: '', pincode: '' };

export default function TaxBillingCard({
  data = {},
  editable = false,
  onSave,
  compact = false,
  titleSuffix = '',
  testId = 'tax-billing-card',
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    gst_number: data.gst_number || '',
    pan_number: data.pan_number || '',
    billing_address: { ...emptyBilling, ...(data.billing_address || {}) },
  });

  useEffect(() => {
    setForm({
      gst_number: data.gst_number || '',
      pan_number: data.pan_number || '',
      billing_address: { ...emptyBilling, ...(data.billing_address || {}) },
    });
  }, [data]);

  const ba = data.billing_address || {};
  const hasAny = !!(data.gst_number || data.pan_number || ba.address_line1 || ba.address_line2 || ba.city || ba.state || ba.pincode);

  const copyToClipboard = (val, label) => {
    if (!val) return;
    navigator.clipboard.writeText(val).then(
      () => toast.success(`${label} copied`),
      () => toast.error('Copy failed'),
    );
  };

  const validate = () => {
    if (form.gst_number && form.gst_number.length !== 15) {
      toast.error('GSTIN must be 15 characters');
      return false;
    }
    if (form.pan_number && form.pan_number.length !== 10) {
      toast.error('PAN must be 10 characters');
      return false;
    }
    if (form.billing_address.pincode && !/^\d{6}$/.test(form.billing_address.pincode)) {
      toast.error('PIN code must be 6 digits');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        gst_number: (form.gst_number || '').toUpperCase().trim() || null,
        pan_number: (form.pan_number || '').toUpperCase().trim() || null,
        billing_address: {
          address_line1: form.billing_address.address_line1 || null,
          address_line2: form.billing_address.address_line2 || null,
          city: form.billing_address.city || null,
          state: form.billing_address.state || null,
          pincode: form.billing_address.pincode || null,
        },
      });
      toast.success('Tax & billing details saved');
      setEditing(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const formattedAddress = [ba.address_line1, ba.address_line2, ba.city, ba.state, ba.pincode]
    .filter(Boolean)
    .join(', ');

  return (
    <Card data-testid={testId} className={compact ? 'border border-emerald-100/60' : ''}>
      <CardHeader className={compact ? 'pb-3' : 'flex flex-row items-center justify-between space-y-0'}>
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-emerald-600" />
            Tax &amp; Billing Information
            {titleSuffix && <span className="text-xs text-slate-500 font-normal">{titleSuffix}</span>}
          </CardTitle>
          {!compact && (
            <CardDescription>GST, PAN and registered billing address used on every invoice.</CardDescription>
          )}
        </div>
        {editable && !editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="tax-billing-edit-btn">
            <Edit2 className="h-3.5 w-3.5 mr-1.5" /> {hasAny ? 'Edit' : 'Add Details'}
          </Button>
        )}
        {editable && editing && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} data-testid="tax-billing-save-btn">
              {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</> : <><Save className="h-3.5 w-3.5 mr-1.5" /> Save</>}
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-slate-500">GSTIN</Label>
                <Input
                  value={form.gst_number}
                  onChange={(e) => setForm({ ...form, gst_number: e.target.value.toUpperCase() })}
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={15}
                  className="font-mono"
                  data-testid="tax-gst-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-slate-500">PAN</Label>
                <Input
                  value={form.pan_number}
                  onChange={(e) => setForm({ ...form, pan_number: e.target.value.toUpperCase() })}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  className="font-mono"
                  data-testid="tax-pan-input"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Building2 className="h-3 w-3" /> Billing Address
              </Label>
              <Input
                value={form.billing_address.address_line1}
                onChange={(e) => setForm({ ...form, billing_address: { ...form.billing_address, address_line1: e.target.value } })}
                placeholder="Address line 1 (building / street)"
                data-testid="tax-addr1-input"
              />
              <Input
                value={form.billing_address.address_line2}
                onChange={(e) => setForm({ ...form, billing_address: { ...form.billing_address, address_line2: e.target.value } })}
                placeholder="Address line 2 (area / landmark)"
                data-testid="tax-addr2-input"
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  value={form.billing_address.city}
                  onChange={(e) => setForm({ ...form, billing_address: { ...form.billing_address, city: e.target.value } })}
                  placeholder="City"
                  data-testid="tax-city-input"
                />
                <Input
                  value={form.billing_address.state}
                  onChange={(e) => setForm({ ...form, billing_address: { ...form.billing_address, state: e.target.value } })}
                  placeholder="State"
                  data-testid="tax-state-input"
                />
                <Input
                  value={form.billing_address.pincode}
                  onChange={(e) => setForm({ ...form, billing_address: { ...form.billing_address, pincode: e.target.value.replace(/\D/g, '') } })}
                  placeholder="PIN code"
                  maxLength={6}
                  className="font-mono"
                  data-testid="tax-pincode-input"
                />
              </div>
            </div>
          </div>
        ) : !hasAny ? (
          <div className="text-sm text-slate-500 italic py-4 text-center">
            No tax or billing details captured yet.
            {editable && ' Click "Add Details" or upload a GST certificate to populate.'}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DetailField label="GSTIN" value={data.gst_number} mono onCopy={copyToClipboard} />
              <DetailField label="PAN" value={data.pan_number} mono onCopy={copyToClipboard} />
            </div>
            {(data.gst_legal_name || data.gst_trade_name) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.gst_legal_name && <DetailField label="Legal Name" value={data.gst_legal_name} />}
                {data.gst_trade_name && <DetailField label="Trade Name" value={data.gst_trade_name} />}
              </div>
            )}
            {formattedAddress && (
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> Billing Address
                </Label>
                <div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md p-2.5 flex items-start justify-between gap-2">
                  <span className="whitespace-pre-wrap leading-relaxed">{formattedAddress}</span>
                  <button
                    onClick={() => copyToClipboard(formattedAddress, 'Billing address')}
                    className="text-slate-400 hover:text-slate-700 shrink-0"
                    title="Copy address"
                    data-testid="tax-copy-address"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DetailField({ label, value, mono = false, onCopy }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wider text-slate-500">{label}</Label>
      {value ? (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={`bg-white ${mono ? 'font-mono' : ''} text-slate-800 px-2 py-1`}>
            {value}
          </Badge>
          {onCopy && (
            <button
              onClick={() => onCopy(value, label)}
              className="text-slate-400 hover:text-slate-700"
              title={`Copy ${label}`}
            >
              <Copy className="h-3 w-3" />
            </button>
          )}
        </div>
      ) : (
        <span className="text-xs text-slate-400 italic">Not set</span>
      )}
    </div>
  );
}
