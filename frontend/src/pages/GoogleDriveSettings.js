import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Cloud, ShieldCheck, RefreshCw, AlertCircle, FileText, ExternalLink, FolderTree } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import AppBreadcrumb from '../components/AppBreadcrumb';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export default function GoogleDriveSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState(null);
  const [usage, setUsage] = useState(null);
  const [form, setForm] = useState({ service_account_json: '', shared_drive_id: '', folder_prefix: '' });
  const [testResult, setTestResult] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [c, u] = await Promise.all([
        axios.get(`${API}/google-drive/config`, { headers: authHeaders() }),
        axios.get(`${API}/google-drive/usage`, { headers: authHeaders() }).catch(() => ({ data: null })),
      ]);
      setConfig(c.data);
      setUsage(u.data);
      setForm((f) => ({
        ...f,
        shared_drive_id: c.data.shared_drive_id || '',
        folder_prefix: c.data.folder_prefix || '',
      }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load Google Drive config');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {};
      if (form.service_account_json.trim()) payload.service_account_json = form.service_account_json.trim();
      if (form.shared_drive_id.trim()) payload.shared_drive_id = form.shared_drive_id.trim();
      payload.folder_prefix = form.folder_prefix.trim();
      payload.enabled = true;
      await axios.put(`${API}/google-drive/config`, payload, { headers: authHeaders() });
      toast.success('Google Drive connected ✔');
      setForm({ service_account_json: '', shared_drive_id: form.shared_drive_id, folder_prefix: form.folder_prefix });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post(`${API}/google-drive/test`, {}, { headers: authHeaders() });
      setTestResult(res.data);
      toast.success('Test passed ✔');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const toggleEnabled = async (next) => {
    try {
      await axios.put(`${API}/google-drive/config`, { enabled: next }, { headers: authHeaders() });
      toast.success(next ? 'Drive uploads ON' : 'Drive uploads paused (falling back to Emergent storage)');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to toggle');
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto" data-testid="google-drive-settings-page">
      <AppBreadcrumb items={[{ label: 'Settings', to: '/admin' }, { label: 'Google Drive' }]} />

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <Cloud className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Google Drive Storage</h1>
          <p className="text-sm text-slate-500">
            Route all CRM file uploads to a Shared Drive in your Google Workspace via a Service Account.
            When enabled, new uploads go to Drive; existing files keep streaming from Emergent storage.
          </p>
        </div>
        {config?.has_service_account && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Enabled</span>
            <Switch checked={!!config.enabled} onCheckedChange={toggleEnabled} data-testid="drive-enable-switch" />
          </div>
        )}
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <h2 className="text-base font-semibold">Connection</h2>
        </div>
        {config?.has_service_account ? (
          <div className="flex items-center flex-wrap gap-3 text-sm">
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">Connected</Badge>
            <span>Drive: <strong>{config.drive_meta?.name || '—'}</strong></span>
            <span className="text-slate-500">·</span>
            <span>Service account: <code className="text-xs">{config.service_account_masked?.client_email}</code></span>
            <span className="text-slate-500">·</span>
            <span>Project: <code className="text-xs">{config.service_account_masked?.project_id}</code></span>
            {usage && (
              <>
                <span className="text-slate-500">·</span>
                <span>{usage.files_uploaded} file(s) uploaded</span>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <AlertCircle className="h-4 w-4" /> Not connected. Paste your service account JSON + shared drive ID below.
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Service Account JSON</Label>
            <Textarea
              rows={6}
              placeholder={config?.has_service_account ? '••• keep existing service account •••' : '{ "type":"service_account", "project_id":"…", "private_key":"…", "client_email":"…@…iam.gserviceaccount.com", … }'}
              value={form.service_account_json}
              onChange={(e) => setForm((f) => ({ ...f, service_account_json: e.target.value }))}
              className="font-mono text-xs"
              data-testid="drive-sa-json-input"
            />
            <p className="text-[11px] text-slate-500">
              Generate in Google Cloud Console → IAM &amp; Admin → Service Accounts → ⋮ → Manage Keys → Add key → JSON.
              Grant this account access to the Shared Drive (Manager / Content Manager role).
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Shared Drive ID</Label>
              <Input
                placeholder="0ABcDeFgHiJkLm9PVA"
                value={form.shared_drive_id}
                onChange={(e) => setForm((f) => ({ ...f, shared_drive_id: e.target.value }))}
                data-testid="drive-shared-drive-id-input"
              />
              <p className="text-[11px] text-slate-500">
                From the URL: <code>https://drive.google.com/drive/folders/<strong>0ABcDeFg…</strong></code>
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Folder Prefix <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Input
                placeholder="nyla-crm"
                value={form.folder_prefix}
                onChange={(e) => setForm((f) => ({ ...f, folder_prefix: e.target.value }))}
                data-testid="drive-folder-prefix-input"
              />
              <p className="text-[11px] text-slate-500">All files live under this subfolder.</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          {config?.has_service_account && (
            <Button type="button" variant="outline" onClick={runTest} disabled={testing} data-testid="drive-test-btn">
              {testing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Run connection test
            </Button>
          )}
          <Button onClick={save} disabled={saving} data-testid="drive-save-btn">
            {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
            Save &amp; Verify
          </Button>
        </div>
      </Card>

      {testResult && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FolderTree className="h-4 w-4 text-emerald-600" />
            <h2 className="text-base font-semibold">Test result</h2>
          </div>
          <div className="text-sm space-y-1">
            <div>Drive: <strong>{testResult.drive?.name}</strong> <code className="text-[11px] text-slate-500">({testResult.drive?.id})</code></div>
            <div>Service account: <code className="text-xs">{testResult.client_email}</code></div>
            {testResult.sample_files?.length > 0 && (
              <div className="pt-2">
                <div className="text-xs text-slate-500 mb-1">Sample files visible to the bot:</div>
                <ul className="text-xs space-y-0.5">
                  {testResult.sample_files.map((f) => (
                    <li key={f.id} className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3 text-slate-400" />
                      <span>{f.name}</span>
                      <Badge variant="outline" className="text-[10px]">{f.mimeType}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card className="p-5 space-y-2 bg-slate-50/50">
        <h3 className="text-sm font-semibold">Setup checklist</h3>
        <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside">
          <li>In <a className="text-blue-600 underline" href="https://console.cloud.google.com" target="_blank" rel="noreferrer">Google Cloud Console <ExternalLink className="inline h-3 w-3" /></a>: create a project → enable <code>Google Drive API</code>.</li>
          <li>IAM &amp; Admin → Service Accounts → Create service account (any role; "no role" is fine) → Done.</li>
          <li>Open the new service account → Keys tab → Add key → JSON. Save the file.</li>
          <li>In <a className="text-blue-600 underline" href="https://admin.google.com" target="_blank" rel="noreferrer">admin.google.com <ExternalLink className="inline h-3 w-3" /></a> or via drive.google.com: create / open the Shared Drive. Click "Manage members" → add the service account email (<code>…@…iam.gserviceaccount.com</code>) as <strong>Content Manager</strong> (or Manager).</li>
          <li>Copy the Shared Drive ID from the URL.</li>
          <li>Paste both above and click "Save &amp; Verify".</li>
        </ol>
      </Card>
    </div>
  );
}
