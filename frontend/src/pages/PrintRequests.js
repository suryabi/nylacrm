import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { format, parseISO, isValid } from 'date-fns';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Printer, Search, ChevronLeft, ChevronRight, ChevronDown, Tag, Calendar, Package,
  Users, Building2, Loader2, X, MapPin, Download, Trash2,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { useAuth } from '../context/AuthContext';

const ADMIN_ROLES = ['ceo', 'director', 'admin', 'system admin', 'system_admin', 'owner'];

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const fmtDate = (s) => { try { const d = parseISO(s); return isValid(d) ? format(d, 'MMM d, yyyy') : '—'; } catch { return '—'; } };
const statusStyle = (color) => ({ color: color || '#64748b', borderColor: (color || '#64748b') + '55', backgroundColor: (color || '#64748b') + '14' });

// Group rows by the lead's city; cities alphabetical, "No City" last.
const groupByCity = (rows) => {
  const map = new Map();
  (rows || []).forEach((r) => {
    const c = (r.lead_city || '').trim() || 'No City';
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(r);
  });
  return [...map.entries()].sort((a, b) => {
    if (a[0] === 'No City') return 1;
    if (b[0] === 'No City') return -1;
    return a[0].localeCompare(b[0]);
  });
};

const CityGroupHeader = ({ name, count, collapsed, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className="w-full flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 border border-emerald-700/20 px-4 py-3 shadow-sm hover:from-emerald-700 hover:to-teal-700 transition-colors"
    data-testid={`print-city-group-${name}`}
  >
    <ChevronDown className={`h-5 w-5 text-white/90 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
    <MapPin className="h-5 w-5 text-emerald-100 shrink-0" />
    <span className="text-base font-bold text-white tracking-tight">{name}</span>
    <span className="text-xs font-bold text-white bg-white/20 border border-white/30 rounded-full px-2 py-0.5">{count}</span>
  </button>
);

export default function PrintRequests() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [statuses, setStatuses] = useState([]);
  const [data, setData] = useState({ items: [], total: 0, pages: 0 });
  const [facets, setFacets] = useState({ status_counts: {}, total: 0, cities: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(sp.get('q') || '');
  const [statusIds, setStatusIds] = useState(() => (sp.get('status') || '').split(',').filter(Boolean));
  const [city, setCity] = useState(sp.get('city') || '');
  const [page, setPage] = useState(parseInt(sp.get('p') || '1'));

  useEffect(() => {
    axios.get(`${API}/print-request-statuses`, { headers: HEAD() })
      .then((r) => setStatuses(r.data?.statuses || []))
      .catch(() => {});
  }, []);

  // Facets (tile counts + city list) reflect search + city, not the status selection.
  const fetchFacets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (city) params.set('city', city);
      const { data } = await axios.get(`${API}/print-requests/facets?${params}`, { headers: HEAD() });
      setFacets(data || { status_counts: {}, total: 0, cities: [] });
    } catch { /* non-blocking */ }
  }, [search, city]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '200' });
      if (search) params.set('search', search);
      if (statusIds.length) params.set('status_ids', statusIds.join(','));
      if (city) params.set('city', city);
      const { data } = await axios.get(`${API}/print-requests?${params}`, { headers: HEAD() });
      setData(data || { items: [], total: 0, pages: 0 });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load print requests');
    } finally { setLoading(false); }
  }, [page, search, statusIds, city]);

  useEffect(() => {
    const t = setTimeout(fetchList, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [fetchList, search]);

  useEffect(() => {
    const t = setTimeout(fetchFacets, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [fetchFacets, search]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set('q', search);
    if (statusIds.length) next.set('status', statusIds.join(','));
    if (city) next.set('city', city);
    if (page > 1) next.set('p', String(page));
    setSp(next, { replace: true });
  }, [search, statusIds, city, page, setSp]);

  const toggleStatus = (id) => {
    setStatusIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setPage(1);
  };

  const items = data.items || [];
  const hasFilters = search || statusIds.length > 0 || city;
  const [collapsedCities, setCollapsedCities] = useState(new Set());
  const toggleCity = (c) => setCollapsedCities((prev) => {
    const n = new Set(prev);
    if (n.has(c)) n.delete(c); else n.add(c);
    return n;
  });

  const [exporting, setExporting] = useState(false);
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes((user?.role || '').toLowerCase());
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/print-requests/${toDelete.id}`, { headers: HEAD() });
      toast.success(`Deleted ${toDelete.print_number}`);
      setToDelete(null);
      fetchList(); fetchFacets();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete print request');
    } finally { setDeleting(false); }
  };
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusIds.length) params.set('status_ids', statusIds.join(','));
      if (city) params.set('city', city);
      const res = await axios.get(`${API}/print-requests/export?${params}`, { headers: HEAD(), responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `print_requests_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Failed to export print requests');
    } finally { setExporting(false); }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6" data-testid="print-requests-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="hidden sm:flex h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
            <Printer className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Print Requests</h1>
            <p className="text-sm text-slate-500 mt-1">Approved designs sent for printing. Track quantity, vendor and status.</p>
          </div>
        </div>
      </div>

      {/* Status metric tiles — click to filter (multi-select) */}
      {statuses.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5" data-testid="print-status-tiles">
          {statuses.map((s) => {
            const active = statusIds.includes(s.id);
            const count = facets.status_counts?.[s.id] || 0;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleStatus(s.id)}
                aria-pressed={active}
                className="text-left rounded-xl border bg-white p-3 transition-all hover:shadow-sm focus:outline-none"
                style={active
                  ? { borderColor: s.color || '#0f766e', backgroundColor: (s.color || '#64748b') + '12', boxShadow: `0 0 0 1.5px ${s.color || '#0f766e'}` }
                  : { borderColor: '#e2e8f0' }}
                data-testid={`print-status-tile-${s.id}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color || '#94a3b8' }} />
                  <span className="text-[11px] font-medium text-slate-600 truncate">{s.name}</span>
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1 leading-none">{count}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by print #, design #, lead or vendor…"
            className="pl-9"
            data-testid="print-search"
          />
        </div>
        <Select value={city || '__all'} onValueChange={(v) => { setCity(v === '__all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="sm:w-52" data-testid="print-city-filter"><SelectValue placeholder="All cities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All cities</SelectItem>
            {(facets.cities || []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" onClick={() => { setSearch(''); setStatusIds([]); setCity(''); setPage(1); }} data-testid="print-clear-filters">
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
        <Button variant="outline" onClick={handleExport} disabled={exporting || items.length === 0} className="shrink-0" data-testid="print-export-btn">
          {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />} Download
        </Button>
      </div>

      {loading ? (
        <div className="p-16 flex items-center justify-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…</div>
      ) : (
        <>
          {/* Mobile / tablet cards */}
          <div className="lg:hidden space-y-3" data-testid="print-mobile-list">
            {items.length === 0 ? (
              <Card className="border border-slate-100 rounded-xl"><CardContent className="p-10 text-center text-sm text-muted-foreground">No print requests yet. Create one from a Final-Approved design request.</CardContent></Card>
            ) : groupByCity(items).map(([cityName, cityRows]) => {
              const collapsed = collapsedCities.has(cityName);
              return (
              <div key={cityName} className="space-y-3">
                <CityGroupHeader name={cityName} count={cityRows.length} collapsed={collapsed} onToggle={() => toggleCity(cityName)} />
                {!collapsed && cityRows.map((pr) => (
                <Card key={pr.id} className="border border-slate-100 rounded-xl shadow-sm active:scale-[0.99] transition-transform cursor-pointer" onClick={() => navigate(`/print-requests/${pr.id}`)} data-testid={`print-card-${pr.id}`}>
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-900 text-sm">{pr.source_title || pr.request_type_name || 'Print Request'}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" style={statusStyle(pr.status_color)} className="border text-[10px]">{pr.status_name}</Badge>
                      {isAdmin && (
                        <button onClick={(e) => { e.stopPropagation(); setToDelete(pr); }} className="p-1 text-slate-400 hover:text-red-600" data-testid={`print-delete-${pr.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground font-mono">
                    <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" /> {pr.print_number}</span>
                    <span>· from {pr.source_request_number}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1 border-t border-slate-50 text-xs">
                    {(pr.lead_company || pr.lead_name) && <div className="flex items-center gap-1.5 col-span-2 text-slate-600"><Users className="h-3.5 w-3.5 text-emerald-500" /> <span className="truncate">{pr.lead_company || pr.lead_name}</span></div>}
                    {pr.lead_city && <div className="flex items-center gap-1.5 col-span-2 text-slate-500"><MapPin className="h-3.5 w-3.5 text-emerald-500" /> <span className="truncate">{pr.lead_city}</span></div>}
                    <div className="flex items-center gap-1.5 text-slate-600"><Package className="h-3.5 w-3.5 text-emerald-500" /> Qty {pr.quantity}</div>
                    <div className="flex items-center gap-1.5 text-slate-600"><Calendar className="h-3.5 w-3.5 text-emerald-500" /> {fmtDate(pr.requested_due_date)}</div>
                    {pr.vendor_name && <div className="flex items-center gap-1.5 col-span-2 text-slate-600"><Building2 className="h-3.5 w-3.5 text-emerald-500" /> <span className="truncate">{pr.vendor_name}</span></div>}
                  </div>
                </CardContent>
                </Card>
                ))}
              </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <Card className="hidden lg:block border border-slate-100 rounded-xl shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                    <TableHead className="font-semibold text-sm text-muted-foreground">Print Request</TableHead>
                    <TableHead className="font-semibold text-sm text-muted-foreground">Lead</TableHead>
                    <TableHead className="font-semibold text-sm text-muted-foreground">Qty</TableHead>
                    <TableHead className="font-semibold text-sm text-muted-foreground">Due Date</TableHead>
                    <TableHead className="font-semibold text-sm text-muted-foreground">Vendor</TableHead>
                    <TableHead className="font-semibold text-sm text-muted-foreground">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="p-12 text-center text-sm text-muted-foreground">No print requests yet. Create one from a Final-Approved design request.</TableCell></TableRow>
                  ) : groupByCity(items).map(([cityName, cityRows]) => {
                    const collapsed = collapsedCities.has(cityName);
                    return (
                    <React.Fragment key={cityName}>
                      <TableRow className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 border-y border-emerald-700/20 cursor-pointer" onClick={() => toggleCity(cityName)} data-testid={`print-city-row-${cityName}`}>
                        <TableCell colSpan={6} className="py-3">
                          <div className="flex items-center gap-2.5">
                            <ChevronDown className={`h-5 w-5 text-white/90 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                            <MapPin className="h-5 w-5 text-emerald-100" />
                            <span className="text-base font-bold text-white tracking-tight">{cityName}</span>
                            <span className="text-xs font-bold text-white bg-white/20 border border-white/30 rounded-full px-2 py-0.5">{cityRows.length}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {!collapsed && cityRows.map((pr) => (
                      <TableRow key={pr.id} className="cursor-pointer hover:bg-slate-50 border-b border-slate-50 transition-colors" onClick={() => navigate(`/print-requests/${pr.id}`)} data-testid={`print-row-${pr.id}`}>
                        <TableCell className="py-3">
                          <div className="font-medium text-primary text-sm">{pr.source_title || pr.request_type_name || 'Print Request'}</div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground font-mono">
                            <Tag className="h-3 w-3" /> {pr.print_number} · from {pr.source_request_number}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-sm text-slate-700">
                          {pr.lead_company || pr.lead_name || <span className="text-slate-300">—</span>}
                          {pr.lead_city && <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" /> {pr.lead_city}</div>}
                        </TableCell>
                        <TableCell className="py-3 text-sm text-slate-700">{pr.quantity}</TableCell>
                        <TableCell className="py-3 text-sm text-slate-600">{fmtDate(pr.requested_due_date)}</TableCell>
                        <TableCell className="py-3 text-sm text-slate-700">{pr.vendor_name || <span className="text-slate-300">—</span>}</TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="outline" style={statusStyle(pr.status_color)} className="border text-xs">{pr.status_name}</Badge>
                            {isAdmin && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0" onClick={(e) => { e.stopPropagation(); setToDelete(pr); }} data-testid={`print-delete-${pr.id}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      ))}
                    </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{data.total} total · page {page} of {data.pages}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="print-prev-page"><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} data-testid="print-next-page"><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent data-testid="print-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete print request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {toDelete?.print_number}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="print-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700" data-testid="print-delete-confirm">
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
