import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card } from './ui/card';
import { SectionHeader } from './detail/SectionHeader';
import { Button } from './ui/button';
import { Loader2, Truck, Plus } from 'lucide-react';
import { CreateOrderDialog, StateBadge, FulfillmentBadge } from '../pages/DeliveryOrders';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, withCredentials: true });
const fmtINR = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');

// Lead / Account specific Delivery Orders, with an inline create pre-bound to the entity.
export default function EntityDeliveryOrders({ entityType, entityId, entityName, entity }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [skus, setSkus] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [cities, setCities] = useState([]);

  const fetchOrders = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const param = entityType === 'lead' ? 'lead_id' : 'account_id';
      const { data } = await axios.get(`${API_URL}/delivery-orders?${param}=${entityId}`, auth());
      setOrders(data.orders || []);
    } catch { /* non-blocking */ }
    finally { setLoading(false); }
  }, [entityType, entityId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    (async () => {
      try {
        const [s, r] = await Promise.all([
          axios.get(`${API_URL}/master-skus`, auth()),
          axios.get(`${API_URL}/admin/promo-reasons`, auth()),
        ]);
        setSkus((s.data.skus || []).filter((x) => x.is_active !== false));
        setReasons(r.data.reasons || r.data.promo_reasons || (Array.isArray(r.data) ? r.data : []));
        try {
          const c = await axios.get(`${API_URL}/master-locations/flat`, auth());
          setCities(c.data.cities || []);
        } catch { /* cities optional */ }
      } catch { /* non-blocking */ }
    })();
  }, []);

  return (
    <Card className="p-4 sm:p-6" data-testid="entity-delivery-orders">
      <SectionHeader
        eyebrow="Logistics"
        title="Stock Delivery Requests"
        icon={Truck}
        testid="header-delivery-orders"
        actions={<Button size="sm" onClick={() => setShowCreate(true)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="entity-do-new-btn"><Plus className="mr-1 h-4 w-4" /> New</Button>}
      />

      {loading ? (
        <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-emerald-600" /></div>
      ) : orders.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400" data-testid="entity-do-empty">
          No stock delivery requests yet for this {entityType}.
        </p>
      ) : (
        <div className="space-y-2" data-testid="entity-do-list">
          {orders.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3" data-testid={`entity-do-${o.order_number}`}>
              <div>
                <p className="font-mono text-sm font-semibold text-emerald-700">{o.order_number}</p>
                <p className="text-xs text-slate-500">
                  {o.requested_date || '—'} · {(o.items || []).length} item(s) · {fmtINR(o.total_value)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {o.fulfillment_status && <FulfillmentBadge status={o.fulfillment_status} />}
                <StateBadge order={o} />
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateOrderDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        skus={skus}
        reasons={reasons}
        cities={cities}
        onCreated={fetchOrders}
        presetRecipient={{ type: entityType, entity, name: entityName }}
      />
    </Card>
  );
}
