import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { meetingMinutesAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';
import {
  ArrowLeft, Calendar as CalendarIcon, Clock, Users, Save, Trash2,
  PenLine, History, MessageSquare, ListChecks, ExternalLink, Loader2,
  X, Plus, Link as LinkIcon,
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

const ACTION_STATUSES = [
  { value: 'open', label: 'Open', dot: 'bg-slate-400', bg: 'bg-slate-50' },
  { value: 'in_progress', label: 'In Progress', dot: 'bg-amber-500', bg: 'bg-amber-50' },
  { value: 'done', label: 'Done', dot: 'bg-emerald-500', bg: 'bg-emerald-50' },
];

export default function MeetingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await meetingMinutesAPI.get(id);
      setMeeting(res.data);
    } catch {
      toast.error('Failed to load meeting');
      navigate('/meeting-minutes');
    } finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!window.confirm('Delete this meeting?')) return;
    try {
      await meetingMinutesAPI.delete(id);
      toast.success('Meeting deleted');
      navigate('/meeting-minutes');
    } catch { toast.error('Failed to delete'); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 size={24} className="animate-spin text-slate-400" /></div>;
  if (!meeting) return <div className="p-6 text-center text-slate-500">Meeting not found</div>;

  const pConf = PERIODICITIES.find(p => p.value === meeting.periodicity);
  const actionTotal = meeting.action_items?.length || 0;
  const actionDone = meeting.action_items?.filter(a => a.status === 'done').length || 0;
  const actionOpen = actionTotal - actionDone;

  return (
    <div className="p-6 max-w-[1100px] mx-auto" data-testid="meeting-detail-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/meeting-minutes')}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors" data-testid="back-btn">
            <ArrowLeft size={18} className="text-slate-500" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{meeting.title || 'Meeting Minutes'}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-slate-500 flex items-center gap-1"><CalendarIcon size={13} /> {meeting.date}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${pConf?.color || 'bg-slate-100 text-slate-600'}`}>{pConf?.label}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/meeting-minutes/${id}/edit`)}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2"
            data-testid="edit-btn"><PenLine size={14} /> Edit</button>
          <button onClick={handleDelete}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
            data-testid="delete-btn"><Trash2 size={14} /> Delete</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main content — 2 cols */}
        <div className="col-span-2 space-y-6">
          {/* Purpose tags */}
          {(meeting.purpose || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {meeting.purpose.map(p => {
                const pDef = PURPOSES.find(x => x.value === p);
                return <span key={p} className={`px-3 py-1 rounded-lg text-xs font-medium border ${pDef?.color || 'bg-slate-50 text-slate-600 border-slate-200'}`}>{pDef?.label || p}</span>;
              })}
            </div>
          )}

          {/* Meeting Minutes */}
          <div className="border border-slate-200 rounded-xl p-5" data-testid="section-minutes">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <MessageSquare size={16} className="text-blue-500" /> Meeting Minutes
              <span className="text-xs font-normal text-slate-400">({meeting.minutes?.length || 0} points)</span>
            </h2>
            {(meeting.minutes || []).length > 0 ? (
              <div className="space-y-3">
                {meeting.minutes.map((m, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors" data-testid={`minute-${i}`}>
                    <span className="mt-2 w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                    <div className="text-sm text-slate-700 leading-relaxed prose prose-sm max-w-none [&>p]:m-0" dangerouslySetInnerHTML={{ __html: m }} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic py-4 text-center">No minutes recorded</p>
            )}
          </div>

          {/* Action Items */}
          <div className="border border-slate-200 rounded-xl p-5" data-testid="section-actions">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <ListChecks size={16} className="text-emerald-500" /> Action Items
              {actionTotal > 0 && <span className="text-xs font-normal text-slate-400">({actionTotal} items)</span>}
            </h2>
            {actionTotal > 0 ? (
              <div className="space-y-3">
                {meeting.action_items.map((ai, i) => {
                  return (
                    <div key={ai.id || i} className="rounded-xl border border-slate-200 p-4 bg-white" data-testid={`action-item-${i}`}>
                      <div className="flex items-start gap-3">
                        <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0 bg-slate-400" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap text-slate-800">
                            {ai.description}
                          </p>
                          <div className="flex items-center flex-wrap gap-3 mt-2">
                            {ai.assignee_name && (
                              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[8px] font-medium text-emerald-700">
                                  {ai.assignee_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                                </div>
                                {ai.assignee_name}
                              </span>
                            )}
                            {ai.task_number && (
                              <span className="text-[10px] text-blue-600 font-medium flex items-center gap-1">
                                <LinkIcon size={10} /> {ai.task_number}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic py-4 text-center">No action items</p>
            )}
          </div>
        </div>

        {/* Sidebar — 1 col */}
        <div className="space-y-5">
          {/* Participants */}
          <div className="border border-slate-200 rounded-xl p-4" data-testid="section-participants">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1">
              <Users size={12} /> Participants ({meeting.participants?.length || 0})
            </h3>
            {(meeting.participants || []).length > 0 ? (
              <div className="space-y-2">
                {meeting.participants.map(p => (
                  <div key={p.id} className="flex items-center gap-2.5 py-1.5">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-[11px] font-medium text-blue-700">
                      {p.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <span className="text-sm text-slate-700">{p.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No participants tagged</p>
            )}
          </div>

          {/* Stats */}
          <div className="border border-slate-200 rounded-xl p-4" data-testid="section-stats">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-3">Summary</h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Discussion Points</span>
                <span className="text-sm font-semibold text-slate-800">{meeting.minutes?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Action Items</span>
                <span className="text-sm font-semibold text-slate-800">{actionTotal}</span>
              </div>
            </div>
          </div>

          {/* Edit History */}
          {(meeting.edit_history || []).length > 0 && (
            <div className="border border-slate-200 rounded-xl p-4" data-testid="section-history">
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1">
                <History size={12} /> Edit History
              </h3>
              <div className="space-y-2">
                {meeting.edit_history.slice(-5).reverse().map((h, i) => (
                  <div key={i} className="text-[11px] text-slate-500">
                    <span className="font-medium text-slate-700">{h.edited_by_name}</span>
                    <br />
                    <span className="text-slate-400">{new Date(h.edited_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="text-[11px] text-slate-400 px-1 space-y-1">
            <p>Created by <span className="text-slate-600">{meeting.created_by_name}</span></p>
            <p>{new Date(meeting.created_at).toLocaleString()}</p>
            {meeting.updated_by_name && meeting.updated_at !== meeting.created_at && (
              <p className="mt-2">Last edited by <span className="text-slate-600">{meeting.updated_by_name}</span> on {new Date(meeting.updated_at).toLocaleString()}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
