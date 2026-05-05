import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, isToday, isTomorrow, isPast, isValid } from 'date-fns';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { CalendarDays, Building2, ArrowRight, User, Phone, Mail, AlertCircle } from 'lucide-react';

const formatFollowupDate = (dateStr) => {
  if (!dateStr) return { text: 'No date', cls: 'bg-slate-100 text-slate-600', urgency: 'none' };
  try {
    const date = parseISO(dateStr);
    if (!isValid(date)) return { text: 'No date', cls: 'bg-slate-100 text-slate-600', urgency: 'none' };
    if (isPast(date) && !isToday(date)) return { text: format(date, 'MMM d'), cls: 'bg-rose-100 text-rose-700', urgency: 'overdue' };
    if (isToday(date)) return { text: 'Today', cls: 'bg-rose-500 text-white', urgency: 'today' };
    if (isTomorrow(date)) return { text: 'Tomorrow', cls: 'bg-amber-100 text-amber-800', urgency: 'tomorrow' };
    return { text: format(date, 'EEE, MMM d'), cls: 'bg-slate-100 text-slate-700', urgency: 'later' };
  } catch {
    return { text: 'No date', cls: 'bg-slate-100 text-slate-600', urgency: 'none' };
  }
};

const URGENCY_RING = {
  overdue: 'border-rose-300 ring-1 ring-rose-200/60',
  today:   'border-rose-300 ring-2 ring-rose-200/80 shadow-rose-100 shadow-md',
  tomorrow:'border-amber-200',
  later:   'border-slate-100',
  none:    'border-slate-100',
};

export function UpcomingFollowupsWidget({ upcomingLeads }) {
  const navigate = useNavigate();
  const items = Array.isArray(upcomingLeads) ? upcomingLeads : [];

  // Group by urgency for an at-a-glance summary
  const urgencyCounts = items.reduce((acc, it) => {
    const u = formatFollowupDate(it.next_follow_up).urgency;
    acc[u] = (acc[u] || 0) + 1;
    return acc;
  }, {});
  const overdueCount = (urgencyCounts.overdue || 0) + (urgencyCounts.today || 0);

  return (
    <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50" data-testid="followups-widget">
      {/* Header */}
      <div className="p-4 sm:p-5 pb-3 flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/50 dark:to-amber-900/30 shrink-0">
            <CalendarDays className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </div>
          <span>Upcoming Follow-ups</span>
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400 truncate">· {items.length}</span>
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white px-2 py-0.5 rounded-full" data-testid="followups-urgent-badge">
              <AlertCircle className="h-2.5 w-2.5" />
              {overdueCount} urgent
            </span>
          )}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs font-semibold text-orange-700 dark:text-orange-400 hover:text-orange-800 hover:bg-orange-50 h-7 px-2"
          onClick={() => navigate('/leads')}
          data-testid="followups-view-all"
        >
          View all <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-5 pb-5">
        {items.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl" data-testid="followups-empty">
            <CalendarDays className="h-10 w-10 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">No follow-ups this week</p>
            <p className="text-xs text-slate-400 mt-1">You're all caught up — go close some deals!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5" data-testid="followups-grid">
            {items.slice(0, 8).map(item => {
              const dateInfo = formatFollowupDate(item.next_follow_up);
              const isAccount = item.type === 'account';
              const ring = URGENCY_RING[dateInfo.urgency] || URGENCY_RING.later;
              const title = isAccount ? item.account_name : item.company;
              const contact = isAccount ? item.contact_name : item.contact_person;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(isAccount ? `/accounts/${item.id}` : `/leads/${item.id}`)}
                  className={`group text-left relative rounded-xl border ${ring} bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all p-3 hover:shadow-md hover:-translate-y-0.5 flex flex-col gap-1.5`}
                  data-testid={`followup-card-${item.id}`}
                  data-urgency={dateInfo.urgency}
                >
                  {/* Top row: type chip + due pill */}
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                      isAccount ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                    }`}>
                      <Building2 className="h-2.5 w-2.5" />
                      {isAccount ? 'Account' : 'Lead'}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${dateInfo.cls}`}>
                      {dateInfo.text}
                    </span>
                  </div>

                  {/* Title */}
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate leading-snug group-hover:text-emerald-700 transition-colors" title={title}>
                    {title || '—'}
                  </p>

                  {/* Contact + quick action icons */}
                  <div className="flex items-center justify-between mt-auto pt-1">
                    {contact ? (
                      <span className="text-[11px] text-slate-500 truncate flex items-center gap-1 min-w-0" title={contact}>
                        <User className="h-3 w-3 flex-shrink-0 opacity-70" />
                        <span className="truncate">{contact}</span>
                      </span>
                    ) : <span className="text-[11px] text-slate-400 italic">No contact</span>}
                    <div className="flex items-center gap-1 text-slate-300 group-hover:text-slate-600 transition-colors">
                      {item.contact_phone && <Phone className="h-3 w-3" />}
                      {item.contact_email && <Mail className="h-3 w-3" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {items.length > 8 && (
          <button
            onClick={() => navigate('/leads')}
            className="mt-3 w-full text-center text-xs font-semibold text-orange-700 hover:text-orange-800 hover:bg-orange-50 dark:hover:bg-orange-900/20 py-2 rounded-lg transition-colors"
            data-testid="followups-show-more"
          >
            +{items.length - 8} more follow-ups · View all <ArrowRight className="h-3 w-3 inline" />
          </button>
        )}
      </div>
    </Card>
  );
}
