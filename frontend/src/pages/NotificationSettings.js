/**
 * Notification Settings page.
 *
 * Two sections:
 *   1. Tenant matrix (Admin / CEO only) — role × category checkboxes + a
 *      single global kill-switch. This is the gate every `notify_users` call
 *      passes through.
 *   2. My preferences — each user can opt out of any category *within* what
 *      their role allows. Categories disabled for their role are shown as
 *      read-only ("Disabled by admin").
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2, Save, ShieldAlert, Bell, BellOff } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Checkbox } from '../components/ui/checkbox';

import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('session_token')}` });

// Mirrors `ADMIN_ROLES` in routes/notification_settings.py
const ADMIN_ROLES = new Set(['CEO', 'Director', 'Admin', 'System Admin']);

const ROLES = [
  'CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager',
  'Head of Business', 'Partner - Sales', 'Sales Partner', 'Sales Rep',
  'Marketing Manager', 'Marketing Executive', 'Content Creator',
  'Production Manager', 'Production Executive',
  'Distribution Manager', 'Distribution Executive',
  'Admin', 'System Admin',
];

export default function NotificationSettings() {
  const { user: currentUser } = useAuth() || {};
  const [categories, setCategories] = useState([]);
  const [tenantCfg, setTenantCfg] = useState(null);
  const [myPrefs, setMyPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  const isAdmin = ADMIN_ROLES.has(currentUser?.role);

  const refresh = async () => {
    try {
      const [{ data: cats }, meRes, tenantRes] = await Promise.all([
        axios.get(`${API_URL}/notification-settings/categories`, { headers: auth() }),
        axios.get(`${API_URL}/notification-settings/me`, { headers: auth() }),
        isAdmin
          ? axios.get(`${API_URL}/notification-settings/tenant`, { headers: auth() })
          : Promise.resolve({ data: null }),
      ]);
      setCategories(cats);
      setMyPrefs(meRes.data);
      setTenantCfg(tenantRes.data);
    } catch (e) {
      toast.error('Failed to load notification settings');
    }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const saveTenant = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/notification-settings/tenant`, {
        enabled: tenantCfg.enabled,
        role_matrix: tenantCfg.role_matrix || {},
      }, { headers: auth() });
      toast.success('Tenant settings saved');
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const saveMyPrefs = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/notification-settings/me`, {
        categories: myPrefs.user_prefs || {},
      }, { headers: auth() });
      toast.success('Your preferences saved');
    } catch (e) { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const setMatrix = (role, key, value) => {
    setTenantCfg((p) => {
      const next = { ...(p.role_matrix || {}) };
      next[role] = { ...(next[role] || {}), [key]: value };
      return { ...p, role_matrix: next };
    });
  };
  const setMyPref = (key, value) => {
    setMyPrefs((p) => ({ ...p, user_prefs: { ...(p.user_prefs || {}), [key]: value } }));
  };

  if (!categories.length || !myPrefs) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="p-6 space-y-6" data-testid="notification-settings-page">
      <div>
        <h1 className="text-2xl font-semibold">Notification settings</h1>
        <p className="text-sm text-slate-500">Control which events the CRM notifies people about — in-app and email.</p>
      </div>

      {/* My preferences */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-medium flex items-center gap-2"><Bell className="h-4 w-4" /> My preferences</div>
            <div className="text-xs text-slate-500">Choose which notifications you want to receive. Categories disabled by your admin can&apos;t be turned back on here.</div>
          </div>
          <Button onClick={saveMyPrefs} disabled={saving} size="sm" className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="save-my-prefs">
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
          </Button>
        </div>
        {!myPrefs.tenant_enabled && (
          <div className="mb-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2 flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            Notifications are turned off tenant-wide. No category here will fire until an admin re-enables the module.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {categories.map((c) => {
            const roleAllowed = (myPrefs.role_matrix || {})[c.key] !== false;
            const checked = roleAllowed ? ((myPrefs.user_prefs || {})[c.key] !== false) : false;
            return (
              <label key={c.key} className={`flex items-start gap-3 rounded-md border p-3 ${roleAllowed ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/60 opacity-60'}`}>
                <Switch
                  checked={checked}
                  disabled={!roleAllowed}
                  onCheckedChange={(v) => setMyPref(c.key, v)}
                  data-testid={`my-pref-${c.key}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{c.label} {!roleAllowed && <span className="text-[10px] uppercase ml-1 text-slate-400">Disabled by admin</span>}</div>
                  <div className="text-[11px] text-slate-500">{c.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
      </Card>

      {/* Tenant matrix */}
      {isAdmin && tenantCfg && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-medium flex items-center gap-2">
                {tenantCfg.enabled ? <Bell className="h-4 w-4 text-emerald-600" /> : <BellOff className="h-4 w-4 text-slate-400" />}
                Tenant configuration <span className="text-[10px] uppercase ml-1 text-slate-400">Admin / CEO only</span>
              </div>
              <div className="text-xs text-slate-500">Turn the whole module on/off or scope categories per role.</div>
            </div>
            <Button onClick={saveTenant} disabled={saving} size="sm" className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="save-tenant">
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
            </Button>
          </div>

          <div className="flex items-center gap-3 rounded-md border bg-white p-3 mb-4">
            <Switch
              checked={!!tenantCfg.enabled}
              onCheckedChange={(v) => setTenantCfg({ ...tenantCfg, enabled: v })}
              data-testid="tenant-enabled-switch"
            />
            <div className="flex-1">
              <div className="text-sm font-medium">{tenantCfg.enabled ? 'Notifications enabled' : 'Notifications paused'}</div>
              <div className="text-[11px] text-slate-500">Global kill-switch. Turning this off mutes every category across every role.</div>
            </div>
          </div>

          {/* Role × Category matrix */}
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-2 font-semibold sticky left-0 bg-slate-50 z-10">Role</th>
                  {categories.map((c) => (
                    <th key={c.key} className="text-center p-2 font-semibold whitespace-nowrap" title={c.desc}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROLES.map((role) => {
                  const row = (tenantCfg.role_matrix || {})[role] || {};
                  return (
                    <tr key={role} className="border-t hover:bg-slate-50">
                      <td className="p-2 font-medium sticky left-0 bg-white">{role}</td>
                      {categories.map((c) => (
                        <td key={c.key} className="p-2 text-center">
                          <Checkbox
                            checked={row[c.key] !== false}
                            onCheckedChange={(v) => setMatrix(role, c.key, !!v)}
                            data-testid={`matrix-${role.replace(/\s+/g,'')}-${c.key}`}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Tick = role receives that notification category. Unticked = silenced for everyone in that role (individuals can&apos;t override).</p>
        </Card>
      )}
    </div>
  );
}
