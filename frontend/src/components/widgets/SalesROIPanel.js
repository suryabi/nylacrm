import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Loader2, TrendingUp, TrendingDown, ChevronDown, ChevronRight, IndianRupee } from 'lucide-react';
import { cn } from '../../lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Get auth headers for API calls
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Format currency in Indian style (lakhs, crores)
const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '---';
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  
  if (absAmount >= 10000000) {
    return `${sign}${(absAmount / 10000000).toFixed(2)} Cr`;
  } else if (absAmount >= 100000) {
    return `${sign}${(absAmount / 100000).toFixed(2)} L`;
  } else if (absAmount >= 1000) {
    return `${sign}${(absAmount / 1000).toFixed(2)} K`;
  }
  return `${sign}${absAmount.toFixed(0)}`;
};

// Format full currency with rupee symbol
const formatFullCurrency = (amount) => {
  if (amount === null || amount === undefined) return '---';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

export default function SalesROIPanel() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    ctc: false,
    expenses: false
  });

  // Check if user is in Sales department
  const isSalesDepartment = user?.department?.toLowerCase() === 'sales';

  useEffect(() => {
    if (!isSalesDepartment) {
      setLoading(false);
      return;
    }
    
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_URL}/sales-roi-summary`, {
          headers: getAuthHeaders()
        });
        setData(response.data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch Sales ROI data:', err);
        setError(err.response?.data?.detail || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isSalesDepartment]);

  // Don't render if user is not in Sales department
  if (!isSalesDepartment) {
    return null;
  }

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-50 border-l border-slate-200">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-50 border-l border-slate-200 p-4">
        <p className="text-sm text-red-500 text-center">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { period, team, cost, revenue, profitability } = data;
  const isNegativeROI = profitability.roi_percentage < 0;

  return (
    <div className="h-full bg-white border-l border-slate-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
          Sales ROI Statement
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {period.start_date} to {period.end_date} ({period.days} days)
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          Team Size: {team.total_members} member{team.total_members !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          
          {/* ============ COST SECTION ============ */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Cost
            </h3>
            
            {/* Team CTC */}
            <div className="space-y-1">
              <button
                onClick={() => toggleSection('ctc')}
                className="w-full flex items-center justify-between py-1 hover:bg-slate-50 rounded transition-colors"
              >
                <span className="flex items-center gap-1 text-sm text-slate-700">
                  {expandedSections.ctc ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  Team Cost to Company (CTC)
                </span>
                <span className="text-sm font-medium text-slate-900 tabular-nums">
                  {formatFullCurrency(cost.team_ctc.total)}
                </span>
              </button>
              
              {/* CTC Breakdown */}
              {expandedSections.ctc && (
                <div className="ml-4 pl-3 border-l border-slate-200 space-y-1">
                  {cost.team_ctc.details.map((member, idx) => (
                    <div key={idx} className="flex justify-between text-xs text-slate-500">
                      <span className="truncate max-w-[140px]">{member.name}</span>
                      <span className="tabular-nums">{formatFullCurrency(member.prorated_ctc)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sales Expenses */}
            <div className="space-y-1 mt-2">
              <button
                onClick={() => toggleSection('expenses')}
                className="w-full flex items-center justify-between py-1 hover:bg-slate-50 rounded transition-colors"
              >
                <span className="flex items-center gap-1 text-sm text-slate-700">
                  {expandedSections.expenses ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  Sales Expenses
                </span>
                <span className="text-sm font-medium text-slate-900 tabular-nums">
                  {formatFullCurrency(cost.expenses.total)}
                </span>
              </button>
              
              {/* Expenses Breakdown */}
              {expandedSections.expenses && (
                <div className="ml-4 pl-3 border-l border-slate-200 space-y-1">
                  {cost.expenses.breakdown.length > 0 ? (
                    cost.expenses.breakdown.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs text-slate-500">
                        <span className="truncate max-w-[140px]">{item.category}</span>
                        <span className="tabular-nums">{formatFullCurrency(item.amount)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic">No approved expenses</p>
                  )}
                </div>
              )}
            </div>

            {/* Total Cost */}
            <div className="mt-3 pt-2 border-t border-slate-300">
              <div className="flex justify-between">
                <span className="text-sm font-semibold text-slate-800">Total Cost</span>
                <span className="text-sm font-bold text-slate-900 tabular-nums">
                  {formatFullCurrency(cost.total_cost)}
                </span>
              </div>
            </div>
          </section>

          {/* ============ REVENUE SECTION ============ */}
          <section className="pt-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Revenue
            </h3>
            
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">Gross Invoice Value</span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {formatFullCurrency(revenue.gross_invoice_value)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">Less: Distribution ({revenue.distribution_percent}%)</span>
                <span className="font-medium text-red-600 tabular-nums">
                  ({formatFullCurrency(revenue.distribution_cost)})
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">Less: Logistics ({revenue.logistics_percent}%)</span>
                <span className="font-medium text-red-600 tabular-nums">
                  ({formatFullCurrency(revenue.logistics_cost)})
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">Less: COGS</span>
                <span className="font-medium text-red-600 tabular-nums">
                  ({formatFullCurrency(revenue.total_cogs)})
                </span>
              </div>
            </div>

            {/* Gross Margin */}
            <div className="mt-3 pt-2 border-t border-slate-300">
              <div className="flex justify-between">
                <span className="text-sm font-semibold text-slate-800">Gross Margin</span>
                <div className="text-right">
                  <span className={cn(
                    "text-sm font-bold tabular-nums",
                    revenue.gross_margin >= 0 ? "text-green-700" : "text-red-600"
                  )}>
                    {formatFullCurrency(revenue.gross_margin)}
                  </span>
                  <span className="text-xs text-slate-500 ml-1">
                    ({revenue.gross_margin_percent}%)
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ============ PROFITABILITY SECTION ============ */}
          <section className="pt-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Profitability
            </h3>
            
            {/* Net Contribution */}
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-700">Net Contribution</span>
              <span className={cn(
                "font-semibold tabular-nums",
                profitability.net_contribution >= 0 ? "text-green-700" : "text-red-600"
              )}>
                {profitability.net_contribution >= 0 ? '+' : ''}
                {formatFullCurrency(profitability.net_contribution)}
              </span>
            </div>
            
            <p className="text-[10px] text-slate-400 mb-3">
              (Gross Margin − Total Cost)
            </p>

            {/* ROI */}
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">ROI</span>
                <div className="flex items-center gap-2">
                  {isNegativeROI ? (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  ) : (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  )}
                  <span className={cn(
                    "text-lg font-bold tabular-nums",
                    isNegativeROI ? "text-red-600" : "text-green-700"
                  )}>
                    {profitability.roi_percentage >= 0 ? '+' : ''}
                    {profitability.roi_percentage}%
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                (Net Contribution ÷ Total Cost) × 100
              </p>
            </div>
          </section>

        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-200 bg-slate-50">
        <p className="text-[10px] text-slate-400 text-center">
          Financial Accountability Report
        </p>
      </div>
    </div>
  );
}
