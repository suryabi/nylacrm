import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { meetingMinutesAPI } from '../utils/api';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Plus, Calendar as CalendarIcon, Users, X, ChevronDown,
  FileText, Loader2, Search, ListChecks, MessageSquare,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PERIODICITIES = [
  { value: 'weekly', label: 'Weekly', color: 'bg-blue-100 text-blue-700' },
  { value: 'monthly', label: 'Monthly', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'quarterly', label: 'Quarterly', color: 'bg-amber-100 text-amber-700' },
  { value: 'adhoc', label: 'Ad-hoc', color: 'bg-slate-100 text-slate-600' },
];

const PURPOSES = [
  { value: 'sales', label: 'Sales', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'production', label: 'Production', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'general', label: 'General', color: 'bg-slate-50 text-slate-700 border-slate-200' },
  { value: 'finance', label: 'Finance', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'administration', label: 'Administration', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'investors', label: 'Investors', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { value: 'marketing', label: 'Marketing', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function MultiSelect({ options, selected, onChange, placeholder, testId }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" data-testid={testId}>
      <div className="flex flex-wrap gap-1.5 min-h-[38px] p-2 border border-slate-200 rounded-lg bg-white cursor-pointer hover:border-slate-300 transition-colors"
        onClick={() => setOpen(!open)}>
        {selected.length > 0 ? selected.map(v => {
          const opt = options.find(o => o.value === v);
          return (
            <span key={v} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${opt?.color || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              {opt?.label || v}
              <button type="button" onClick={(e) => { e.stopPropagation(); onChange(selected.filter(x => x !== v)); }} className="hover:opacity-70"><X size={11} /></button>
            </span>
          );
        }) : <span className="text-sm text-slate-400">{placeholder}</span>}
        <ChevronDown size={14} className="ml-auto self-center text-slate-400" />
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
            {options.map(opt => (
              <label key={opt.value} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
                <input type="checkbox" checked={selected.includes(opt.value)}
                  onChange={() => onChange(selected.includes(opt.value) ? selected.filter(x => x !== opt.value) : [...selected, opt.value])}
                  className="rounded border-slate-300" />
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${opt.color || ''}`}>{opt.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function MeetingMinutesPage() {
  const navigate = useNavigate();
  const now = new Date();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);

  // Filters
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterPeriodicity, setFilterPeriodicity] = useState('');
  const [filterPurpose, setFilterPurpose] = useState([]);
  const [filterParticipant, setFilterParticipant] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const tenantId = localStorage.getItem('tenantId');
      const res = await axios.get(`${API_URL}/api/users`, { headers: { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId } });
      setUsers(res.data || []);
    } catch { /* ignore */ }
  }, []);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const params = { month: filterMonth, year: filterYear };
      if (filterPeriodicity) params.periodicity = filterPeriodicity;
      if (filterPurpose.length) params.purpose = filterPurpose.join(',');
      if (filterParticipant) params.participant = filterParticipant;
      const res = await meetingMinutesAPI.list(params);
      setMeetings(res.data || []);
    } catch { toast.error('Failed to load meetings'); }
    finally { setLoading(false); }
  }, [filterMonth, filterYear, filterPeriodicity, filterPurpose, filterParticipant]);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadMeetings(); }, [loadMeetings]);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="p-6 max-w-[1400px] mx-auto" data-testid="meeting-minutes-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Meeting Minutes</h1>
          <p className="text-sm text-slate-500 mt-0.5">Record and track meeting discussions and action items</p>
        </div>
        <button onClick={() => navigate('/meeting-minutes/new')}
          className="bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm"
          data-testid="new-meeting-btn"><Plus size={16} /> New Meeting</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-5 p-4 bg-white border border-slate-200 rounded-xl" data-testid="meeting-filters">
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1 block">Month</label>
          <select value={filterMonth} onChange={e => setFilterMonth(+e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[130px]" data-testid="filter-month">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1 block">Year</label>
          <select value={filterYear} onChange={e => setFilterYear(+e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" data-testid="filter-year">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1 block">Periodicity</label>
          <select value={filterPeriodicity} onChange={e => setFilterPeriodicity(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[120px]" data-testid="filter-periodicity">
            <option value="">All</option>
            {PERIODICITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="min-w-[200px]">
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1 block">Purpose</label>
          <MultiSelect options={PURPOSES} selected={filterPurpose} onChange={setFilterPurpose}
            placeholder="All purposes" testId="filter-purpose" />
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1 block">Participant</label>
          <select value={filterParticipant} onChange={e => setFilterParticipant(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[160px]" data-testid="filter-participant">
            <option value="">All</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex gap-3 mb-5">
        <div className="px-4 py-2.5 bg-white border border-slate-200 rounded-lg">
          <span className="text-lg font-semibold text-slate-900">{meetings.length}</span>
          <span className="text-xs text-slate-500 ml-1.5">Meetings</span>
        </div>
        <div className="px-4 py-2.5 bg-white border border-slate-200 rounded-lg">
          <span className="text-lg font-semibold text-slate-900">{meetings.reduce((s, m) => s + (m.action_items?.length || 0), 0)}</span>
          <span className="text-xs text-slate-500 ml-1.5">Action Items</span>
        </div>
      </div>

      {/* Meeting list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
      ) : meetings.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-200 rounded-xl">
          <FileText size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 mb-1">No meetings found</p>
          <p className="text-xs text-slate-400">Create a new meeting to get started</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="meeting-list">
          {meetings.map(m => {
            const pConf = PERIODICITIES.find(p => p.value === m.periodicity);
            const totalActions = m.action_items?.length || 0;
            return (
              <div key={m.id} onClick={() => navigate(`/meeting-minutes/${m.id}`)}
                className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
                data-testid={`meeting-card-${m.id}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-semibold text-slate-900">{m.title || 'Meeting Minutes'}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${pConf?.color || 'bg-slate-100 text-slate-600'}`}>{pConf?.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(m.purpose || []).map(p => {
                        const pDef = PURPOSES.find(x => x.value === p);
                        return <span key={p} className={`px-2 py-0.5 rounded text-[9px] font-medium border ${pDef?.color || 'bg-slate-50 text-slate-600 border-slate-200'}`}>{pDef?.label || p}</span>;
                      })}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><CalendarIcon size={12} /> {m.date}</span>
                      <span className="flex items-center gap-1"><Users size={12} /> {m.participants?.length || 0} participants</span>
                      <span className="flex items-center gap-1"><MessageSquare size={12} /> {m.minutes?.length || 0} points</span>
                      {totalActions > 0 && (
                        <span className="flex items-center gap-1"><ListChecks size={12} /> {totalActions} actions</span>
                      )}
                    </div>
                  </div>
                  <div className="flex -space-x-2 ml-4">
                    {(m.participants || []).slice(0, 5).map(p => (
                      <div key={p.id} className="w-7 h-7 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-[9px] font-medium text-blue-700" title={p.name}>
                        {p.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                    ))}
                    {(m.participants || []).length > 5 && (
                      <div className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[9px] font-medium text-slate-500">
                        +{m.participants.length - 5}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
