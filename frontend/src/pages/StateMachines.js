import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Trash2, GitBranch, Save, Copy, ArrowLeft, RefreshCw, ChevronRight, Settings2, Sparkles } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import AppBreadcrumb from '../components/AppBreadcrumb';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const blankSM = () => ({
  name: '',
  code: '',
  description: '',
  states: [
    { key: 'submitted', label: 'Submitted', color: '#94a3b8', is_initial: true, is_terminal: false },
    { key: 'closed', label: 'Closed', color: '#16a34a', is_initial: false, is_terminal: true },
  ],
  actions: [],
  transitions: [],
  applied_to: [],
});

export default function StateMachines() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // current state machine being edited (null = list view)
  const [actionCatalog, setActionCatalog] = useState([]);
  const [workflowCatalog, setWorkflowCatalog] = useState([]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [smRes, actRes, wfRes, usrRes, deptRes, rolesRes] = await Promise.all([
        axios.get(`${API}/state-machines/`, { headers: authHeaders() }),
        axios.get(`${API}/state-machines/actions/catalog`, { headers: authHeaders() }),
        axios.get(`${API}/state-machines/workflows/catalog`, { headers: authHeaders() }),
        axios.get(`${API}/users`, { headers: authHeaders() }).catch(() => ({ data: [] })),
        axios.get(`${API}/master-departments`, { headers: authHeaders() }).catch(() => ({ data: { departments: [] } })),
        axios.get(`${API}/state-machines/roles/catalog`, { headers: authHeaders() }).catch(() => ({ data: { roles: [] } })),
      ]);
      setList(smRes.data || []);
      setActionCatalog(actRes.data?.actions || []);
      setWorkflowCatalog(wfRes.data?.workflows || []);
      setUsers(Array.isArray(usrRes.data) ? usrRes.data : (usrRes.data?.users || []));
      setDepartments(Array.isArray(deptRes.data) ? deptRes.data : (deptRes.data?.departments || []));
      setRoles(rolesRes.data?.roles || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load state machines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const createNew = () => setEditing(blankSM());

  const openExisting = (sm) => setEditing(JSON.parse(JSON.stringify(sm)));

  const cancelEdit = () => setEditing(null);

  const save = async () => {
    try {
      if (!editing.name?.trim()) {
        toast.error('Name is required');
        return;
      }
      const body = {
        name: editing.name.trim(),
        code: editing.code || null,
        description: editing.description || '',
        states: editing.states,
        transitions: editing.transitions,
        applied_to: editing.applied_to,
      };
      let saved;
      if (editing.id) {
        saved = await axios.put(`${API}/state-machines/${editing.id}`, body, { headers: authHeaders() });
      } else {
        saved = await axios.post(`${API}/state-machines/`, body, { headers: authHeaders() });
      }
      toast.success('Saved ✔');
      setEditing(saved.data);
      await loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    }
  };

  const clone = async (sm) => {
    const name = window.prompt('Name for the cloned state machine:', `${sm.name} (copy)`);
    if (!name) return;
    try {
      await axios.post(`${API}/state-machines/${sm.id}/clone`, { name }, { headers: authHeaders() });
      toast.success('Cloned ✔');
      await loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Clone failed');
    }
  };

  const remove = async (sm) => {
    if (!window.confirm(`Delete state machine "${sm.name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/state-machines/${sm.id}`, { headers: authHeaders() });
      toast.success('Deleted');
      await loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Delete failed');
    }
  };

  if (loading) {
    return <div className="p-6 flex items-center gap-2 text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  if (editing) {
    return (
      <StateMachineEditor
        sm={editing}
        setSm={setEditing}
        onSave={save}
        onCancel={cancelEdit}
        actionCatalog={actionCatalog}
        workflowCatalog={workflowCatalog}
        users={users}
        departments={departments}
        roles={roles}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto" data-testid="state-machines-page">
      <AppBreadcrumb items={[{ label: 'Admin', to: '/admin' }, { label: 'State Machines' }]} />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">State Machines</h1>
            <p className="text-sm text-slate-500">Reusable workflow definitions you can attach to CRM modules.</p>
          </div>
        </div>
        <Button onClick={createNew} data-testid="create-state-machine-btn">
          <Plus className="h-4 w-4 mr-2" /> New State Machine
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
          <div className="col-span-4">Name</div>
          <div className="col-span-2">States</div>
          <div className="col-span-2">Transitions</div>
          <div className="col-span-3">Attached to</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        {list.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-500">
            No state machines yet. Click "New State Machine" to create your first one.
          </div>
        )}
        {list.map((sm) => (
          <div key={sm.id} className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 text-sm items-center">
            <div className="col-span-4">
              <button onClick={() => openExisting(sm)} className="font-medium text-blue-700 hover:underline text-left" data-testid={`state-machine-${sm.id}-open`}>
                {sm.name}
              </button>
              {sm.description && <p className="text-xs text-slate-500 mt-0.5">{sm.description}</p>}
            </div>
            <div className="col-span-2">
              <Badge variant="outline">{(sm.states || []).length}</Badge>
            </div>
            <div className="col-span-2">
              <Badge variant="outline">{(sm.transitions || []).length}</Badge>
            </div>
            <div className="col-span-3 flex flex-wrap gap-1">
              {(sm.applied_to || []).length === 0 ? (
                <span className="text-xs italic text-slate-400">Not attached</span>
              ) : (
                (sm.applied_to || []).map((w) => (
                  <Badge key={w} variant="outline" className="text-[10px]">{w}</Badge>
                ))
              )}
            </div>
            <div className="col-span-1 flex justify-end gap-1">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => clone(sm)} title="Clone" data-testid={`state-machine-${sm.id}-clone`}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => remove(sm)} title="Delete" data-testid={`state-machine-${sm.id}-delete`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Editor
// ───────────────────────────────────────────────────────────────────────────
function StateMachineEditor({ sm, setSm, onSave, onCancel, actionCatalog, workflowCatalog, users, departments, roles }) {
  const stateKeys = useMemo(() => (sm.states || []).map((s) => s.key), [sm.states]);
  const [expandedTxn, setExpandedTxn] = useState(null);

  const addState = () => {
    const key = `state_${(sm.states || []).length + 1}`;
    setSm({ ...sm, states: [...(sm.states || []), { key, label: 'New state', color: '#94a3b8', is_initial: false, is_terminal: false }] });
  };
  const updateState = (idx, patch) => {
    const next = [...sm.states];
    next[idx] = { ...next[idx], ...patch };
    setSm({ ...sm, states: next });
  };
  const removeState = (idx) => {
    const next = [...sm.states];
    next.splice(idx, 1);
    setSm({ ...sm, states: next });
  };

  const addTransition = () => {
    const firstAction = (sm.actions || [])[0];
    setSm({
      ...sm,
      transitions: [
        ...(sm.transitions || []),
        {
          action_key: firstAction?.key || '',
          action_label: '',
          from_state: '',
          to_state: stateKeys[0] || '',
          auto_assign_mode: '',
          auto_assign_user_id: '',
          auto_assign_department_id: '',
          auto_assign_role: '',
          notify_all: true,
          comment_required: false,
          allowed_role_keys: [],
          allowed_department_ids: [],
          requestor_only: false,
        },
      ],
    });
  };
  const updateTransition = (idx, patch) => {
    const next = [...sm.transitions];
    next[idx] = { ...next[idx], ...patch };
    setSm({ ...sm, transitions: next });
  };
  const removeTransition = (idx) => {
    const next = [...sm.transitions];
    next.splice(idx, 1);
    setSm({ ...sm, transitions: next });
  };

  // ── Actions (per-workflow vocabulary) ──────────────────────────────
  const addAction = (preset) => {
    const cur = sm.actions || [];
    const baseKey = preset?.key || `action_${cur.length + 1}`;
    let key = baseKey;
    let n = 2;
    const taken = new Set(cur.map((a) => a.key));
    while (taken.has(key)) { key = `${baseKey}_${n++}`; }
    const action = {
      key,
      label: preset?.label || 'New action',
      description: preset?.description || '',
      kind: preset?.kind || 'neutral',
    };
    setSm({ ...sm, actions: [...cur, action] });
  };
  const updateAction = (idx, patch) => {
    const oldKey = sm.actions[idx]?.key;
    const next = [...sm.actions];
    next[idx] = { ...next[idx], ...patch };
    // If the key changed, propagate to transitions
    let transitions = sm.transitions;
    if (patch.key && patch.key !== oldKey) {
      transitions = (transitions || []).map((t) =>
        t.action_key === oldKey ? { ...t, action_key: patch.key } : t,
      );
    }
    setSm({ ...sm, actions: next, transitions });
  };
  const removeAction = (idx) => {
    const a = sm.actions[idx];
    const used = (sm.transitions || []).filter((t) => t.action_key === a.key);
    if (used.length > 0) {
      toast.error(`Cannot delete "${a.label}" — used by ${used.length} transition(s). Remove the transitions first.`);
      return;
    }
    const next = [...sm.actions];
    next.splice(idx, 1);
    setSm({ ...sm, actions: next });
  };

  const toggleApplied = (wfKey, checked) => {
    const cur = sm.applied_to || [];
    setSm({ ...sm, applied_to: checked ? [...cur.filter((w) => w !== wfKey), wfKey] : cur.filter((w) => w !== wfKey) });
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto" data-testid="state-machine-editor">
      <AppBreadcrumb items={[{ label: 'Admin', to: '/admin' }, { label: 'State Machines', to: '/admin/state-machines' }, { label: sm.name || 'New' }]} />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" onClick={onCancel} data-testid="cancel-editor"><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
        <Button onClick={onSave} data-testid="save-state-machine"><Save className="h-4 w-4 mr-2" /> Save</Button>
      </div>

      <Card className="p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 space-y-1">
            <Label className="text-xs">Name *</Label>
            <Input value={sm.name} onChange={(e) => setSm({ ...sm, name: e.target.value })} placeholder="Marketing Request Lifecycle" data-testid="sm-name-input" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Code <span className="text-slate-400">(optional)</span></Label>
            <Input value={sm.code || ''} onChange={(e) => setSm({ ...sm, code: e.target.value })} placeholder="MARK_REQ_v1" data-testid="sm-code-input" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Description</Label>
          <Textarea rows={2} value={sm.description || ''} onChange={(e) => setSm({ ...sm, description: e.target.value })} placeholder="What this state machine governs..." data-testid="sm-description-input" />
        </div>
      </Card>

      {/* States */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">States</h2>
          <Button size="sm" variant="outline" onClick={addState} data-testid="add-state-btn"><Plus className="h-3.5 w-3.5 mr-1" /> Add state</Button>
        </div>
        <div className="rounded-md border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
            <div className="col-span-3">Key</div>
            <div className="col-span-4">Label</div>
            <div className="col-span-2">Color</div>
            <div className="col-span-1 text-center">Initial</div>
            <div className="col-span-1 text-center">Terminal</div>
            <div className="col-span-1 text-right">—</div>
          </div>
          {(sm.states || []).map((st, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0 items-center">
              <div className="col-span-3"><Input value={st.key} onChange={(e) => updateState(idx, { key: e.target.value.replace(/\s+/g, '_').toLowerCase() })} className="h-8 text-xs font-mono" data-testid={`state-key-${idx}`} /></div>
              <div className="col-span-4"><Input value={st.label} onChange={(e) => updateState(idx, { label: e.target.value })} className="h-8 text-xs" data-testid={`state-label-${idx}`} /></div>
              <div className="col-span-2">
                <input type="color" value={st.color || '#94a3b8'} onChange={(e) => updateState(idx, { color: e.target.value })} className="h-8 w-full rounded border border-slate-200" />
              </div>
              <div className="col-span-1 flex justify-center"><Checkbox checked={!!st.is_initial} onCheckedChange={(v) => updateState(idx, { is_initial: !!v })} /></div>
              <div className="col-span-1 flex justify-center"><Checkbox checked={!!st.is_terminal} onCheckedChange={(v) => updateState(idx, { is_terminal: !!v })} /></div>
              <div className="col-span-1 flex justify-end">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => removeState(idx)} title="Delete state"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Actions (per-workflow action vocabulary) */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-base font-semibold">Actions</h2>
            <p className="text-xs text-slate-500 mt-0.5">Verbs the user can take in this workflow. Transitions reference these.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => addAction()} data-testid="add-action-btn"><Plus className="h-3.5 w-3.5 mr-1" /> Add action</Button>
            <div className="relative group">
              <Button size="sm" variant="ghost" data-testid="suggested-actions-btn"><Sparkles className="h-3.5 w-3.5 mr-1" /> Quick add</Button>
              <div className="absolute right-0 mt-1 w-64 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg z-30 hidden group-hover:block">
                {(actionCatalog || []).map((a) => {
                  const taken = (sm.actions || []).some((x) => x.key === a.key);
                  return (
                    <button
                      key={a.key}
                      type="button"
                      disabled={taken}
                      onClick={() => addAction(a)}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed`}
                      data-testid={`suggested-action-${a.key}`}
                    >
                      <div className="font-medium">{a.label}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{a.key}{taken ? ' · added' : ''}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-md border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
            <div className="col-span-3">Key</div>
            <div className="col-span-3">Label</div>
            <div className="col-span-4">Description</div>
            <div className="col-span-1">Kind</div>
            <div className="col-span-1 text-right">—</div>
          </div>
          {(sm.actions || []).length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-slate-400 italic">
              No actions defined yet. Click "Add action" or "Quick add" to pick from suggested verbs.
            </div>
          )}
          {(sm.actions || []).map((a, idx) => {
            const useCount = (sm.transitions || []).filter((t) => t.action_key === a.key).length;
            return (
              <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0 items-center">
                <div className="col-span-3">
                  <Input
                    value={a.key}
                    onChange={(e) => updateAction(idx, { key: e.target.value.replace(/\s+/g, '_').toLowerCase() })}
                    className="h-8 text-xs font-mono"
                    data-testid={`action-key-${idx}`}
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    value={a.label}
                    onChange={(e) => updateAction(idx, { label: e.target.value })}
                    className="h-8 text-xs"
                    data-testid={`action-label-${idx}`}
                  />
                </div>
                <div className="col-span-4">
                  <Input
                    value={a.description || ''}
                    onChange={(e) => updateAction(idx, { description: e.target.value })}
                    placeholder="(optional tooltip)"
                    className="h-8 text-xs"
                    data-testid={`action-description-${idx}`}
                  />
                </div>
                <div className="col-span-1">
                  <select
                    value={a.kind || 'neutral'}
                    onChange={(e) => updateAction(idx, { kind: e.target.value })}
                    className="w-full h-8 text-xs border border-slate-200 rounded px-2"
                    data-testid={`action-kind-${idx}`}
                  >
                    <option value="positive">Positive</option>
                    <option value="neutral">Neutral</option>
                    <option value="negative">Negative</option>
                  </select>
                </div>
                <div className="col-span-1 flex items-center justify-end gap-1">
                  {useCount > 0 && (
                    <span className="text-[10px] text-slate-400" title={`Used by ${useCount} transition(s)`}>{useCount}×</span>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => removeAction(idx)} title="Delete action"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Transitions */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Transitions</h2>
          <Button size="sm" variant="outline" onClick={addTransition} data-testid="add-transition-btn"><Plus className="h-3.5 w-3.5 mr-1" /> Add transition</Button>
        </div>
        <div className="rounded-md border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
            <div className="col-span-2">Action</div>
            <div className="col-span-2">Display label</div>
            <div className="col-span-2">From state</div>
            <div className="col-span-1 flex justify-center"><ChevronRight className="h-3 w-3" /></div>
            <div className="col-span-2">Result state</div>
            <div className="col-span-2">Auto-assign</div>
            <div className="col-span-1 text-right">—</div>
          </div>
          {(sm.transitions || []).map((t, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0 items-start">
              <div className="col-span-2">
                <select
                  value={t.action_key}
                  onChange={(e) => updateTransition(idx, { action_key: e.target.value })}
                  className="w-full h-8 text-xs border border-slate-200 rounded px-2"
                  data-testid={`transition-action-${idx}`}
                >
                  {(sm.actions || []).length === 0 && <option value="">— define an action first —</option>}
                  {(sm.actions || []).map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </div>
              <div className="col-span-2"><Input value={t.action_label || ''} onChange={(e) => updateTransition(idx, { action_label: e.target.value })} placeholder="(use action label)" className="h-8 text-xs" /></div>
              <div className="col-span-2">
                <select value={t.from_state || ''} onChange={(e) => updateTransition(idx, { from_state: e.target.value || null })} className="w-full h-8 text-xs border border-slate-200 rounded px-2">
                  <option value="">(initial)</option>
                  {(sm.states || []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div className="col-span-1 flex justify-center pt-1.5"><ChevronRight className="h-3.5 w-3.5 text-slate-400" /></div>
              <div className="col-span-2">
                <select value={t.to_state} onChange={(e) => updateTransition(idx, { to_state: e.target.value })} className="w-full h-8 text-xs border border-slate-200 rounded px-2">
                  {(sm.states || []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <select
                  value={t.auto_assign_mode || ''}
                  onChange={(e) => {
                    const mode = e.target.value;
                    updateTransition(idx, {
                      auto_assign_mode: mode,
                      // Clear the other two targets when switching modes
                      auto_assign_user_id: mode === 'user' ? (t.auto_assign_user_id || '') : '',
                      auto_assign_department_id: mode === 'department' ? (t.auto_assign_department_id || '') : '',
                      auto_assign_role: mode === 'role' ? (t.auto_assign_role || '') : '',
                    });
                  }}
                  className="w-full h-8 text-xs border border-slate-200 rounded px-2"
                  data-testid={`auto-assign-mode-${idx}`}
                >
                  <option value="">No auto-assign</option>
                  <option value="user">Assign to User</option>
                  <option value="department">Assign to Department</option>
                  <option value="role">Assign to Role</option>
                </select>
                {t.auto_assign_mode === 'user' && (
                  <select
                    value={t.auto_assign_user_id || ''}
                    onChange={(e) => updateTransition(idx, { auto_assign_user_id: e.target.value })}
                    className="w-full h-8 text-xs border border-slate-200 rounded px-2"
                    data-testid={`auto-assign-user-${idx}`}
                  >
                    <option value="">— pick a user —</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                  </select>
                )}
                {t.auto_assign_mode === 'department' && (
                  <select
                    value={t.auto_assign_department_id || ''}
                    onChange={(e) => updateTransition(idx, { auto_assign_department_id: e.target.value })}
                    className="w-full h-8 text-xs border border-slate-200 rounded px-2"
                    data-testid={`auto-assign-department-${idx}`}
                  >
                    <option value="">— pick a department —</option>
                    {departments.map((d) => <option key={d.id || d.code} value={d.id || d.code}>{d.name || d.label || d.id}</option>)}
                  </select>
                )}
                {t.auto_assign_mode === 'role' && (
                  <select
                    value={t.auto_assign_role || ''}
                    onChange={(e) => updateTransition(idx, { auto_assign_role: e.target.value })}
                    className="w-full h-8 text-xs border border-slate-200 rounded px-2"
                    data-testid={`auto-assign-role-${idx}`}
                  >
                    <option value="">— pick a role —</option>
                    {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                )}
                {t.auto_assign_mode && (
                  <p className="text-[10px] text-slate-400">Only one of User / Department / Role can be set.</p>
                )}
              </div>
              <div className="col-span-1 flex justify-end pt-1 gap-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => setExpandedTxn(expandedTxn === idx ? null : idx)}
                  title="Permissions & options"
                  data-testid={`transition-options-${idx}`}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => removeTransition(idx)} title="Delete transition"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              {expandedTxn === idx && (
                <div className="col-span-12 mt-2 -mx-3 -mb-2 px-3 py-3 bg-slate-50 border-t border-slate-200 space-y-2 text-xs">
                  <div className="font-medium text-slate-700">Options for "{t.action_label || t.action_key}" → {(sm.states || []).find(s => s.key === t.to_state)?.label || t.to_state}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={!!t.requestor_only}
                        onCheckedChange={(v) => updateTransition(idx, { requestor_only: !!v })}
                        data-testid={`txn-requestor-only-${idx}`}
                      />
                      <span>Requestor only (only the doc creator can trigger)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={!!t.comment_required}
                        onCheckedChange={(v) => updateTransition(idx, { comment_required: !!v })}
                        data-testid={`txn-comment-required-${idx}`}
                      />
                      <span>Comment required when triggering</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-slate-500 mb-1">Allowed roles (empty = anyone)</div>
                      <select
                        multiple
                        value={t.allowed_role_keys || []}
                        onChange={(e) => updateTransition(idx, { allowed_role_keys: Array.from(e.target.selectedOptions).map(o => o.value) })}
                        className="w-full text-[11px] border border-slate-200 rounded px-1 py-0.5"
                        size={Math.min(roles.length || 1, 6)}
                        data-testid={`txn-allowed-roles-${idx}`}
                      >
                        {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="text-slate-500 mb-1">Allowed departments (empty = anyone)</div>
                      <select
                        multiple
                        value={t.allowed_department_ids || []}
                        onChange={(e) => updateTransition(idx, { allowed_department_ids: Array.from(e.target.selectedOptions).map(o => o.value) })}
                        className="w-full text-[11px] border border-slate-200 rounded px-1 py-0.5"
                        size={Math.min(departments.length || 1, 6)}
                        data-testid={`txn-allowed-departments-${idx}`}
                      >
                        {departments.map((d) => <option key={d.id || d.code} value={d.id || d.code}>{d.name || d.label || d.id}</option>)}
                      </select>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">Admins (CEO / Director / Admin) always bypass these gates. Ctrl/⌘+click to multi-select.</p>
                </div>
              )}
            </div>
          ))}
          {(sm.transitions || []).length === 0 && (
            <div className="p-4 text-center text-sm text-slate-500">No transitions yet. Click "Add transition" to wire up the workflow.</div>
          )}
        </div>
      </Card>

      {/* Attach to workflows */}
      <Card className="p-5 space-y-2">
        <h2 className="text-base font-semibold">Attach to Workflows</h2>
        <p className="text-xs text-slate-500">
          Pick which CRM modules should use this state machine. (Runtime consumption ships in Phase B — for now this records the intent.)
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-1">
          {workflowCatalog.map((wf) => (
            <label key={wf.key} className="flex items-center gap-2 text-sm cursor-pointer rounded border border-slate-200 px-3 py-2 hover:bg-slate-50">
              <Checkbox checked={(sm.applied_to || []).includes(wf.key)} onCheckedChange={(v) => toggleApplied(wf.key, !!v)} />
              <span>{wf.label}</span>
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}
