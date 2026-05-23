import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Send, RefreshCw, ShieldCheck, Hash, AlertCircle, Slack as SlackIcon } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import AppBreadcrumb from '../components/AppBreadcrumb';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export default function SlackSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [channels, setChannels] = useState([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [form, setForm] = useState({ bot_token: '', signing_secret: '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/slack/config`, { headers: authHeaders() });
      setConfig(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load Slack config');
    } finally {
      setLoading(false);
    }
  };

  const loadChannels = async () => {
    setChannelsLoading(true);
    try {
      const res = await axios.get(`${API}/slack/channels`, { headers: authHeaders() });
      setChannels(res.data.channels || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not list channels');
    } finally {
      setChannelsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (config?.has_bot_token) loadChannels(); /* eslint-disable-next-line */ }, [config?.has_bot_token]);

  const saveCredentials = async () => {
    if (!form.bot_token && !form.signing_secret) {
      toast.error('Enter at least one of bot token / signing secret to save.');
      return;
    }
    setSaving(true);
    try {
      const payload = {};
      if (form.bot_token.trim()) payload.bot_token = form.bot_token.trim();
      if (form.signing_secret.trim()) payload.signing_secret = form.signing_secret.trim();
      payload.enabled = true;
      await axios.put(`${API}/slack/config`, payload, { headers: authHeaders() });
      toast.success('Slack connected ✔');
      setForm({ bot_token: '', signing_secret: '' });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updateDefaultChannel = async (channelId, channelName) => {
    try {
      await axios.put(`${API}/slack/config`,
        { default_channel_id: channelId, default_channel_name: channelName },
        { headers: authHeaders() }
      );
      toast.success(`Default channel → #${channelName}`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update default channel');
    }
  };

  const updateMapping = async (eventKey, channelId, channelName, enabled) => {
    const otherMappings = (config?.mappings || []).filter((m) => m.event_type !== eventKey);
    const mappings = [
      ...otherMappings,
      { event_type: eventKey, channel_id: channelId || '', channel_name: channelName || '', enabled: !!enabled },
    ];
    try {
      await axios.put(`${API}/slack/config`, { mappings }, { headers: authHeaders() });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update mapping');
    }
  };

  const toggleEnabled = async (next) => {
    try {
      await axios.put(`${API}/slack/config`, { enabled: next }, { headers: authHeaders() });
      toast.success(next ? 'Slack notifications ON' : 'Slack notifications paused');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to toggle');
    }
  };

  const sendTest = async (channelId) => {
    try {
      await axios.post(
        `${API}/slack/test`,
        { channel_id: channelId, message: ':wave: Test from CRM Settings — looks good!' },
        { headers: authHeaders() }
      );
      toast.success('Test message sent. Check Slack!');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Test send failed');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>
      </div>
    );
  }

  const mappingByEvent = Object.fromEntries((config?.mappings || []).map((m) => [m.event_type, m]));

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto" data-testid="slack-settings-page">
      <AppBreadcrumb items={[{ label: 'Settings', to: '/admin' }, { label: 'Slack' }]} />

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center">
          <SlackIcon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Slack Integration</h1>
          <p className="text-sm text-slate-500">
            Push CRM events to a Slack channel. Two-way support (interactive replies) coming soon.
          </p>
        </div>
        {config?.has_bot_token && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Enabled</span>
            <Switch
              checked={!!config.enabled}
              onCheckedChange={toggleEnabled}
              data-testid="slack-enable-switch"
            />
          </div>
        )}
      </div>

      {/* Connection card */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <h2 className="text-base font-semibold">Workspace Connection</h2>
        </div>
        {config?.has_bot_token ? (
          <div className="flex items-center flex-wrap gap-3 text-sm">
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">Connected</Badge>
            <span>Workspace: <strong>{config?.team?.team || '—'}</strong></span>
            <span className="text-slate-500">·</span>
            <span>Bot User: <code className="text-xs">{config?.team?.bot_user_id}</code></span>
            <span className="text-slate-500">·</span>
            <span>Token: <code className="text-xs">{config?.bot_token_masked}</code></span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <AlertCircle className="h-4 w-4" /> Not connected yet. Enter your Bot Token and Signing Secret below.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Bot User OAuth Token <span className="text-slate-400">(starts with xoxb-)</span></Label>
            <Input
              type="password"
              placeholder={config?.has_bot_token ? '••• keep existing •••' : 'xoxb-...'}
              value={form.bot_token}
              onChange={(e) => setForm((f) => ({ ...f, bot_token: e.target.value }))}
              data-testid="slack-bot-token-input"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Signing Secret</Label>
            <Input
              type="password"
              placeholder={config?.has_signing_secret ? '••• keep existing •••' : 'Signing secret'}
              value={form.signing_secret}
              onChange={(e) => setForm((f) => ({ ...f, signing_secret: e.target.value }))}
              data-testid="slack-signing-secret-input"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={saveCredentials} disabled={saving} data-testid="slack-save-credentials">
            {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
            Save & Verify
          </Button>
        </div>
      </Card>

      {/* Channel mapping card */}
      {config?.has_bot_token && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-slate-500" />
              <h2 className="text-base font-semibold">Event → Channel Mapping</h2>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={loadChannels} data-testid="slack-refresh-channels">
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${channelsLoading ? 'animate-spin' : ''}`} />
              Reload channels
            </Button>
          </div>

          <div className="text-xs text-slate-500">
            Pick a channel per event. Leave on default to fall back to the chosen <strong>Default channel</strong>.
            Make sure the CRM bot has been invited to the channel (<code>/invite @Nyla CRM</code>).
          </div>

          <div className="rounded-md border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 text-xs bg-slate-50 border-b border-slate-200 font-medium text-slate-600">
              <span className="w-6">Default</span>
              <span className="flex-1">Channel</span>
              <span className="w-24 text-right">Action</span>
            </div>
            {channels.map((c) => {
              const isDefault = config?.default_channel_id === c.id;
              return (
                <div key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                  <input
                    type="radio"
                    name="default-channel"
                    checked={isDefault}
                    onChange={() => updateDefaultChannel(c.id, c.name)}
                    className="cursor-pointer"
                    data-testid={`slack-default-radio-${c.id}`}
                  />
                  <Hash className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-medium">{c.name}</span>
                  {c.is_private && <Badge variant="outline" className="text-[10px]">Private</Badge>}
                  {!c.is_member && <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50">Bot not invited</Badge>}
                  <span className="flex-1" />
                  <Button type="button" size="sm" variant="outline" onClick={() => sendTest(c.id)} data-testid={`slack-test-${c.id}`}>
                    <Send className="h-3 w-3 mr-1.5" /> Test
                  </Button>
                </div>
              );
            })}
            {channels.length === 0 && (
              <div className="p-4 text-center text-sm text-slate-500">
                No channels yet. Invite the bot to a channel in Slack: <code>/invite @Nyla CRM</code>
              </div>
            )}
          </div>

          {/* Per-event override table */}
          <div className="rounded-md border border-slate-200 overflow-hidden mt-3">
            <div className="flex items-center gap-2 px-3 py-2 text-xs bg-slate-50 border-b border-slate-200 font-medium text-slate-600">
              <span className="flex-1">Event</span>
              <span className="w-48">Channel</span>
              <span className="w-20 text-right">Enabled</span>
            </div>
            {(config?.event_types || []).map((evt) => {
              const m = mappingByEvent[evt.key];
              return (
                <div key={evt.key} className="flex items-center gap-2 px-3 py-2 text-sm border-b border-slate-100 last:border-b-0">
                  <span className="flex-1">{evt.label}</span>
                  <select
                    value={m?.channel_id || ''}
                    onChange={(e) => {
                      const ch = channels.find((c) => c.id === e.target.value);
                      updateMapping(evt.key, e.target.value, ch?.name || '', m?.enabled ?? true);
                    }}
                    className="w-48 h-8 text-xs border border-slate-200 rounded px-2"
                    data-testid={`slack-event-channel-${evt.key}`}
                  >
                    <option value="">(use default)</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>#{c.name}</option>
                    ))}
                  </select>
                  <div className="w-20 flex justify-end">
                    <Switch
                      checked={m?.enabled ?? true}
                      onCheckedChange={(checked) =>
                        updateMapping(evt.key, m?.channel_id || '', m?.channel_name || '', checked)
                      }
                      data-testid={`slack-event-toggle-${evt.key}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Webhooks (info) */}
      <Card className="p-5 space-y-2 bg-slate-50/50">
        <h3 className="text-sm font-semibold">Slack App Webhook URLs</h3>
        <p className="text-xs text-slate-500">Configure these in your Slack App (api.slack.com → your app → Event Subscriptions / Interactivity):</p>
        <div className="text-xs space-y-1 font-mono">
          <div><strong>Events Request URL:</strong> {window.location.origin}/api/slack/events</div>
          <div><strong>Interactivity Request URL:</strong> {window.location.origin}/api/slack/interactivity</div>
        </div>
      </Card>
    </div>
  );
}
