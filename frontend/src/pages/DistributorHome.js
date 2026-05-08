import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Loader2, Truck, Package, RotateCcw, Receipt, ArrowRight,
  Building2, MapPin, ArrowUpRight, PackagePlus, AlertCircle, IndianRupee
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const formatCurrency = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

const Greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const StatusPill = ({ status }) => {
  const map = {
    delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    draft: 'bg-slate-50 text-slate-600 border-slate-200',
    in_transit: 'bg-blue-50 text-blue-700 border-blue-200',
    dispatched: 'bg-blue-50 text-blue-700 border-blue-200',
    approved: 'bg-violet-50 text-violet-700 border-violet-200',
    cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  const cls = map[(status || '').toLowerCase()] || 'bg-slate-50 text-slate-600 border-slate-200';
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-wide ${cls}`}>
      {(status || '').replace('_', ' ')}
    </span>
  );
};

export default function DistributorHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchHome = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/distributor-portal/home`, { withCredentials: true });
      setData(res.data);
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Could not load your dashboard.';
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHome(); }, [fetchHome]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-amber-500" />
          <p className="text-sm text-slate-600">
            Your account isn't linked to a distributor yet. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  const dist = data.distributor || {};
  const distId = dist.id;
  const distName = dist.distributor_name || dist.name || 'My Distributor';
  const distCode = dist.distributor_code || dist.code;
  const billing = dist.billing_address || dist.registered_address || {};
  const distCity = billing.city || dist.city;
  const distState = billing.state || dist.state;
  const stockOutHref = `/distributors/${distId}?tab=stockout`;
  const profileHref = `/distributors/${distId}?tab=profile`;

  const kpis = [
    {
      key: 'stock',
      label: 'Total Stock',
      value: data.stock_summary.total_units.toLocaleString('en-IN'),
      sub: `${data.stock_summary.active_skus} SKUs`,
      icon: Package,
      tint: 'bg-blue-50 text-blue-700',
      href: `/distributors/${distId}?tab=stock-dashboard`,
    },
    {
      key: 'pending_in',
      label: 'Pending Stock-In',
      value: data.stock_summary.pending_stock_in_shipments,
      sub: 'Shipments en-route',
      icon: PackagePlus,
      tint: 'bg-violet-50 text-violet-700',
      href: `/distributors/${distId}?tab=stockin`,
    },
    {
      key: 'pending_out',
      label: 'Pending Deliveries',
      value: data.stock_summary.pending_deliveries,
      sub: 'Drafts to record',
      icon: Truck,
      tint: 'bg-amber-50 text-amber-700',
      href: stockOutHref,
    },
    {
      key: 'pending_returns',
      label: 'Returns to Factory',
      value: data.stock_summary.pending_return_units.toLocaleString('en-IN'),
      sub: 'Bottles awaiting',
      icon: RotateCcw,
      tint: 'bg-rose-50 text-rose-700',
      href: `/distributors/${distId}?tab=returns`,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1" data-testid="distributor-home-header">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-medium">
          {Greeting()}
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight">
          Hi {user?.name?.split(' ')[0] || 'there'},
        </h1>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Building2 className="h-3.5 w-3.5" />
          <span className="font-medium text-slate-700">{distName}</span>
          {distCode && <span className="text-slate-400">· {distCode}</span>}
          {(distCity || distState) && (
            <>
              <span className="text-slate-300">·</span>
              <MapPin className="h-3.5 w-3.5" />
              <span>{[distCity, distState].filter(Boolean).join(', ')}</span>
            </>
          )}
        </div>
      </div>

      {/* Primary CTA — Record Delivery */}
      <button
        onClick={() => navigate(stockOutHref)}
        data-testid="cta-record-delivery"
        className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 sm:p-6 text-left transition-all hover:shadow-xl hover:-translate-y-0.5"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400 font-medium mb-1">
              Stock Out
            </p>
            <p className="text-lg sm:text-xl font-semibold text-white">
              Record a Delivery
            </p>
            <p className="text-xs text-slate-300 mt-1 max-w-md">
              Log every dispatch from your warehouse to customers. Stock and settlement update automatically.
            </p>
          </div>
          <div className="flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-white/10 group-hover:bg-white/20 transition-colors">
            <Truck className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-200 group-hover:text-white transition-colors">
          Open Stock Out
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
        </div>
      </button>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="distributor-home-kpis">
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <button
              key={k.key}
              onClick={() => navigate(k.href)}
              data-testid={`kpi-${k.key}`}
              className="group bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${k.tint}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-600 transition-colors" />
              </div>
              <p className="text-2xl font-semibold text-slate-900 leading-none">{k.value}</p>
              <p className="text-[11px] text-slate-500 mt-1 font-medium uppercase tracking-wider">{k.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{k.sub}</p>
            </button>
          );
        })}
      </div>

      {/* Financials + Last settlement */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <div
          className="bg-white border border-slate-200 rounded-xl p-5"
          data-testid="financials-card"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Account Balance</h3>
            <IndianRupee className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Outstanding</p>
              <p className={`text-2xl font-semibold ${data.financials.outstanding_balance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                ₹ {formatCurrency(data.financials.outstanding_balance)}
              </p>
            </div>
            {data.financials.last_payment_amount != null && (
              <div className="pt-3 border-t border-slate-100">
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Last Payment</p>
                <p className="text-sm font-medium text-slate-700 mt-0.5">
                  ₹ {formatCurrency(data.financials.last_payment_amount)}
                  {data.financials.last_payment_date && (
                    <span className="text-slate-400 font-normal text-xs ml-2">
                      on {format(new Date(data.financials.last_payment_date), 'dd MMM yyyy')}
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        <div
          className="bg-white border border-slate-200 rounded-xl p-5"
          data-testid="last-settlement-card"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Last Settlement</h3>
            <Receipt className="h-3.5 w-3.5 text-slate-400" />
          </div>
          {data.last_settlement ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold text-slate-900">
                  {data.last_settlement.settlement_number}
                </p>
                <StatusPill status={data.last_settlement.status} />
              </div>
              <p className="text-xs text-slate-500">
                {[data.last_settlement.settlement_month, data.last_settlement.settlement_year].filter(Boolean).join(' ')}
              </p>
              <div className="pt-3 border-t border-slate-100">
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Final Payout</p>
                <p className="text-xl font-semibold text-slate-900 mt-0.5">
                  ₹ {formatCurrency(data.last_settlement.final_payout ?? data.last_settlement.total_billing_value)}
                </p>
              </div>
              <button
                onClick={() => navigate(`/distributors/${distId}?tab=settlements`)}
                className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 mt-2"
                data-testid="view-all-settlements"
              >
                View all settlements <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No settlements yet.</p>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <RecentList
          title="Recent Deliveries"
          icon={Truck}
          items={data.recent_deliveries}
          emptyText="No deliveries yet."
          ctaText="View all"
          onCta={() => navigate(stockOutHref)}
          renderItem={(d) => ({
            primary: d.delivery_number,
            secondary: d.account_name,
            meta: d.delivery_date ? format(new Date(d.delivery_date), 'dd MMM') : '',
            qty: d.total_quantity,
            status: d.status,
          })}
          testid="recent-deliveries-card"
        />
        <RecentList
          title="Recent Stock-In"
          icon={PackagePlus}
          items={data.recent_shipments}
          emptyText="No incoming shipments yet."
          ctaText="View all"
          onCta={() => navigate(`/distributors/${distId}?tab=stockin`)}
          renderItem={(s) => ({
            primary: s.shipment_number,
            secondary: s.actual_arrival_date
              ? `Arrived ${format(new Date(s.actual_arrival_date), 'dd MMM')}`
              : s.expected_arrival_date
                ? `ETA ${format(new Date(s.expected_arrival_date), 'dd MMM')}`
                : '—',
            qty: s.total_quantity,
            status: s.status,
          })}
          testid="recent-shipments-card"
        />
        <RecentList
          title="Recent Customer Returns"
          icon={RotateCcw}
          items={data.recent_returns}
          emptyText="No customer returns yet."
          ctaText="View all"
          onCta={() => navigate(`/distributors/${distId}?tab=returns`)}
          renderItem={(r) => ({
            primary: r.return_number,
            secondary: r.account_name,
            meta: r.return_date ? format(new Date(r.return_date), 'dd MMM') : '',
            qty: r.total_quantity,
            status: r.status,
          })}
          testid="recent-returns-card"
        />
        <button
          onClick={() => navigate(profileHref)}
          data-testid="view-profile-card"
          className="group bg-white border border-dashed border-slate-300 rounded-xl p-5 text-left hover:border-slate-500 hover:bg-slate-50/50 transition-all flex flex-col justify-center items-start min-h-[180px]"
        >
          <Building2 className="h-5 w-5 text-slate-400 mb-2" />
          <p className="text-sm font-semibold text-slate-700">View My Profile</p>
          <p className="text-xs text-slate-500 mt-1">
            Coverage areas, locations, billing details and contacts
          </p>
          <div className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500 group-hover:text-slate-900">
            Open profile <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
          </div>
        </button>
      </div>
    </div>
  );
}

function RecentList({ title, icon: Icon, items, emptyText, ctaText, onCta, renderItem, testid }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5" data-testid={testid}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-400" />
          {title}
        </h3>
        {items?.length > 0 && (
          <button
            onClick={onCta}
            className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
          >
            {ctaText} <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
      {items?.length ? (
        <ul className="space-y-3">
          {items.map((it, idx) => {
            const r = renderItem(it);
            return (
              <li key={idx} className="flex items-center justify-between gap-3 pb-3 last:pb-0 border-b last:border-0 border-slate-100">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{r.primary || '—'}</p>
                  <p className="text-xs text-slate-500 truncate">{r.secondary || ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.qty != null && (
                    <span className="text-xs font-medium text-slate-600">{r.qty}</span>
                  )}
                  <StatusPill status={r.status} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">{emptyText}</p>
      )}
    </div>
  );
}
