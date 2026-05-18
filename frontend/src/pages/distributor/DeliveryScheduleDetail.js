import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft, Truck, User, Loader2, ChevronUp, ChevronDown, Plus, X,
  Download, CheckCircle2, XCircle, Calendar, Package, Phone, MapPin,
  GripVertical, Route, AlertTriangle, Sparkles, TrendingDown, Receipt, ExternalLink,
  Printer,
} from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const BASE = `${API_URL}/distributor/delivery-schedules`;

const STATUS_LABELS = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  confirmed: { label: 'Confirmed', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  in_progress: { label: 'In progress', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  completed: { label: 'Completed', cls: 'bg-slate-200 text-slate-700 border-slate-300' },
  cancelled: { label: 'Cancelled', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
};

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

function addrStr(a) {
  if (!a || typeof a !== 'object') return '—';
  return a.formatted
    || [a.address_line1, a.address_line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')
    || '—';
}

function legStatusLabel(s) {
  if (s === 'ok') return null;
  if (s === 'route_exists') return 'Same address';
  if (s === 'address_missing') return 'Address missing';
  if (s === 'api_error') return 'Distance unavailable';
  if (s === 'no_api_key') return 'Maps not configured';
  return s;
}

export default function DeliveryScheduleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState(null);
  const [fleet, setFleet] = useState({ vehicles: [], drivers: [], city: null });
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState({}); // delivery_id -> bool
  const [distance, setDistance] = useState(null);
  const [distanceLoading, setDistanceLoading] = useState(false);

  // Attach dialog state
  const [attachOpen, setAttachOpen] = useState(false);
  const [eligible, setEligible] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [picked, setPicked] = useState({});

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  // Optimize-route preview state
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [optimizeData, setOptimizeData] = useState(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);

  // Drag-and-drop
  const dragSrc = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${BASE}/${id}`, { withCredentials: true });
      setSchedule(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load schedule');
      navigate('/distributor/delivery-schedules');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const fetchFleet = useCallback(async () => {
    try {
      const [v, d] = await Promise.all([
        axios.get(`${BASE}/fleet/vehicles`, { withCredentials: true }),
        axios.get(`${BASE}/fleet/drivers`, { withCredentials: true }),
      ]);
      setFleet({
        vehicles: v.data?.vehicles || [],
        drivers: d.data?.drivers || [],
        city: v.data?.city || d.data?.city || null,
      });
    } catch { /* ignore */ }
  }, []);

  const fetchDistance = useCallback(async () => {
    setDistanceLoading(true);
    try {
      const { data } = await axios.get(`${BASE}/${id}/distance`, { withCredentials: true });
      setDistance(data);
    } catch {
      setDistance(null);
    } finally {
      setDistanceLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchSchedule(); fetchFleet(); }, [fetchSchedule, fetchFleet]);
  // While the schedule is live (in_progress), poll to surface stop completions
  // pushed by the driver in near-real-time. Cadence matches the GPS-ping interval
  // so we don't hammer the API.
  useEffect(() => {
    if (schedule?.status !== 'in_progress') return undefined;
    const ms = Math.max(30_000, 60_000); // 1 min — progress is less time-sensitive than the map
    const t = setInterval(fetchSchedule, ms);
    return () => clearInterval(t);
  }, [schedule?.status, fetchSchedule]);
  // Refetch distance whenever delivery_ids order changes or vehicle/driver assignments change
  useEffect(() => {
    if (schedule?.deliveries && schedule.deliveries.length > 0) {
      fetchDistance();
    } else {
      setDistance(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule?.id, JSON.stringify(schedule?.delivery_ids || [])]);

  const editable = schedule && !['approved', 'in_progress', 'completed', 'cancelled'].includes(schedule.status);

  const patch = async (body) => {
    setBusy(true);
    try {
      const { data } = await axios.put(`${BASE}/${id}`, body, { withCredentials: true });
      setSchedule(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update');
    } finally {
      setBusy(false);
    }
  };

  const changeVehicle = (vid) => patch({ vehicle_id: vid || null });
  const changeDriver = (did) => patch({ driver_id: did || null });

  const reorderTo = async (ids) => {
    // Optimistic local update so the UI feels instant; then persist.
    setSchedule((prev) => prev ? { ...prev, delivery_ids: ids, deliveries: ids.map(x => prev.deliveries.find(d => d.id === x)).filter(Boolean) } : prev);
    await patch({ delivery_ids: ids });
  };

  const move = async (idx, direction) => {
    if (!schedule?.deliveries) return;
    const ids = (schedule.delivery_ids || []).slice();
    const target = idx + direction;
    if (target < 0 || target >= ids.length) return;
    const [moved] = ids.splice(idx, 1);
    ids.splice(target, 0, moved);
    await reorderTo(ids);
  };

  // ---- Drag-and-drop handlers (HTML5 native) ----
  const onDragStart = (e, idx) => {
    dragSrc.current = idx;
    e.dataTransfer.effectAllowed = 'move';
    // Safari requires setData
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch { /* ignore */ }
  };
  const onDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOver !== idx) setDragOver(idx);
  };
  const onDragLeave = () => setDragOver(null);
  const onDrop = async (e, dropIdx) => {
    e.preventDefault();
    setDragOver(null);
    const srcIdx = dragSrc.current;
    dragSrc.current = null;
    if (srcIdx === null || srcIdx === undefined || srcIdx === dropIdx) return;
    const ids = (schedule.delivery_ids || []).slice();
    const [moved] = ids.splice(srcIdx, 1);
    ids.splice(dropIdx, 0, moved);
    await reorderTo(ids);
  };

  const detach = async (deliveryId) => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${BASE}/${id}/detach-delivery/${deliveryId}`, {}, { withCredentials: true });
      setSchedule(data);
      toast.success('Removed from schedule');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to remove delivery');
    } finally {
      setBusy(false);
    }
  };

  const openAttach = async () => {
    setAttachOpen(true);
    setEligibleLoading(true);
    setPicked({});
    try {
      const { data } = await axios.get(`${BASE}/eligible-deliveries`, { withCredentials: true });
      setEligible(data?.deliveries || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load eligible deliveries');
    } finally {
      setEligibleLoading(false);
    }
  };

  const attachSelected = async () => {
    const ids = Object.keys(picked).filter((k) => picked[k]);
    if (ids.length === 0) { toast.error('Pick at least one delivery'); return; }
    setBusy(true);
    try {
      const { data } = await axios.post(`${BASE}/${id}/attach-deliveries`, { delivery_ids: ids }, { withCredentials: true });
      setSchedule(data);
      toast.success(`${ids.length} ${ids.length === 1 ? 'delivery' : 'deliveries'} added`);
      setAttachOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to attach deliveries');
    } finally {
      setBusy(false);
    }
  };

  const confirmSchedule = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${BASE}/${id}/confirm`, {}, { withCredentials: true });
      setSchedule(data);
      toast.success('Schedule confirmed. Awaiting approval before stock-outs move to Scheduled.');
      setConfirmOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to confirm');
    } finally {
      setBusy(false);
    }
  };

  const approveSchedule = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${BASE}/${id}/approve`, {}, { withCredentials: true });
      setSchedule(data);
      toast.success(`Schedule approved by ${data.approved_by_name}. Stock-outs moved to Scheduled.`);
      setApproveOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to approve');
    } finally {
      setBusy(false);
    }
  };

  const cancelSchedule = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${BASE}/${id}/cancel`, {}, { withCredentials: true });
      setSchedule(data);
      toast.success('Schedule cancelled.');
      setCancelOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to cancel');
    } finally {
      setBusy(false);
    }
  };

  const downloadPDF = () => window.open(`${BASE}/${id}/pdf`, '_blank');

  // Combined bundle: driver schedule + all attached Zoho invoices in ONE PDF.
  // Download = save to disk; Print = open in a new tab and trigger window.print()
  // after the PDF is rendered. Both call the same backend endpoint.
  const [bundleBusy, setBundleBusy] = useState(false);
  const [bundleAction, setBundleAction] = useState(null); // 'download' | 'print' | null

  const fetchBundleBlob = async () => {
    const response = await axios.get(
      `${BASE}/${id}/bundle-pdf?inline=true`,
      { responseType: 'blob', withCredentials: true }
    );
    const skipped = response.headers['x-bundle-skipped'] || '';
    const invoicePages = response.headers['x-bundle-invoice-pages'] || '0';
    return { blob: new Blob([response.data], { type: 'application/pdf' }), skipped, invoicePages };
  };

  const handleDownloadBundle = async () => {
    setBundleBusy(true); setBundleAction('download');
    try {
      const { blob, skipped, invoicePages } = await fetchBundleBlob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `delivery-bundle-${schedule.schedule_date || id}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Bundle saved (1 schedule + ${invoicePages} invoice${invoicePages === '1' ? '' : 's'})`);
      if (skipped) toast.warning(`Some stops were skipped: ${skipped}`);
    } catch (e) {
      let detail = e?.response?.data?.detail;
      if (!detail && e?.response?.data instanceof Blob) {
        try { detail = JSON.parse(await e.response.data.text()).detail; } catch (_) { /* ignore */ }
      }
      toast.error(detail || 'Failed to build bundle PDF');
    } finally {
      setBundleBusy(false); setBundleAction(null);
    }
  };

  const handlePrintBundle = async () => {
    setBundleBusy(true); setBundleAction('print');
    try {
      const { blob, skipped } = await fetchBundleBlob();
      const url = window.URL.createObjectURL(blob);
      // Open in a hidden iframe and call print() once loaded — this avoids
      // popup-blocker issues and lets the print dialog appear without leaving
      // the schedule page. We revoke the blob after printing finishes.
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0'; iframe.style.bottom = '0';
      iframe.style.width = '0'; iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (err) {
          // Fallback: open in a new tab if the iframe trick is blocked.
          window.open(url, '_blank');
        }
        // Clean up after the user closes the print dialog. We give it a
        // generous timeout because browsers fire `afterprint` inconsistently
        // for cross-origin / blob URLs.
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch (_) { /* ignore */ }
          window.URL.revokeObjectURL(url);
        }, 60_000);
      };
      if (skipped) toast.warning(`Some stops were skipped: ${skipped}`);
    } catch (e) {
      let detail = e?.response?.data?.detail;
      if (!detail && e?.response?.data instanceof Blob) {
        try { detail = JSON.parse(await e.response.data.text()).detail; } catch (_) { /* ignore */ }
      }
      toast.error(detail || 'Failed to print bundle PDF');
    } finally {
      setBundleBusy(false); setBundleAction(null);
    }
  };

  // Download an individual delivery's Zoho invoice as a PDF via the server proxy
  // so the saved file matches the Zoho invoice number (INV-00017.pdf).
  const [invoiceBusyId, setInvoiceBusyId] = useState(null);
  const handleDownloadInvoice = async (delivery) => {
    if (!schedule?.distributor_id || !delivery?.zoho_invoice_id) {
      toast.error('Invoice is not ready yet — confirm the schedule first.');
      return;
    }
    setInvoiceBusyId(delivery.id);
    try {
      const response = await axios.get(
        `${API_URL}/distributors/${schedule.distributor_id}/deliveries/${delivery.id}/invoice-pdf`,
        { responseType: 'blob', withCredentials: true }
      );
      const cd = response.headers['content-disposition'] || '';
      const match = /filename="?([^"]+)"?/.exec(cd);
      const filename = match?.[1] || `${delivery.zoho_invoice_number || 'invoice'}.pdf`;
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filename}`);
    } catch (e) {
      let detail = e?.response?.data?.detail;
      if (!detail && e?.response?.data instanceof Blob) {
        try { detail = JSON.parse(await e.response.data.text()).detail; } catch (_) { /* keep null */ }
      }
      toast.error(detail || 'Failed to download invoice');
    } finally {
      setInvoiceBusyId(null);
    }
  };

  // ----- Route optimisation -------------------------------------------------
  const openOptimize = async () => {
    setOptimizeLoading(true);
    setOptimizeOpen(true);
    setOptimizeData(null);
    try {
      const { data } = await axios.post(`${BASE}/${id}/optimize-route`, { apply: false }, { withCredentials: true });
      setOptimizeData(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to compute optimised route');
      setOptimizeOpen(false);
    } finally {
      setOptimizeLoading(false);
    }
  };

  const applyOptimize = async () => {
    if (!optimizeData?.optimized_order) return;
    setBusy(true);
    try {
      const { data } = await axios.put(`${BASE}/${id}`, { delivery_ids: optimizeData.optimized_order }, { withCredentials: true });
      setSchedule(data);
      toast.success(
        optimizeData.savings_km != null && optimizeData.savings_km > 0
          ? `Route optimised — saving ~${optimizeData.savings_km.toFixed(1)} km`
          : 'Stop order updated'
      );
      setOptimizeOpen(false);
      setOptimizeData(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to apply optimised order');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !schedule) {
    return <div className="p-6 flex items-center justify-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;
  }

  const st = STATUS_LABELS[schedule.status] || { label: schedule.status, cls: 'bg-slate-100 text-slate-700 border-slate-200' };
  const deliveries = schedule.deliveries || [];

  // legs keyed by destination delivery_id for quick lookup
  const legByDeliveryId = {};
  let firstLegKm = null;
  let lastLegKm = null;
  if (distance?.legs) {
    for (const l of distance.legs) {
      if (l.to_delivery_id) legByDeliveryId[l.to_delivery_id] = l;
    }
    if (distance.legs.length > 0) firstLegKm = distance.legs[0];
    // Last leg has no to_delivery_id → it's the return-to-warehouse leg
    const last = distance.legs[distance.legs.length - 1];
    if (last && !last.to_delivery_id) lastLegKm = last;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto" data-testid="schedule-detail-page">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/distributor/delivery-schedules')} data-testid="schedule-back-btn">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-slate-600" /> {fmtDate(schedule.schedule_date)}
              </h1>
              <Badge variant="outline" className={st.cls} data-testid="schedule-status-badge">{st.label}</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-1">{deliveries.length} stop{deliveries.length === 1 ? '' : 's'} planned</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(schedule.status === 'confirmed' || schedule.status === 'approved') && (
            <Button variant="outline" onClick={downloadPDF} data-testid="schedule-pdf-btn">
              <Download className="h-4 w-4 mr-1.5" /> Driver PDF
            </Button>
          )}
          {['confirmed', 'approved', 'in_progress', 'completed'].includes(schedule.status) && (
            <>
              <Button
                variant="outline"
                onClick={handleDownloadBundle}
                disabled={bundleBusy}
                data-testid="schedule-bundle-download-btn"
                title="Driver schedule + all invoices in a single PDF"
              >
                {bundleBusy && bundleAction === 'download'
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Building…</>
                  : <><Download className="h-4 w-4 mr-1.5" /> Download Bundle</>}
              </Button>
              <Button
                variant="outline"
                onClick={handlePrintBundle}
                disabled={bundleBusy}
                data-testid="schedule-bundle-print-btn"
                title="Print driver schedule + all invoices in one go"
              >
                {bundleBusy && bundleAction === 'print'
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Preparing…</>
                  : <><Printer className="h-4 w-4 mr-1.5" /> Print Bundle</>}
              </Button>
            </>
          )}
          {schedule.status === 'draft' && (
            <Button onClick={() => setConfirmOpen(true)} disabled={busy} data-testid="schedule-confirm-btn">
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirm Schedule
            </Button>
          )}
          {schedule.status === 'confirmed' && (
            <Button onClick={() => setApproveOpen(true)} disabled={busy} data-testid="schedule-approve-btn">
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve
            </Button>
          )}
          {schedule.status !== 'cancelled' && (
            <Button variant="outline" onClick={() => setCancelOpen(true)} disabled={busy} className="text-red-600 hover:text-red-700 hover:bg-red-50" data-testid="schedule-cancel-btn">
              <XCircle className="h-4 w-4 mr-1.5" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Assignment row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <Label className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Truck className="h-3 w-3" /> Vehicle {fleet.city && <span className="text-slate-400 normal-case ml-1">· in {fleet.city}</span>}
          </Label>
          <Select value={schedule.vehicle_id || '__none__'} onValueChange={(v) => changeVehicle(v === '__none__' ? '' : v)} disabled={!editable || busy}>
            <SelectTrigger className="mt-2" data-testid="assign-vehicle"><SelectValue placeholder="Pick vehicle" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__none__">— None —</SelectItem>
              {fleet.vehicles.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  <span className="font-mono">{v.registration_number}</span>
                  {v.vehicle_name && <span className="text-slate-400 ml-2">· {v.vehicle_name}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {schedule.vehicle && (<p className="text-xs text-slate-500 mt-2">{schedule.vehicle.vehicle_type}{schedule.vehicle.vehicle_name && ` · ${schedule.vehicle.vehicle_name}`}</p>)}
        </Card>
        <Card className="p-4">
          <Label className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <User className="h-3 w-3" /> Driver {fleet.city && <span className="text-slate-400 normal-case ml-1">· in {fleet.city}</span>}
          </Label>
          <Select value={schedule.driver_id || '__none__'} onValueChange={(v) => changeDriver(v === '__none__' ? '' : v)} disabled={!editable || busy}>
            <SelectTrigger className="mt-2" data-testid="assign-driver"><SelectValue placeholder="Pick driver" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__none__">— None —</SelectItem>
              {fleet.drivers.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.full_name} <span className="text-slate-400 ml-1">· {d.phone}</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
          {schedule.driver && (<p className="text-xs text-slate-500 mt-2 font-mono">{schedule.driver.phone}</p>)}
        </Card>
      </div>

      {/* Route summary card */}
      {deliveries.length > 0 && (
        <Card className="p-4 mb-4 bg-gradient-to-br from-slate-50 to-white">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                <Route className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500">Total route (round trip)</div>
                <div className="text-xl font-bold text-slate-900" data-testid="schedule-total-km">
                  {distanceLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : (
                    distance?.total_km != null ? `${distance.total_km.toFixed(1)} km` : '—'
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Warehouse → {deliveries.length} stop{deliveries.length === 1 ? '' : 's'} → back to warehouse
                </div>
              </div>
            </div>
            {distance?.warnings && distance.warnings.length > 0 && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-md flex items-start gap-1.5 max-w-md">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>{distance.warnings.join(' ')}</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Approver banner (only on approved schedules) */}
      {schedule.status === 'approved' && schedule.approved_by_name && (
        <Card className="p-3 mb-4 bg-emerald-50 border-emerald-200 flex items-center gap-2.5" data-testid="approver-banner">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-emerald-900">Approved by {schedule.approved_by_name}</span>
            {schedule.approved_at && (
              <span className="text-emerald-700 ml-1.5">
                · {new Date(schedule.approved_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </Card>
      )}

      {/* Live driver map — temporarily DISABLED until Google Maps JavaScript
          API is enabled on the API key. Surfaced as a collapsed, disabled
          card so the placeholder is visible but not interactive. */}
      {schedule.driver_id && ['approved', 'in_progress', 'completed'].includes(schedule.status) && (
        <Card className="mb-4 overflow-hidden opacity-60 cursor-not-allowed" data-testid="live-map-card">
          <div
            className="w-full flex items-center justify-between px-5 py-3 select-none"
            data-testid="live-map-toggle"
            aria-disabled="true"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <MapPin className="h-4 w-4 text-slate-500" />
              Live driver map
              <span className="text-xs text-slate-400 font-normal italic">
                Disabled · Google Maps setup pending
              </span>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </div>
        </Card>
      )}

      {/* Delivery progress — segmented bar + status pills. Shown once the
          schedule has reached approved (i.e. driver work has begun or is about to). */}
      {['approved', 'in_progress', 'completed'].includes(schedule.status) && deliveries.length > 0 && (
        <ScheduleProgress schedule={schedule} deliveries={deliveries} />
      )}

      {/* Deliveries list — ROW format with expander + drag-and-drop */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="font-medium text-slate-900 flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-600" /> Stops · in dispatch order
            {editable && deliveries.length > 1 && (
              <span className="text-xs text-slate-400 ml-2 font-normal">drag rows or use arrows to reorder</span>
            )}
          </div>
          {editable && (
            <div className="flex items-center gap-2">
              {deliveries.length >= 2 && (
                <Button size="sm" variant="outline" onClick={openOptimize} disabled={busy} data-testid="schedule-optimize-btn">
                  <Sparkles className="h-4 w-4 mr-1.5" /> Optimize route
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={openAttach} data-testid="schedule-attach-btn">
                <Plus className="h-4 w-4 mr-1.5" /> Attach Stock-Outs
              </Button>
            </div>
          )}
        </div>

        {/* First leg (Distributor → Stop 1) */}
        {firstLegKm && deliveries.length > 0 && (
          <div className="px-5 py-2 bg-slate-50/60 border-b text-xs text-slate-600 flex items-center gap-2" data-testid="leg-first">
            <Route className="h-3 w-3 text-slate-400" />
            <span className="text-slate-400">Distributor warehouse →</span>
            <span className="font-medium text-slate-700">{firstLegKm.km != null ? `${firstLegKm.km.toFixed(1)} km` : legStatusLabel(firstLegKm.status)}</span>
            {firstLegKm.duration_min != null && <span className="text-slate-400">· ~{firstLegKm.duration_min} min</span>}
          </div>
        )}

        {deliveries.length === 0 ? (
          <div className="p-12 text-center" data-testid="schedule-empty-stops">
            <Package className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No deliveries attached yet</p>
            <p className="text-sm text-slate-400 mt-1">Click "Attach Stock-Outs" to add confirmed deliveries.</p>
          </div>
        ) : (
          <div className="divide-y">
            {deliveries.map((d, idx) => {
              const isOpen = !!expanded[d.id];
              const interLeg = idx > 0 ? legByDeliveryId[d.id] : null; // leg INTO this stop (skip the first which is shown above)
              const dropping = dragOver === idx;
              return (
                <React.Fragment key={d.id}>
                  {/* Inter-leg banner between stops 1→2, 2→3, etc. */}
                  {interLeg && (
                    <div className="px-5 py-1.5 bg-slate-50/40 text-xs text-slate-500 flex items-center gap-2">
                      <Route className="h-3 w-3 text-slate-400" />
                      <span className="font-medium text-slate-700">{interLeg.km != null ? `${interLeg.km.toFixed(1)} km` : legStatusLabel(interLeg.status)}</span>
                      {interLeg.duration_min != null && <span>· ~{interLeg.duration_min} min</span>}
                    </div>
                  )}

                  <div
                    className={`group ${dropping ? 'bg-emerald-50/60 ring-2 ring-emerald-300 ring-inset' : ''}`}
                    draggable={editable && !busy}
                    onDragStart={(e) => onDragStart(e, idx)}
                    onDragOver={(e) => onDragOver(e, idx)}
                    onDragLeave={onDragLeave}
                    onDrop={(e) => onDrop(e, idx)}
                    data-testid={`stop-row-${d.id}`}
                  >
                    {/* Compact row — always visible */}
                    <button
                      type="button"
                      onClick={() => setExpanded((s) => ({ ...s, [d.id]: !s[d.id] }))}
                      className="w-full text-left px-3 py-3 flex items-center gap-3 hover:bg-slate-50/70 transition-colors"
                      data-testid={`stop-toggle-${d.id}`}
                    >
                      {editable && (
                        <span className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing hidden md:inline-flex" title="Drag to reorder">
                          <GripVertical className="h-4 w-4" />
                        </span>
                      )}
                      <div className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">{idx + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900 truncate">{d.customer_name || 'Unknown customer'}</span>
                          {d.delivery_number && <span className="text-[11px] text-slate-400 font-mono">{d.delivery_number}</span>}
                          <StopStatusPill stopIdx={idx} stop={d} deliveries={deliveries} scheduleStatus={schedule.status} />
                          {d.account_billed_by === 'distributor' && (
                            <Badge
                              variant="outline"
                              className="bg-slate-100 text-slate-600 border-slate-300 text-[10px]"
                              title="This account is billed by a third-party distributor — no Zoho invoice will be generated."
                              data-testid={`stop-billing-chip-${d.id}`}
                            >
                              Distributor-billed
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate">{addrStr(d.delivery_address)}</div>
                      </div>
                      {/* Quantity summary badge */}
                      <div className="hidden sm:flex flex-col items-end mr-2">
                        <div className="text-[10px] uppercase text-slate-400 leading-none">pkgs</div>
                        <div className="text-sm font-semibold text-slate-700 leading-tight">{d.total_quantity || 0}</div>
                      </div>
                      {editable && (
                        <div className="hidden md:flex flex-col">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); move(idx, -1); }} disabled={idx === 0 || busy} data-testid={`stop-up-${d.id}`}>
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); move(idx, 1); }} disabled={idx === deliveries.length - 1 || busy} data-testid={`stop-down-${d.id}`}>
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      {editable && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); detach(d.id); }} disabled={busy} data-testid={`stop-remove-${d.id}`}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Expander details */}
                    {isOpen && (
                      <div className="px-12 pb-4 -mt-1 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm" data-testid={`stop-expanded-${d.id}`}>
                        <div className="space-y-2">
                          <div className="text-xs uppercase tracking-wider text-slate-400">Delivery address</div>
                          <div className="text-slate-700 flex items-start gap-1.5">
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
                            <span>{addrStr(d.delivery_address)}</span>
                          </div>
                          {(d.delivery_contact_name || d.delivery_contact_phone || d.contact_phone) && (
                            <div className="mt-2 rounded-md bg-amber-50 border border-amber-100 px-2.5 py-1.5" data-testid={`stop-delivery-contact-${d.id}`}>
                              <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Delivery contact</div>
                              {d.delivery_contact_name && (
                                <div className="text-slate-800 text-xs flex items-center gap-1.5 mt-0.5">
                                  <User className="h-3 w-3 text-amber-600" /> {d.delivery_contact_name}
                                </div>
                              )}
                              {(d.delivery_contact_phone || d.contact_phone) && (
                                <a
                                  href={`tel:${d.delivery_contact_phone || d.contact_phone}`}
                                  className="text-slate-800 text-xs flex items-center gap-1.5 mt-0.5 hover:text-amber-700"
                                >
                                  <Phone className="h-3 w-3 text-amber-600" /> {d.delivery_contact_phone || d.contact_phone}
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">Crates / Items</div>
                          {d.items && d.items.length > 0 ? (
                            <div className="space-y-1">
                              {d.items.map((it, i) => (
                                <div key={i} className="flex items-center justify-between bg-slate-50 rounded-md px-2.5 py-1.5">
                                  <span className="text-slate-700 truncate mr-2">{it.sku_name || 'Item'}</span>
                                  <span className="text-sm font-semibold text-slate-900 whitespace-nowrap flex items-baseline gap-1">
                                    {it.quantity}
                                    <span className="text-[10px] uppercase font-normal text-slate-400">{(it.packaging_label || 'crate')}{it.quantity === 1 ? '' : 's'}</span>
                                  </span>
                                </div>
                              ))}
                              <div className="flex items-center justify-between pt-1 px-2.5">
                                <span className="text-xs text-slate-500">Total packages</span>
                                <span className="text-sm font-bold text-slate-900">{d.total_quantity || 0}</span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 italic">No items recorded on this delivery.</p>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Zoho invoice action row — only shown when there is an
                        invoice for this delivery (i.e. schedule has been
                        confirmed at least once). Server proxy ensures the
                        downloaded file is named after the Zoho invoice number
                        (e.g. INV-00017.pdf). Hidden when the account is
                        billed by a third-party distributor (no Zoho invoice
                        is generated in that case). */}
                    {isOpen && d.account_billed_by === 'distributor' && (
                      <div className="px-12 pb-4" data-testid={`stop-invoice-distributor-${d.id}`}>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-slate-500 text-xs">
                          Billing handled by third-party distributor — no Zoho invoice.
                        </div>
                      </div>
                    )}
                    {isOpen && d.account_billed_by !== 'distributor' && (d.zoho_invoice_id || d.zoho_invoice_url) && (
                      <div className="px-12 pb-4 flex flex-wrap items-center gap-2" data-testid={`stop-invoice-${d.id}`}>
                        <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                          <Receipt className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Invoice</span>
                          {d.zoho_invoice_number && (
                            <span className="font-mono text-slate-700 font-medium">{d.zoho_invoice_number}</span>
                          )}
                        </div>
                        {d.zoho_invoice_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); handleDownloadInvoice(d); }}
                            disabled={invoiceBusyId === d.id}
                            className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                            data-testid={`stop-invoice-download-${d.id}`}
                          >
                            {invoiceBusyId === d.id
                              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Downloading…</>
                              : <><Download className="h-3.5 w-3.5 mr-1.5" /> Download Invoice</>}
                          </Button>
                        )}
                        {d.zoho_invoice_url && (
                          <a
                            href={d.zoho_invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`stop-invoice-view-${d.id}`}
                          >
                            <Button size="sm" variant="ghost" className="text-violet-700 hover:bg-violet-50">
                              <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> View in Zoho
                            </Button>
                          </a>
                        )}
                      </div>
                    )}
                    {/* Pending state — schedule is confirmed but invoice still being pushed */}
                    {isOpen && d.account_billed_by !== 'distributor' && !d.zoho_invoice_id && ['confirmed', 'approved', 'in_progress', 'completed'].includes(schedule.status) && (
                      <div className="px-12 pb-4" data-testid={`stop-invoice-pending-${d.id}`}>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-xs">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Invoice generating in Zoho…
                        </div>
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
            {/* Last leg (Stop N → Warehouse, round trip) */}
            {lastLegKm && (
              <div className="px-5 py-2 bg-slate-50/60 text-xs text-slate-600 flex items-center gap-2" data-testid="leg-last">
                <Route className="h-3 w-3 text-slate-400" />
                <span className="text-slate-400">→ Back to warehouse</span>
                <span className="font-medium text-slate-700">{lastLegKm.km != null ? `${lastLegKm.km.toFixed(1)} km` : legStatusLabel(lastLegKm.status)}</span>
                {lastLegKm.duration_min != null && <span className="text-slate-400">· ~{lastLegKm.duration_min} min</span>}
              </div>
            )}
          </div>
        )}
      </Card>

      {schedule.notes && (
        <Card className="mt-4 p-4 bg-amber-50/40 border-amber-200">
          <Label className="text-xs uppercase tracking-wider text-amber-700">Notes</Label>
          <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{schedule.notes}</p>
        </Card>
      )}

      {/* Attach dialog */}
      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent className="max-w-2xl" data-testid="attach-dialog">
          <DialogHeader>
            <DialogTitle>Attach Confirmed Stock-Outs</DialogTitle>
            <DialogDescription>Pick deliveries to add to this schedule. Each delivery can be on only one active schedule.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto -mx-6 px-6">
            {eligibleLoading ? (
              <div className="p-8 flex items-center justify-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
            ) : eligible.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Package className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="font-medium">No eligible stock-outs</p>
                <p className="text-xs mt-1">All your confirmed stock-outs are either already attached, or none are confirmed yet.</p>
              </div>
            ) : (
              <div className="divide-y border rounded-md">
                {eligible.map(e => (
                  <label key={e.id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer" data-testid={`eligible-row-${e.id}`}>
                    <Checkbox checked={!!picked[e.id]} onCheckedChange={(v) => setPicked({ ...picked, [e.id]: !!v })} data-testid={`eligible-cb-${e.id}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900">{e.customer_name || 'Unknown'}</span>
                        {e.delivery_number && <span className="text-xs text-slate-400 font-mono">{e.delivery_number}</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{addrStr(e.delivery_address)}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{e.items_count} item{e.items_count === 1 ? '' : 's'} · {e.total_quantity} unit{e.total_quantity === 1 ? '' : 's'}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachOpen(false)}>Cancel</Button>
            <Button onClick={attachSelected} disabled={busy} data-testid="attach-confirm-btn">
              {busy ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Adding…</> : 'Add to Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm this delivery schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              {deliveries.length} stop{deliveries.length === 1 ? '' : 's'} will be locked into this schedule. The stock-outs stay as <b>Confirmed</b> until an approver signs off. PDF preview becomes available now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSchedule} disabled={busy} data-testid="confirm-confirm-btn">
              {busy ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Confirming…</> : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve dialog */}
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent data-testid="approve-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              Approving locks the schedule and moves the {deliveries.length} underlying stock-out{deliveries.length === 1 ? '' : 's'} from <b>Delivery Assigned</b> to <b>Delivery Scheduled</b>. Your name and the current time will be recorded on the driver PDF. This cannot be edited afterwards — only cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={approveSchedule} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="approve-confirm-btn">
              {busy ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Approving…</> : 'Approve'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this schedule?</AlertDialogTitle>
            <AlertDialogDescription>Attached stock-outs (if any) will revert to "Confirmed".</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep schedule</AlertDialogCancel>
            <AlertDialogAction onClick={cancelSchedule} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white" data-testid="cancel-confirm-btn">
              {busy ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Cancelling…</> : 'Cancel Schedule'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Optimize-route preview dialog */}
      <Dialog open={optimizeOpen} onOpenChange={(o) => { if (!o) { setOptimizeOpen(false); setOptimizeData(null); } }}>
        <DialogContent className="max-w-lg" data-testid="optimize-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" /> Optimise route
            </DialogTitle>
            <DialogDescription>
              Nearest-neighbour ordering using Google Maps distances (round-trip from your warehouse).
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {optimizeLoading && (
              <div className="flex items-center justify-center py-8 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Computing optimal route…
              </div>
            )}
            {!optimizeLoading && optimizeData && (
              <OptimizeSummary data={optimizeData} deliveries={schedule?.deliveries || []} />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOptimizeOpen(false); setOptimizeData(null); }} disabled={busy}>
              Close
            </Button>
            <Button
              onClick={applyOptimize}
              disabled={busy || optimizeLoading || !optimizeData || optimizeData?.optimized_order?.join(',') === optimizeData?.original_order?.join(',')}
              data-testid="optimize-apply-btn"
            >
              {busy ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Applying…</> : 'Apply new order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


/**
 * ScheduleProgress — segmented progress bar + status pills for a delivery
 * schedule. Interpretation of stop state:
 *   - delivered : `distributor_deliveries.status === 'delivered'`
 *   - in_transit: the FIRST pending stop, but only while the schedule is
 *                 actively `in_progress` (the driver is en route to it).
 *   - pending   : every other non-delivered stop.
 * On a `completed` schedule, any stops not marked delivered are surfaced as
 * "Skipped" so the distributor can chase them up.
 */
function ScheduleProgress({ schedule, deliveries }) {
  const total = deliveries.length;
  const isComplete = (s) => s === 'delivered' || s === 'complete';
  const delivered = deliveries.filter(d => isComplete(d.status)).length;
  const onTheWay = deliveries.filter(d => d.status === 'on_the_way').length;
  const nonDelivered = total - delivered;
  const isLive = schedule.status === 'in_progress';
  const isDone = schedule.status === 'completed';

  // In-transit count = explicit `on_the_way` rows; fall back to "1 if live" for legacy data.
  const inTransit = onTheWay > 0 ? onTheWay : (isLive && nonDelivered > 0 ? 1 : 0);
  const pending = isDone ? 0 : Math.max(0, nonDelivered - inTransit);
  const skipped = isDone ? nonDelivered : 0;

  const pct = total === 0 ? 0 : (delivered / total) * 100;
  const ptTransit = total === 0 ? 0 : (inTransit / total) * 100;

  const pills = [
    { key: 'delivered', label: `${delivered} of ${total} delivered`, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', show: true },
    { key: 'in_transit', label: `${inTransit} in-transit`, cls: 'bg-amber-100 text-amber-800 border-amber-200', show: inTransit > 0 },
    { key: 'pending', label: `${pending} pending`, cls: 'bg-slate-100 text-slate-700 border-slate-200', show: pending > 0 },
    { key: 'skipped', label: `${skipped} skipped`, cls: 'bg-rose-100 text-rose-700 border-rose-200', show: skipped > 0 },
  ];

  return (
    <Card className="p-4 mb-4" data-testid="schedule-progress">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-sm font-medium text-slate-700">Delivery progress</div>
        <div className="text-xs text-slate-500 font-mono tabular-nums">{Math.round(pct)}%</div>
      </div>
      {/* Segmented bar: emerald (delivered) → amber (in-transit) → grey (pending) → red (skipped) */}
      <div className="w-full h-2.5 rounded-full overflow-hidden bg-slate-100 flex" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} data-testid="progress-seg-delivered" />
        {inTransit > 0 && (
          <div className="h-full bg-amber-400 transition-all animate-pulse" style={{ width: `${ptTransit}%` }} data-testid="progress-seg-transit" />
        )}
        {skipped > 0 && (
          <div className="h-full bg-rose-400 transition-all" style={{ width: `${(skipped / total) * 100}%` }} data-testid="progress-seg-skipped" />
        )}
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {pills.filter(p => p.show).map(p => (
          <Badge key={p.key} variant="outline" className={p.cls} data-testid={`progress-pill-${p.key}`}>{p.label}</Badge>
        ))}
        {schedule.started_at && !isDone && (
          <span className="text-xs text-slate-500 ml-auto" data-testid="progress-started-at">
            Started {new Date(schedule.started_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {schedule.ended_at && isDone && (
          <span className="text-xs text-slate-500 ml-auto" data-testid="progress-ended-at">
            Ended {new Date(schedule.ended_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </Card>
  );
}


/**
 * StopStatusPill — small per-row badge that mirrors ScheduleProgress logic for
 * a single stop. Only renders something for schedules at approved or later.
 */
function StopStatusPill({ stopIdx, stop, deliveries, scheduleStatus }) {
  if (!['approved', 'in_progress', 'completed'].includes(scheduleStatus)) return null;
  if (stop.status === 'delivered' || stop.status === 'complete') {
    return (
      <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]" data-testid={`stop-status-${stop.id}`}>
        Delivered
      </Badge>
    );
  }
  if (stop.status === 'on_the_way') {
    return (
      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]" data-testid={`stop-status-${stop.id}`}>
        On the way
      </Badge>
    );
  }
  if (scheduleStatus === 'completed') {
    return (
      <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-200 text-[10px]" data-testid={`stop-status-${stop.id}`}>
        Skipped
      </Badge>
    );
  }
  if (scheduleStatus === 'in_progress') {
    // First non-delivered stop = in-transit; rest = pending.
    const firstPendingIdx = deliveries.findIndex(x => x.status !== 'delivered' && x.status !== 'complete');
    if (stopIdx === firstPendingIdx) {
      return (
        <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]" data-testid={`stop-status-${stop.id}`}>
          In-transit
        </Badge>
      );
    }
  }
  return (
    <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-[10px]" data-testid={`stop-status-${stop.id}`}>
      Pending
    </Badge>
  );
}



/**
 * OptimizeSummary — renders the route-optimisation preview: km saved
 * (or "already optimal"), any API warnings, and the proposed new stop order
 * with the deltas vs. the original sequence.
 */
function OptimizeSummary({ data, deliveries }) {
  const byId = new Map((deliveries || []).map((d, i) => [d.id, { ...d, originalIdx: i }]));
  const unchanged = data.optimized_order.join(',') === data.original_order.join(',');
  const savings = data.savings_km;
  const cannotMeasure = data.original_total_km == null || data.optimized_total_km == null;

  return (
    <div className="space-y-4">
      {data.warnings && data.warnings.length > 0 && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>{data.warnings.join(' ')}</span>
        </div>
      )}

      {cannotMeasure ? (
        <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
          Distances couldn't be measured (see warnings). The button below is disabled.
        </div>
      ) : unchanged ? (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Already optimal — round trip is {data.optimized_total_km.toFixed(1)} km.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md bg-slate-50 border border-slate-200 px-2 py-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Current</div>
            <div className="text-base font-semibold text-slate-700 mt-0.5">{data.original_total_km.toFixed(1)} km</div>
          </div>
          <div className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-3">
            <div className="text-[10px] uppercase tracking-wider text-emerald-600">Optimised</div>
            <div className="text-base font-semibold text-emerald-700 mt-0.5">{data.optimized_total_km.toFixed(1)} km</div>
          </div>
          <div className="rounded-md bg-blue-50 border border-blue-200 px-2 py-3">
            <div className="text-[10px] uppercase tracking-wider text-blue-600 flex items-center justify-center gap-1">
              <TrendingDown className="h-3 w-3" /> Saved
            </div>
            <div className="text-base font-semibold text-blue-700 mt-0.5">
              {savings != null && savings > 0 ? `${savings.toFixed(1)} km` : '—'}
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Proposed order</div>
        <ol className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {data.optimized_order.map((did, newIdx) => {
            const d = byId.get(did);
            if (!d) return null;
            const moved = d.originalIdx !== newIdx;
            return (
              <li key={did} className="flex items-center gap-2 text-sm" data-testid={`optimize-order-${did}`}>
                <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">{newIdx + 1}</span>
                <span className="flex-1 truncate text-slate-800">{d.customer_name || 'Stop'}</span>
                {moved && (
                  <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-mono">
                    was #{d.originalIdx + 1}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

