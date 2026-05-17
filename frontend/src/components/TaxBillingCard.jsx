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
// India GST regex — 15 chars: 2-digit state + 10-char PAN + 1-char entity + 'Z' + 1-char check digit
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
// PAN regex — 10 chars: 5 letters + 4 digits + 1 letter (4th letter is entity type)
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

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
    gst_legal_name: data.gst_legal_name || '',
    gst_trade_name: data.gst_trade_name || '',
    billing_address: { ...emptyBilling, ...(data.billing_address || {}) },
  });

  useEffect(() => {
    // Only re-sync the form fields from props while the user is NOT actively
    // editing. Otherwise every parent re-render (e.g. parent polls, sibling
    // state changes) wipes the user's in-progress typing — that was the bug
    // reported when editing details after a GST certificate upload.
    if (editing) return;
    setForm({
      gst_number: data.gst_number || '',
      pan_number: data.pan_number || '',
      gst_legal_name: data.gst_legal_name || '',
      gst_trade_name: data.gst_trade_name || '',
      billing_address: { ...emptyBilling, ...(data.billing_address || {}) },
    });
  }, [data, editing]);

  const ba = data.billing_address || {};
  const hasAny = !!(data.gst_number || data.pan_number || ba.address_line1 || ba.address_line2 || ba.city || ba.state || ba.pincode);

  const copyToClipboard = (val, label) => {
    if (!val) return;
    navigator.clipboard.writeText(val).then(
      () => toast.success(`${label} copied`),
      () => toast.error('Copy failed'),
    );
  };

  const gstinNorm = (form.gst_number || '').toUpperCase().trim();
  const panNorm = (form.pan_number || '').toUpperCase().trim();
  // Live inline-validity flags — used to colour inputs and gate Save
  const gstinValid = !gstinNorm || GSTIN_REGEX.test(gstinNorm);
  const panValid = !panNorm || PAN_REGEX.test(panNorm);
  // Cross-check: GSTIN positions 3..12 must equal the PAN if both are present
  const panFromGstin = gstinNorm.length === 15 ? gstinNorm.slice(2, 12) : '';
  const gstinPanMatches = !panNorm || !panFromGstin || panFromGstin === panNorm;

  const validate = () => {
    if (gstinNorm && !GSTIN_REGEX.test(gstinNorm)) {
      toast.error('Invalid GSTIN format. Expected 15 chars: 2-digit state + 10-char PAN + entity + Z + check digit.');
      return false;
    }
    if (panNorm && !PAN_REGEX.test(panNorm)) {
      toast.error('Invalid PAN format. Expected 10 chars: 5 letters + 4 digits + 1 letter.');
      return false;
    }
    if (!gstinPanMatches) {
      toast.error('PAN does not match the PAN embedded in the GSTIN (positions 3–12).');
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
        gst_number: gstinNorm || null,
        pan_number: panNorm || null,
        gst_legal_name: form.gst_legal_name?.trim() || null,
        gst_trade_name: form.gst_trade_name?.trim() || null,
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
            <CardDescription>
              GSTIN, PAN, registered names and billing address used on every invoice.
              These values — whether parsed from the GST certificate or entered/edited manually here — are what we sync to Zoho.
            </CardDescription>
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
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !gstinValid || !panValid || !gstinPanMatches}
              data-testid="tax-billing-save-btn"
            >
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
                  onChange={(e) => {
                    const next = e.target.value.toUpperCase();
                    setForm(prev => {
                      // Auto-derive PAN from GSTIN positions 3–12 the moment
                      // they form a valid PAN pattern. We only fill when the
                      // PAN field is empty so we never overwrite a value the
                      // user typed explicitly (the amber "doesn't match"
                      // warning surfaces any conflict).
                      const derived = next.length >= 12 ? next.slice(2, 12) : '';
                      const shouldFill = !prev.pan_number && derived && PAN_REGEX.test(derived);
                      return {
                        ...prev,
                        gst_number: next,
                        pan_number: shouldFill ? derived : prev.pan_number,
                      };
                    });
                  }}
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={15}
                  className={`font-mono ${form.gst_number && !gstinValid ? 'border-red-300 focus-visible:ring-red-300' : ''}`}
                  data-testid="tax-gst-input"
                />
                {form.gst_number && !gstinValid && (
                  <p className="text-[10px] text-red-600">Invalid GSTIN — expected 15 chars: state (2) + PAN (10) + entity + Z + check digit.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-slate-500">PAN</Label>
                <Input
                  value={form.pan_number}
                  onChange={(e) => setForm({ ...form, pan_number: e.target.value.toUpperCase() })}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  className={`font-mono ${form.pan_number && !panValid ? 'border-red-300 focus-visible:ring-red-300' : ''}`}
                  data-testid="tax-pan-input"
                />
                {form.pan_number && !panValid && (
                  <p className="text-[10px] text-red-600">Invalid PAN — expected 10 chars: 5 letters + 4 digits + 1 letter.</p>
                )}
                {form.pan_number && panValid && !gstinPanMatches && (
                  <p className="text-[10px] text-amber-700">PAN inside GSTIN ({panFromGstin}) doesn't match.</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-slate-500">Legal Name</Label>
                <Input
                  value={form.gst_legal_name}
                  onChange={(e) => setForm({ ...form, gst_legal_name: e.target.value })}
                  placeholder="Registered legal name (as per GST cert)"
                  data-testid="tax-legal-name-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-slate-500">Trade Name</Label>
                <Input
                  value={form.gst_trade_name}
                  onChange={(e) => setForm({ ...form, gst_trade_name: e.target.value })}
                  placeholder="Business / brand name printed on invoice"
                  data-testid="tax-trade-name-input"
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
