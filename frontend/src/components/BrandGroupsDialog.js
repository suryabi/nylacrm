import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Check, ChevronDown, Layers, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const EMPTY = { name: '', code: '', description: '', account_ids: [], is_active: true };

export function BrandGroupsDialog({ open, onClose, onChanged }) {
  const [groups, setGroups] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, a] = await Promise.all([
        axios.get(`${API_URL}/api/brand-groups?include_inactive=true`, { headers: HEAD() }),
        axios.get(`${API_URL}/api/brand-groups/accounts`, { headers: HEAD() }),
      ]);
      setGroups(g.data.brand_groups || []);
      setAccounts((a.data.accounts || []).map((x) => ({ id: x.id, name: x.account_name || x.id, city: x.city })));
    } catch (e) { toast.error('Failed to load brand groups'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) { load(); setEditing(null); setForm(null); } }, [open, load]);

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (form.account_ids.length === 0) { toast.error('Add at least one member account'); return; }
    setSaving(true);
    try {
      if (editing) await axios.put(`${API_URL}/api/brand-groups/${editing.id}`, form, { headers: HEAD() });
      else await axios.post(`${API_URL}/api/brand-groups`, form, { headers: HEAD() });
      toast.success(editing ? 'Brand group updated' : 'Brand group created');
      setForm(null); setEditing(null); load(); onChanged?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); } finally { setSaving(false); }
  };

  const remove = async (g) => {
    if (!window.confirm(`Delete brand group "${g.name}"?`)) return;
    try {
      await axios.delete(`${API_URL}/api/brand-groups/${g.id}`, { headers: HEAD() });
      toast.success('Brand group deleted'); load(); onChanged?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
  };

  const toggleAccount = (id) => setForm((f) => ({ ...f, account_ids: f.account_ids.includes(id) ? f.account_ids.filter((x) => x !== id) : [...f.account_ids, id] }));
  const nameOf = (id) => accounts.find((a) => a.id === id)?.name || id;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="brand-groups-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-[#002FA7]" /> Brand Groups</DialogTitle>
          <DialogDescription>A brand group is one shared branding used by several customer accounts (e.g. a franchisor and its franchisees). Point a customer child SKU at the group and every member can receive, hold and order that branded stock.</DialogDescription>
        </DialogHeader>

        {form ? (
          <div className="space-y-4" data-testid="brand-group-form">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Chai Point Franchise" data-testid="brand-group-name-input" /></div>
              <div className="space-y-1.5"><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="auto" data-testid="brand-group-code-input" /></div>
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="brand-group-description-input" /></div>
            <div className="space-y-1.5">
              <Label>Member accounts * <span className="text-[10px] text-muted-foreground">({form.account_ids.length} selected)</span></Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal" data-testid="brand-group-accounts-select">
                    <span className="text-muted-foreground">Add / remove accounts…</span><ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}>
                    <CommandInput placeholder="Search accounts…" data-testid="brand-group-accounts-search" />
                    <CommandList className="max-h-[260px]">
                      <CommandEmpty>No accounts found.</CommandEmpty>
                      <CommandGroup>
                        {accounts.map((a) => (
                          <CommandItem key={a.id} value={`${a.name} ${a.city || ''}`} onSelect={() => toggleAccount(a.id)} data-testid={`brand-group-account-option-${a.id}`}>
                            <Check className={`mr-2 h-4 w-4 ${form.account_ids.includes(a.id) ? 'opacity-100 text-emerald-600' : 'opacity-0'}`} />
                            <span className="truncate">{a.name}</span>{a.city && <span className="ml-auto pl-2 text-[10px] text-muted-foreground">{a.city}</span>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <div className="flex flex-wrap gap-1.5 pt-1" data-testid="brand-group-members">
                {form.account_ids.map((id) => (
                  <Badge key={id} variant="outline" className="gap-1 bg-slate-50 font-normal">{nameOf(id)}<button type="button" onClick={() => toggleAccount(id)} data-testid={`brand-group-remove-${id}`}><X className="h-3 w-3" /></button></Badge>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setForm(null); setEditing(null); }} data-testid="brand-group-cancel-btn">Cancel</Button>
              <Button onClick={save} disabled={saving} className="bg-[#002FA7] hover:bg-[#002FA7]/90 text-white" data-testid="brand-group-save-btn">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Save changes' : 'Create group'}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setEditing(null); setForm({ ...EMPTY }); }} className="bg-[#002FA7] hover:bg-[#002FA7]/90 text-white" data-testid="add-brand-group-btn"><Plus className="h-4 w-4 mr-1" /> New brand group</Button>
            </div>
            {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
              : groups.length === 0 ? <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground" data-testid="no-brand-groups">No brand groups yet.</div>
                : (
                  <div className="divide-y rounded-lg border">
                    {groups.map((g) => (
                      <div key={g.id} className={`flex items-start justify-between gap-3 px-3 py-2.5 ${g.is_active === false ? 'opacity-50' : ''}`} data-testid={`brand-group-row-${g.id}`}>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{g.name}</span>
                            <span className="rounded border bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{g.code}</span>
                            <Badge variant="outline" className="text-[10px]">{g.accounts?.length || 0} accounts</Badge>
                            <Badge variant="outline" className="text-[10px]">{g.child_sku_count || 0} child SKUs</Badge>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{(g.accounts || []).map((a) => a.account_name).join(', ')}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(g); setForm({ name: g.name, code: g.code || '', description: g.description || '', account_ids: g.account_ids || [], is_active: g.is_active !== false }); }} data-testid={`edit-brand-group-${g.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => remove(g)} data-testid={`delete-brand-group-${g.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default BrandGroupsDialog;
