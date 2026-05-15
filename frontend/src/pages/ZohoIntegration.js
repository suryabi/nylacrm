import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Link2, Link2Off, CheckCircle2, AlertCircle, RefreshCw, Search, ExternalLink, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const headers = () => ({
  Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('session_token') || ''}`,
});

export default function ZohoIntegration() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('connection');
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const canManage = user && ['CEO', 'Admin', 'System Admin'].includes(user.role);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/zoho/status`, { headers: headers() });
      setStatus(data);
    } catch (err) {
      toast.error('Could not load Zoho status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // OAuth callback toast
  useEffect(() => {
    const s = searchParams.get('status');
    const message = searchParams.get('message');
    if (s === 'success') {
      toast.success('Connected to Zoho Books');
      loadStatus();
    } else if (s === 'error') {
      toast.error(`Zoho connection failed: ${message || 'unknown error'}`);
    }
    if (s) {
      searchParams.delete('status');
      searchParams.delete('message');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/zoho/oauth/initiate`, { headers: headers() });
      if (data.authorize_url) window.location.href = data.authorize_url;
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to start Zoho connection');
    }
  };

  const handleDisconnect = async () => {
    try {
      await axios.delete(`${API_URL}/api/zoho/disconnect`, { headers: headers() });
      toast.success('Disconnected from Zoho Books');
      setDisconnectOpen(false);
      loadStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to disconnect');
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6" data-testid="zoho-integration-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Zoho Books Integration</h1>
        <p className="text-muted-foreground mt-1.5">
          Push invoices to your Zoho Books org automatically when a distributor delivery is confirmed.
        </p>
      </div>

      {/* Configuration warning */}
      {status && !status.configured && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold">Platform not yet configured</p>
                <p className="mt-1">The Zoho OAuth client credentials have not been set on the server.
                  Ask your platform admin to add <code className="px-1 py-0.5 bg-amber-100 rounded">ZOHO_CLIENT_ID</code> and
                  {' '}<code className="px-1 py-0.5 bg-amber-100 rounded">ZOHO_CLIENT_SECRET</code> in <code className="px-1 py-0.5 bg-amber-100 rounded">backend/.env</code>.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="connection" data-testid="zoho-tab-connection">Connection</TabsTrigger>
          <TabsTrigger value="mapping" disabled={!status?.connected} data-testid="zoho-tab-mapping">SKU Mapping</TabsTrigger>
          <TabsTrigger value="templates" disabled={!status?.connected} data-testid="zoho-tab-templates">Templates</TabsTrigger>
          <TabsTrigger value="sync" disabled={!status?.connected} data-testid="zoho-tab-sync">Sync Status</TabsTrigger>
        </TabsList>

        {/* ====================== Connection Tab ====================== */}
        <TabsContent value="connection" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Connection
              </CardTitle>
              <CardDescription>Connect your tenant's Zoho Books organisation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : status?.connected ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-emerald-900">Connected</p>
                        <dl className="mt-2 text-sm text-emerald-900/90 grid grid-cols-2 gap-x-6 gap-y-1.5">
                          <div><dt className="text-emerald-700 inline">Organization:</dt> <dd className="inline font-medium ml-1">{status.organization_name || '—'}</dd></div>
                          <div><dt className="text-emerald-700 inline">Org ID:</dt> <dd className="inline font-medium ml-1">{status.organization_id}</dd></div>
                          <div><dt className="text-emerald-700 inline">Connected by:</dt> <dd className="inline font-medium ml-1">{status.connected_by || '—'}</dd></div>
                          <div><dt className="text-emerald-700 inline">Last update:</dt> <dd className="inline font-medium ml-1">{status.updated_at ? new Date(status.updated_at).toLocaleString() : '—'}</dd></div>
                        </dl>
                      </div>
                      <Badge className={status.connection_status === 'connected' ? 'bg-emerald-600' : 'bg-amber-600'}>
                        {status.connection_status}
                      </Badge>
                    </div>
                  </div>
                  {canManage && (
                    <Button variant="destructive" onClick={() => setDisconnectOpen(true)} data-testid="zoho-disconnect-btn">
                      <Link2Off className="h-4 w-4 mr-2" />
                      Disconnect from Zoho Books
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                    Not yet connected. Click the button below to authorize Nyla CRM to push invoices into your Zoho Books organisation. You'll be redirected to Zoho to approve the requested permissions.
                  </div>
                  <Button
                    onClick={handleConnect}
                    disabled={!canManage || !status?.configured}
                    size="lg"
                    data-testid="zoho-connect-btn"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Connect to Zoho Books
                  </Button>
                  {!canManage && (
                    <p className="text-xs text-muted-foreground">Only CEO / Admin / System Admin can manage this integration.</p>
                  )}
                </div>
              )}

              <div className="mt-6 p-4 rounded-md bg-slate-50 border border-slate-200 text-sm space-y-2">
                <p className="font-semibold text-slate-800">What this integration does</p>
                <ul className="text-slate-600 space-y-1 list-disc ml-5">
                  <li>Automatically pushes an invoice into Zoho Books when a <strong>distributor delivery is confirmed</strong>.</li>
                  <li>Auto-creates the customer in Zoho if not already there (matched by email + GSTIN).</li>
                  <li>Uses your manually configured <strong>SKU Mapping</strong> to translate Nyla SKUs to Zoho Items.</li>
                  <li>Retries 3× with exponential back-off on failure; failed pushes appear in <strong>Sync Status</strong> for manual retry.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====================== SKU Mapping Tab ====================== */}
        <TabsContent value="mapping" className="pt-4">
          <SkuMappingPanel canManage={canManage} />
        </TabsContent>

        {/* ====================== Templates Tab ====================== */}
        <TabsContent value="templates" className="pt-4">
          <TemplateSettingsPanel canManage={canManage} />
        </TabsContent>

        {/* ====================== Sync Status Tab ====================== */}
        <TabsContent value="sync" className="pt-4">
          <SyncStatusPanel canManage={canManage} />
        </TabsContent>
      </Tabs>

      {/* Disconnect confirm */}
      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Zoho Books?</AlertDialogTitle>
            <AlertDialogDescription>
              The refresh token will be revoked and credentials cleared. Future delivery confirmations will not push invoices to Zoho until you reconnect.
              SKU mappings will be retained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect} className="bg-red-600 hover:bg-red-700">Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =====================================================================
// SKU Mapping Panel
// =====================================================================
function SkuMappingPanel({ canManage }) {
  const [mappings, setMappings] = useState([]);
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSkuId, setPickerSkuId] = useState(null);
  const [zohoItems, setZohoItems] = useState([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerLoading, setPickerLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, sRes] = await Promise.all([
        axios.get(`${API_URL}/api/zoho/sku-mappings`, { headers: headers() }),
        axios.get(`${API_URL}/api/master-skus`, { headers: headers() }),
      ]);
      setMappings(mRes.data.mappings || []);
      const skuData = sRes.data?.skus || sRes.data || [];
      setSkus(Array.isArray(skuData) ? skuData : []);
    } catch (err) {
      toast.error('Failed to load SKU mappings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const mappingBySkuId = mappings.reduce((acc, m) => ({ ...acc, [m.our_sku_id]: m }), {});

  const openPicker = async (skuId) => {
    setPickerSkuId(skuId);
    setPickerOpen(true);
    setPickerSearch('');
    await loadZohoItems('');
  };

  const loadZohoItems = async (q) => {
    setPickerLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/zoho/items`, {
        headers: headers(),
        params: q ? { search: q } : {},
      });
      setZohoItems(data.items || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to fetch Zoho items');
      setZohoItems([]);
    } finally {
      setPickerLoading(false);
    }
  };

  const saveMapping = async (item) => {
    try {
      await axios.put(
        `${API_URL}/api/zoho/sku-mappings/${pickerSkuId}`,
        { zoho_item_id: item.item_id, zoho_item_name: item.name },
        { headers: headers() }
      );
      toast.success('Mapping saved');
      setPickerOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save mapping');
    }
  };

  const removeMapping = async (skuId) => {
    try {
      await axios.delete(`${API_URL}/api/zoho/sku-mappings/${skuId}`, { headers: headers() });
      toast.success('Mapping removed');
      load();
    } catch (err) {
      toast.error('Failed to remove mapping');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>SKU Mapping</CardTitle>
        <CardDescription>
          Map each Nyla SKU to an existing Zoho Books Item. Invoices for deliveries containing unmapped SKUs will fail to push.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm" data-testid="sku-mapping-table">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Nyla SKU</th>
                  <th className="text-left p-3 font-medium">Code</th>
                  <th className="text-left p-3 font-medium">Zoho Item</th>
                  <th className="text-right p-3 font-medium w-48">Action</th>
                </tr>
              </thead>
              <tbody>
                {skus.length === 0 && (
                  <tr><td colSpan="4" className="p-6 text-center text-muted-foreground">No SKUs in master.</td></tr>
                )}
                {skus.map((sku, idx) => {
                  const m = mappingBySkuId[sku.id];
                  return (
                    <tr key={sku.id} className={`border-b ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}>
                      <td className="p-3 font-medium">{sku.name || sku.sku_name}</td>
                      <td className="p-3 text-muted-foreground">{sku.sku_code || '—'}</td>
                      <td className="p-3">
                        {m ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            <span className="font-medium">{m.zoho_item_name || m.zoho_item_id}</span>
                            <code className="text-xs text-muted-foreground">({m.zoho_item_id})</code>
                          </div>
                        ) : (
                          <span className="text-amber-700 text-sm">Not mapped</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {canManage && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openPicker(sku.id)} data-testid={`map-sku-${sku.id}`}>
                              {m ? 'Re-map' : 'Map'}
                            </Button>
                            {m && (
                              <Button size="sm" variant="ghost" onClick={() => removeMapping(sku.id)} className="text-red-600">
                                Remove
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Zoho item picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl" data-testid="zoho-item-picker">
          <DialogHeader>
            <DialogTitle>Pick a Zoho Item</DialogTitle>
            <DialogDescription>Search and select the Zoho Books item this Nyla SKU corresponds to.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Search by name or SKU…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') loadZohoItems(pickerSearch); }}
              />
              <Button onClick={() => loadZohoItems(pickerSearch)}><Search className="h-4 w-4" /></Button>
            </div>
            <div className="border rounded-md max-h-[400px] overflow-y-auto">
              {pickerLoading ? (
                <div className="flex items-center justify-center py-8"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : zohoItems.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No items found.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left p-2.5 font-medium">Name</th>
                      <th className="text-left p-2.5 font-medium">SKU</th>
                      <th className="text-right p-2.5 font-medium">Rate</th>
                      <th className="text-right p-2.5 font-medium w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {zohoItems.map((it) => (
                      <tr key={it.item_id} className="border-b hover:bg-muted/30">
                        <td className="p-2.5 font-medium">{it.name}</td>
                        <td className="p-2.5 text-muted-foreground">{it.sku || '—'}</td>
                        <td className="p-2.5 text-right tabular-nums">{it.rate ? `₹${it.rate}` : '—'}</td>
                        <td className="p-2.5 text-right">
                          <Button size="sm" onClick={() => saveMapping(it)}>Select</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// =====================================================================
// Template Settings Panel — pick which Zoho PDF template to use when CRM
// pushes invoices / credit notes to Zoho Books
// =====================================================================
function TemplateSelect({ label, value, onChange, templates, testId, disabled }) {
  const defaultTpl = templates.find(t => t.is_default);
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          data-testid={testId}
        >
          <option value="">
            Zoho default{defaultTpl ? ` — ${defaultTpl.template_name}` : ''}
          </option>
          {templates.map(t => (
            <option key={t.template_id} value={t.template_id}>
              {t.template_name}{t.is_default ? ' (default)' : ''}
            </option>
          ))}
        </select>
        {value && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange('')}
            disabled={disabled}
            data-testid={`${testId}-clear`}
          >
            Clear
          </Button>
        )}
      </div>
      {value && (
        <p className="text-[11px] text-muted-foreground font-mono">
          template_id: {value}
        </p>
      )}
    </div>
  );
}

function TemplateSettingsPanel({ canManage }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoiceTemplates, setInvoiceTemplates] = useState([]);
  const [creditnoteTemplates, setCreditnoteTemplates] = useState([]);
  const [invoiceTemplateId, setInvoiceTemplateId] = useState('');
  const [creditnoteTemplateId, setCreditnoteTemplateId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, cnRes, settingsRes] = await Promise.all([
        axios.get(`${API_URL}/api/zoho/admin/templates`, { headers: headers(), params: { entity: 'invoice' } }),
        axios.get(`${API_URL}/api/zoho/admin/templates`, { headers: headers(), params: { entity: 'creditnote' } }),
        axios.get(`${API_URL}/api/zoho/admin/template-settings`, { headers: headers() }),
      ]);
      setInvoiceTemplates(invRes.data?.templates || []);
      setCreditnoteTemplates(cnRes.data?.templates || []);
      setInvoiceTemplateId(settingsRes.data?.invoice_template_id || '');
      setCreditnoteTemplateId(settingsRes.data?.creditnote_template_id || '');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not load Zoho templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(
        `${API_URL}/api/zoho/admin/template-settings`,
        {
          invoice_template_id: invoiceTemplateId || null,
          creditnote_template_id: creditnoteTemplateId || null,
        },
        { headers: headers() },
      );
      toast.success('Template settings saved');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not save template settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          PDF Templates
        </CardTitle>
        <CardDescription>
          Pick which PDF template Zoho should apply when CRM creates a new invoice
          or credit note. Leave a selection on "Zoho default" to use your org's default template.
          Historical Zoho records keep whatever template they were created with.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <TemplateSelect
              label="Invoice template"
              value={invoiceTemplateId}
              onChange={setInvoiceTemplateId}
              templates={invoiceTemplates}
              testId="invoice-template-select"
              disabled={!canManage || saving}
            />
            <TemplateSelect
              label="Credit-note template"
              value={creditnoteTemplateId}
              onChange={setCreditnoteTemplateId}
              templates={creditnoteTemplates}
              testId="creditnote-template-select"
              disabled={!canManage || saving}
            />
            <div className="flex items-center justify-between border-t pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={load}
                disabled={loading || saving}
                data-testid="templates-refresh-btn"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh templates from Zoho
              </Button>
              <Button
                onClick={save}
                disabled={!canManage || saving}
                data-testid="save-template-settings-btn"
              >
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
            </div>
            {!canManage && (
              <p className="text-xs text-amber-600">
                Only CEO / System Admin can change these settings.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// Sync Status Panel
// =====================================================================
function SyncStatusPanel({ canManage }) {
  const [data, setData] = useState({ items: [], summary: { total: 0, synced: 0, failed: 0 } });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [retrying, setRetrying] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter === 'all' ? {} : { status: filter };
      const { data } = await axios.get(`${API_URL}/api/zoho/sync-status`, { headers: headers(), params });
      setData(data);
    } catch (err) {
      toast.error('Failed to load sync status');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const retry = async (row) => {
    if (row.source_type !== 'distributor_delivery' || !row.distributor_id) {
      toast.error('Cannot retry: missing distributor reference.');
      return;
    }
    setRetrying(row.source_id);
    try {
      await axios.post(
        `${API_URL}/api/zoho/sync/delivery/${row.distributor_id}/${row.source_id}`,
        {},
        { headers: headers() }
      );
      toast.success('Retry queued');
      setTimeout(load, 4000);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Retry failed');
    } finally {
      setRetrying(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Sync Status</CardTitle>
          <CardDescription>Recent invoice push attempts to Zoho Books</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-1.5" />Refresh</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="border rounded-md p-3"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{data.summary.total}</p></div>
          <div className="border rounded-md p-3 bg-emerald-50 border-emerald-200"><p className="text-xs text-emerald-700">Synced</p><p className="text-2xl font-bold text-emerald-700">{data.summary.synced}</p></div>
          <div className="border rounded-md p-3 bg-red-50 border-red-200"><p className="text-xs text-red-700">Failed</p><p className="text-2xl font-bold text-red-700">{data.summary.failed}</p></div>
        </div>

        <div className="flex gap-2">
          {['all', 'synced', 'sync_failed'].map(f => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'synced' ? 'Synced' : 'Failed'}
            </Button>
          ))}
        </div>

        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm" data-testid="sync-status-table">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Reference</th>
                <th className="text-left p-3 font-medium">Source</th>
                <th className="text-left p-3 font-medium">Zoho Invoice</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">When</th>
                <th className="text-right p-3 font-medium w-24"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="p-8 text-center"><RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : data.items.length === 0 ? (
                <tr><td colSpan="6" className="p-6 text-center text-muted-foreground">No sync records yet.</td></tr>
              ) : data.items.map((row, idx) => (
                <React.Fragment key={`${row.source_type}-${row.source_id}`}>
                  <tr className={`border-b ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}>
                    <td className="p-3 font-medium">{row.source_reference || '—'}</td>
                    <td className="p-3 text-muted-foreground">{row.source_type?.replace(/_/g, ' ') || '—'}</td>
                    <td className="p-3">{row.zoho_invoice_number || row.zoho_invoice_id || '—'}</td>
                    <td className="p-3 text-center">
                      {row.status === 'synced' ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Synced</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 border-red-200">Failed</Badge>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{row.synced_at ? new Date(row.synced_at).toLocaleString() : row.last_failed_at ? new Date(row.last_failed_at).toLocaleString() : '—'}</td>
                    <td className="p-3 text-right">
                      {row.status === 'sync_failed' && canManage && (
                        <Button size="sm" variant="outline" disabled={retrying === row.source_id} onClick={() => retry(row)}>
                          Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                  {row.status === 'sync_failed' && row.error && (
                    <tr className="bg-red-50/40 border-b">
                      <td colSpan="6" className="px-3 py-2 text-xs text-red-800">
                        <span className="font-semibold">Error:</span> {row.error}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
