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
  BadgeIndianRupee
} from 'lucide-react';
import { format, differenceInDays, differenceInMonths } from 'date-fns';
import { cn } from '../../lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

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
const formatCompact = (amount, masked = false) => {
  if (masked) return '•••';
  if (!amount) return '0';
  if (amount >= 10000000) return `${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toString();
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
            <div className="h-20 bg-slate-700 rounded"></div>
            <div className="h-20 bg-slate-700 rounded"></div>
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
  
  // Calculate profit/loss
  const netContribution = data.net_contribution || 0;
  const isProfit = netContribution >= 0;
  
  // Stats for the grid
  const stats = [
    {
      label: 'Total Revenue',
      value: data.revenue?.total || 0,
      icon: TrendingUp,
      color: 'from-emerald-500 to-teal-500',
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      description: 'Since joining',
      sensitive: false,
    },
    {
      label: 'Gross Margin',
      value: data.gross_margin || 0,
      icon: Target,
      color: 'from-blue-500 to-cyan-500',
      textColor: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      description: 'Total profit generated',
      sensitive: false,
    },
    {
      label: 'Total CTC',
      value: data.ctc?.till_date || 0,
      icon: Wallet,
      color: 'from-violet-500 to-purple-500',
      textColor: 'text-violet-400',
      bgColor: 'bg-violet-500/10',
      description: `${data.months_since_joining || 0} months`,
      sensitive: true,
    },
    {
      label: 'Expenses',
      value: data.expenses?.total || 0,
      icon: Receipt,
      color: 'from-amber-500 to-orange-500',
      textColor: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      description: 'Budget spent',
      sensitive: false,
    },
  ];

  return (
    <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-2xl relative">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-violet-500/10 to-transparent rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-emerald-500/10 to-transparent rounded-full blur-3xl"></div>
      
      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/20">
              <Sparkles className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Performance Insights</h2>
              {hasJoiningDate && (
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Since {format(new Date(data.joining_date), 'MMM d, yyyy')} • {data.days_since_joining} days
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

        {/* CTC Summary Bar */}
        {canViewHR && (
          <div className="mb-5 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
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
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {stats.map((stat, idx) => {
            const Icon = stat.icon;
            const isSensitive = stat.sensitive && canViewHR;
            const shouldMask = isSensitive && !showSensitive;
            
            // Skip CTC for non-HR viewers
            if (stat.sensitive && !canViewHR) return null;
            
            return (
              <div
                key={idx}
                className={cn(
                  "p-3 rounded-xl border transition-all duration-300 hover:scale-[1.02]",
                  stat.bgColor,
                  "border-slate-700/50 hover:border-slate-600/50"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={cn("p-1.5 rounded-lg bg-gradient-to-br", stat.color)}>
                    <Icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                    {stat.description}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <p className={cn("text-lg font-bold", stat.textColor)}>
                    {shouldMask ? '₹ •••••' : formatCurrency(stat.value)}
                  </p>
                  <p className="text-xs text-slate-400">{stat.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ROI / Net Contribution */}
        {canViewHR && (
          <div className={cn(
            "p-4 rounded-xl border",
            isProfit 
              ? "bg-emerald-500/5 border-emerald-500/20" 
              : "bg-red-500/5 border-red-500/20"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "p-2 rounded-lg",
                  isProfit ? "bg-emerald-500/20" : "bg-red-500/20"
                )}>
                  {isProfit ? (
                    <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-red-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Net Contribution</p>
                  <p className="text-xs text-slate-400">Revenue - CTC - Expenses</p>
                </div>
              </div>
              <div className="text-right">
                <p className={cn(
                  "text-xl font-bold",
                  isProfit ? "text-emerald-400" : "text-red-400"
                )}>
                  {showSensitive ? formatCurrency(Math.abs(netContribution)) : '₹ •••••••'}
                </p>
                {showSensitive && data.roi_percentage !== null && (
                  <p className={cn(
                    "text-xs font-medium",
                    isProfit ? "text-emerald-400" : "text-red-400"
                  )}>
                    {isProfit ? '+' : ''}{data.roi_percentage}% ROI
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Non-HR users see a simplified summary */}
        {!canViewHR && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-emerald-400" />
                <span className="text-sm text-white font-medium">Your Impact</span>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-emerald-400">
                  {formatCompact(data.revenue?.total)}
                </p>
                <p className="text-xs text-slate-400">Total Revenue</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
