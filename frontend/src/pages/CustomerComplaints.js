import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '../components/ui/popover';
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '../components/ui/command';
import {
  MessageSquareWarning, Plus, Search, Loader2, ChevronLeft, ChevronRight,
  Paperclip, MessageSquare, ChevronsUpDown, Check, X,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export const PRIORITY_STYLES = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-800',
  urgent: 'bg-rose-100 text-rose-700',
};
export const STATUS_STYLES = {
  open: 'bg-emerald-100 text-emerald-700',
  in_progress: 'bg-blue-100 text-blue-700',
  awaiting_customer: 'bg-amber-100 text-amber-800',
  resolved: 'bg-teal-100 text-teal-700',
  closed: 'bg-slate-200 text-slate-600',
};
export const LABEL = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function CustomerComplaints() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ data: [], total: 0, total_pages: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [options, setOptions] = useState({ statuses: [], priorities: [], categories: [], users: [] });
  const [showCreate, setShowCreate] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, page_size: 20 });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      const res = await axios.get(`${API}/complaints?${params}`, { headers: HEAD() });
      setData(res.data);
    } catch (e) {
      toast.error('Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, priorityFilter, categoryFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => {
    axios.get(`${API}/complaints/meta/options`, { headers: HEAD() })
      .then((r) => setOptions(r.data)).catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-sm">
            <MessageSquareWarning className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800">Issues</h1>
            <p className="text-sm text-slate-500">{data.total} issue{data.total === 1 ? '' : 's'} tracked</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-rose-600 hover:bg-rose-700" data-testid="new-complaint-btn">
          <Plus className="h-4 w-4 mr-2" /> New Issue
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by number, title, customer, SKU…"
              className="pl-8 h-9"
              data-testid="complaints-search"
            />
          </div>
          <FilterSelect value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }}
            options={options.statuses} placeholder="Status" testid="filter-status" />
          <FilterSelect value={priorityFilter} onChange={(v) => { setPriorityFilter(v); setPage(1); }}
            options={options.priorities} placeholder="Priority" testid="filter-priority" />
          <FilterSelect value={categoryFilter} onChange={(v) => { setCategoryFilter(v); setPage(1); }}
            options={options.categories} placeholder="Category" testid="filter-category" />
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : data.data.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <MessageSquareWarning className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>No issues found</p>
              <p className="text-sm">Click "New Issue" to log one.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="complaints-table">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left p-3 font-medium">Issue</th>
                    <th className="text-left p-3 font-medium">Customer</th>
                    <th className="text-left p-3 font-medium">SKUs</th>
                    <th className="text-center p-3 font-medium">Category</th>
                    <th className="text-center p-3 font-medium">Priority</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Assigned</th>
                    <th className="text-center p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((c) => (
                    <tr key={c.id}
                      className="border-b hover:bg-rose-50/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/complaints/${c.id}`)}
                      data-testid={`complaint-row-${c.id}`}>
                      <td className="p-3">
                        <p className="font-medium text-slate-800">{c.title}</p>
                        <p className="text-xs text-muted-foreground">{c.complaint_number}</p>
                      </td>
                      <td className="p-3">
                        {c.customer_name || <span className="text-muted-foreground">-</span>}
                        {c.link_type && <span className="block text-[11px] text-muted-foreground capitalize">{c.link_type}</span>}
                      </td>
                      <td className="p-3 max-w-[180px]">
                        <span className="text-xs text-slate-600 line-clamp-1">{(c.sku_names || []).join(', ') || '-'}</span>
                      </td>
                      <td className="p-3 text-center"><span className="text-xs capitalize">{c.category}</span></td>
                      <td className="p-3 text-center"><Badge className={PRIORITY_STYLES[c.priority]}>{LABEL(c.priority)}</Badge></td>
                      <td className="p-3 text-center"><Badge className={STATUS_STYLES[c.status]}>{LABEL(c.status)}</Badge></td>
                      <td className="p-3 text-xs text-slate-600">{c.assigned_to_name || <span className="text-muted-foreground">Unassigned</span>}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                          {c.photo_count > 0 && <span className="flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{c.photo_count}</span>}
                          {c.comment_count > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{c.comment_count}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data.total_pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="complaints-prev">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {data.total_pages}</span>
          <Button variant="outline" size="sm" disabled={page >= data.total_pages} onClick={() => setPage(p => p + 1)} data-testid="complaints-next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {showCreate && (
        <CreateComplaintDialog
          options={options}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); navigate(`/complaints/${id}`); }}
        />
      )}
    </div>
  );
}

const FilterSelect = ({ value, onChange, options, placeholder, testid }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="h-9 w-[150px]" data-testid={testid}><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent>
      <SelectItem value="all">All {placeholder}</SelectItem>
      {(options || []).map((o) => <SelectItem key={o} value={o}>{LABEL(o)}</SelectItem>)}
    </SelectContent>
  </Select>
);

// ── Entity (Lead/Account/Distributor) autocomplete picker ──
const EntityPicker = ({ linkType, value, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!linkType) return;
    setLoading(true);
    const t = setTimeout(() => {
      axios.get(`${API}/complaints/meta/entity-search`, { headers: HEAD(), params: { link_type: linkType, q } })
        .then((r) => setResults(r.data.results || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [linkType, q, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal" data-testid="complaint-entity-picker">
          <span className="truncate">{value?.name || `Search ${linkType}…`}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder={`Search ${linkType}…`} data-testid="complaint-entity-search" />
          <CommandList>
            {loading ? (
              <div className="py-6 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : (
              <>
                <CommandEmpty>No {linkType} found.</CommandEmpty>
                <CommandGroup>
                  {results.map((r) => (
                    <CommandItem key={r.id} value={r.id} onSelect={() => { onSelect(r); setOpen(false); }}
                      data-testid={`entity-option-${r.id}`}>
                      <Check className={`mr-2 h-4 w-4 ${value?.id === r.id ? 'opacity-100' : 'opacity-0'}`} />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{r.name}</p>
                        {r.subtitle && <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

// ── SKU multi-select ──
const SkuMultiSelect = ({ skus, selectedIds, onToggle }) => {
  const [open, setOpen] = useState(false);
  const label = selectedIds.length === 0 ? 'Select SKUs…'
    : `${selectedIds.length} SKU${selectedIds.length === 1 ? '' : 's'} selected`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal" data-testid="complaint-sku-picker">
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search SKU…" data-testid="complaint-sku-search" />
          <CommandList className="max-h-[260px]">
            <CommandEmpty>No SKUs found.</CommandEmpty>
            <CommandGroup>
              {skus.map((s) => {
                const name = s.name || s.sku_name;
                const checked = selectedIds.includes(s.id);
                return (
                  <CommandItem key={s.id} value={name} onSelect={() => onToggle(s)} data-testid={`sku-option-${s.id}`}>
                    <Check className={`mr-2 h-4 w-4 ${checked ? 'opacity-100 text-rose-600' : 'opacity-0'}`} />
                    {name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const CreateComplaintDialog = ({ options, onClose, onCreated }) => {
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [linkType, setLinkType] = useState('account');
  const [entity, setEntity] = useState(null);
  const [skus, setSkus] = useState([]);
  const [selectedSkus, setSelectedSkus] = useState([]); // [{id,name}]
  const [category, setCategory] = useState('quality');
  const [priority, setPriority] = useState('medium');
  const [assignedTo, setAssignedTo] = useState('');

  useEffect(() => {
    axios.get(`${API}/master-skus`, { headers: HEAD() })
      .then((r) => setSkus(r.data.skus || r.data || [])).catch(() => {});
  }, []);

  const toggleSku = (s) => {
    const name = s.name || s.sku_name;
    setSelectedSkus((prev) => prev.find((x) => x.id === s.id)
      ? prev.filter((x) => x.id !== s.id)
      : [...prev, { id: s.id, name }]);
  };

  const submit = async () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      const assignedUser = options.users?.find((u) => u.id === assignedTo);
      const payload = {
        title, details, link_type: linkType,
        customer_name: entity?.name || null,
        [`${linkType}_id`]: entity?.id || null,
        sku_ids: selectedSkus.map((s) => s.id),
        sku_names: selectedSkus.map((s) => s.name),
        category, priority,
        assigned_to: assignedTo || null,
        assigned_to_name: assignedUser?.name || null,
      };
      const res = await axios.post(`${API}/complaints`, payload, { headers: HEAD() });
      toast.success('Issue created');
      onCreated(res.data.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create issue');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="create-complaint-dialog">
        <DialogHeader><DialogTitle>New Issue</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary of the issue" data-testid="complaint-title-input" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Linked to</Label>
              <Select value={linkType} onValueChange={(v) => { setLinkType(v); setEntity(null); }}>
                <SelectTrigger data-testid="complaint-linktype-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="account">Account</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="distributor">Distributor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="capitalize">{linkType}</Label>
              <EntityPicker linkType={linkType} value={entity} onSelect={setEntity} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Affected SKUs</Label>
            <SkuMultiSelect skus={skus} selectedIds={selectedSkus.map((s) => s.id)} onToggle={toggleSku} />
            {selectedSkus.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selectedSkus.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-full pl-2 pr-1 py-0.5">
                    {s.name}
                    <button onClick={() => setSelectedSkus((p) => p.filter((x) => x.id !== s.id))} className="hover:text-rose-900"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="complaint-category-select"><SelectValue /></SelectTrigger>
                <SelectContent>{(options.categories || []).map((c) => <SelectItem key={c} value={c}>{LABEL(c)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="complaint-priority-select"><SelectValue /></SelectTrigger>
                <SelectContent>{(options.priorities || []).map((p) => <SelectItem key={p} value={p}>{LABEL(p)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Assign to</Label>
            <Select value={assignedTo || 'unassigned'} onValueChange={(v) => setAssignedTo(v === 'unassigned' ? '' : v)}>
              <SelectTrigger data-testid="complaint-assign-select"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent className="max-h-[260px]">
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {(options.users || []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}{u.role ? ` · ${u.role}` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Details</Label>
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={4} placeholder="Describe the issue in detail…" data-testid="complaint-details-input" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-rose-600 hover:bg-rose-700" data-testid="complaint-save-btn">
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
