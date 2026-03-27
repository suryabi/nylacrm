import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../ui/card';
import axios from 'axios';
import { ClipboardList, UserCheck, AlertTriangle, Flame, ArrowRight, CheckCircle2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export function TaskMetricsWidget() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/task-management/tasks/my-dashboard-stats`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStats(res.data);
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const tiles = [
    {
      label: 'Assigned to Me',
      value: stats?.assigned_to_me || 0,
      icon: UserCheck,
      gradient: 'from-blue-500 to-indigo-600',
      bgGradient: 'from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20',
      iconBg: 'bg-blue-100 dark:bg-blue-900/50',
      textColor: 'text-blue-700 dark:text-blue-300',
      onClick: () => navigate('/tasks?view=my_tasks')
    },
    {
      label: 'Created by Me',
      value: stats?.created_by_me || 0,
      icon: ClipboardList,
      gradient: 'from-emerald-500 to-teal-600',
      bgGradient: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/50',
      textColor: 'text-emerald-700 dark:text-emerald-300',
      onClick: () => navigate('/tasks?view=assigned_by_me')
    },
    {
      label: 'Overdue',
      value: stats?.overdue || 0,
      icon: AlertTriangle,
      gradient: 'from-red-500 to-rose-600',
      bgGradient: 'from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/20',
      iconBg: 'bg-red-100 dark:bg-red-900/50',
      textColor: 'text-red-700 dark:text-red-300',
      onClick: () => navigate('/tasks?view=my_tasks&status=open,in_progress,review&overdue=true')
    },
    {
      label: 'High Severity',
      value: stats?.high_severity || 0,
      icon: Flame,
      gradient: 'from-amber-500 to-orange-600',
      bgGradient: 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20',
      iconBg: 'bg-amber-100 dark:bg-amber-900/50',
      textColor: 'text-amber-700 dark:text-amber-300',
      onClick: () => navigate('/tasks?view=my_tasks&severity=high')
    }
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[1,2,3,4].map(i => (
          <Card key={i} className="border-0 bg-slate-50 animate-pulse h-[88px] sm:h-[100px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="task-metrics-widget">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <Card
            key={tile.label}
            onClick={tile.onClick}
            className={`relative overflow-hidden border-0 bg-gradient-to-br ${tile.bgGradient} backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group cursor-pointer`}
            data-testid={`task-metric-${tile.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${tile.gradient}`} />
            <div className="p-3 sm:p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1 sm:space-y-2">
                  <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider line-clamp-1">
                    {tile.label}
                  </p>
                  <p className={`text-2xl sm:text-3xl font-bold ${tile.textColor} tabular-nums`}>
                    {tile.value}
                  </p>
                </div>
                <div className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl ${tile.iconBg} group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${tile.textColor}`} />
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
