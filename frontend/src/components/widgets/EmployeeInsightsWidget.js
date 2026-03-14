import React, { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import axios from 'axios';
import { 
  TrendingUp, 
  Wallet, 
  Target, 
  Receipt, 
  Eye, 
  EyeOff,
  Calendar,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  BadgeIndianRupee,
  Briefcase
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import { cn } from '../../lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Safe date formatter
const formatSafeDate = (dateValue, formatStr = 'MMM d, yyyy') => {
  if (!dateValue) return 'N/A';
  try {
    const date = new Date(dateValue);
    if (!isValid(date)) return 'N/A';
    return format(date, formatStr);
  } catch (e) {
    return 'N/A';
  }
};

// Format currency with Indian numbering system
const formatCurrency = (amount, masked = false) => {
  if (masked) return '₹ •••••••';
  if (!amount && amount !== 0) return '₹ 0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

// Compact currency format
const formatCompact = (amount) => {
  if (!amount) return '₹0';
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount.toLocaleString('en-IN')}`;
};

export function EmployeeInsightsWidget() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSensitive, setShowSensitive] = useState(false);

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      const response = await axios.get(`${API_URL}/employee-insights`, { withCredentials: true });
      setData(response.data);
    } catch (error) {
      console.error('Failed to fetch insights:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-2xl">
        <div className="p-6 animate-pulse">
          <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-slate-700 rounded"></div>
            <div className="h-16 bg-slate-700 rounded"></div>
          </div>
        </div>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const canViewHR = data.can_view_hr_data;
  const hasJoiningDate = !!data.joining_date;
  
  // Calculate performance metrics
  const totalRevenue = data.revenue?.total || 0;
  const grossMargin = data.gross_margin || 0;
  const totalExpenses = data.expenses?.total || 0;

  return (
    <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-2xl relative">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-violet-500/10 to-transparent rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-emerald-500/10 to-transparent rounded-full blur-3xl"></div>
      
      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/20">
              <Sparkles className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">My Performance</h2>
              {hasJoiningDate ? (
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Since {formatSafeDate(data.joining_date)} • {data.days_since_joining} days
                </p>
              ) : (
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {data.designation || 'Team Member'}
                </p>
              )}
            </div>
          </div>
          
          {canViewHR && (
            <button
              onClick={() => setShowSensitive(!showSensitive)}
              className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
              title={showSensitive ? 'Hide sensitive data' : 'Show sensitive data'}
            >
              {showSensitive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Main Stats Grid - Visible to ALL employees */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Revenue */}
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-slate-700/50 hover:border-emerald-500/30 transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500">
                <TrendingUp className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Since joining</span>
            </div>
            <p className="text-lg font-bold text-emerald-400">{formatCompact(totalRevenue)}</p>
            <p className="text-xs text-slate-400">Total Revenue</p>
          </div>

          {/* Gross Margin */}
          <div className="p-3 rounded-xl bg-blue-500/10 border border-slate-700/50 hover:border-blue-500/30 transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                <Target className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Profit</span>
            </div>
            <p className="text-lg font-bold text-blue-400">{formatCompact(grossMargin)}</p>
            <p className="text-xs text-slate-400">Gross Margin</p>
          </div>

          {/* Expenses */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-slate-700/50 hover:border-amber-500/30 transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500">
                <Receipt className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Budget used</span>
            </div>
            <p className="text-lg font-bold text-amber-400">{formatCompact(totalExpenses)}</p>
            <p className="text-xs text-slate-400">Expenses</p>
          </div>

          {/* CTC or Impact Score - based on role */}
          {canViewHR ? (
            <div className="p-3 rounded-xl bg-violet-500/10 border border-slate-700/50 hover:border-violet-500/30 transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500">
                  <Wallet className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">{data.months_since_joining || 0} months</span>
              </div>
              <p className="text-lg font-bold text-violet-400">
                {showSensitive ? formatCompact(data.ctc?.till_date) : '₹ •••••'}
              </p>
              <p className="text-xs text-slate-400">Total CTC</p>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-violet-500/10 border border-slate-700/50 hover:border-violet-500/30 transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500">
                  <Award className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Score</span>
              </div>
              <p className="text-lg font-bold text-violet-400">
                {grossMargin > 0 ? Math.round((grossMargin / (totalExpenses || 1)) * 100) : 0}%
              </p>
              <p className="text-xs text-slate-400">Efficiency</p>
            </div>
          )}
        </div>

        {/* HR-only section: CTC Summary & Net Contribution */}
        {canViewHR && (
          <>
            {/* CTC Summary Bar */}
            <div className="mb-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BadgeIndianRupee className="h-4 w-4 text-violet-400" />
                  <span className="text-sm text-slate-300">Monthly CTC</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {showSensitive ? formatCurrency(data.ctc?.monthly) : '₹ •••••••'}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-slate-500">Annual CTC</span>
                <span className="text-xs text-slate-400">
                  {showSensitive ? formatCurrency(data.ctc?.yearly) : '₹ •••••••'}
                </span>
              </div>
            </div>

            {/* Net Contribution */}
            {data.net_contribution !== null && (
              <div className={cn(
                "p-3 rounded-xl border",
                data.net_contribution >= 0 
                  ? "bg-emerald-500/5 border-emerald-500/20" 
                  : "bg-red-500/5 border-red-500/20"
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "p-1.5 rounded-lg",
                      data.net_contribution >= 0 ? "bg-emerald-500/20" : "bg-red-500/20"
                    )}>
                      {data.net_contribution >= 0 ? (
                        <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Net Contribution</p>
                      <p className="text-[10px] text-slate-500">Revenue - CTC - Expenses</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "text-lg font-bold",
                      data.net_contribution >= 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {showSensitive ? formatCompact(Math.abs(data.net_contribution)) : '₹ •••••'}
                    </p>
                    {showSensitive && data.roi_percentage !== null && (
                      <p className={cn(
                        "text-xs font-medium",
                        data.net_contribution >= 0 ? "text-emerald-400" : "text-red-400"
                      )}>
                        {data.net_contribution >= 0 ? '+' : ''}{data.roi_percentage}% ROI
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Non-HR users see an impact summary */}
        {!canViewHR && (
          <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-emerald-400" />
                <div>
                  <p className="text-sm text-white font-medium">Your Impact</p>
                  <p className="text-[10px] text-slate-400">Revenue contribution to company</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-emerald-400">
                  {formatCompact(totalRevenue)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
