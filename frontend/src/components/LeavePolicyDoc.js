import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { CalendarOff, Pencil, Save, X, Plus, Trash2, Mail, RefreshCw, MapPin, History } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const H = (extra = {}) => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json', ...extra });
const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const TYPE_STYLE = { F: 'bg-rose-100 text-rose-800 border-rose-200', V: 'bg-amber-100 text-amber-800 border-amber-200' };

const Chip = ({ e }) => {
  if (!e?.name) return <span className="text-slate-300">—</span>;
  return <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${TYPE_STYLE[e.type] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{e.name}{e.type && <b>({e.type})</b>}</span>;
};

const Section = ({ n, title, children }) => (
  <section className="space-y-2">
    <h3 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2"><span className="h-6 w-6 rounded-full bg-[#002FA7] text-white text-xs font-bold flex items-center justify-center">{n}</span>{title}</h3>
    {children}
  </section>
);

// Share by email dialog
const ShareDialog = ({ open, onOpenChange, title }) => {
  const [emails, setEmails] = useState('');
  const [all, setAll] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/leave-policy/share`, { method: 'POST', headers: H(), body: JSON.stringify({ all_team: all, emails: emails.split(/[,;\s]+/).filter(Boolean), message }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Could not share');
      toast.success(d.sent ? `Policy emailed to ${d.sent} of ${d.recipients} recipient(s)` : `Share logged for ${d.recipients} recipient(s) — email delivery is not configured on this server`);
      onOpenChange(false); setEmails(''); setMessage('');
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="leave-policy-share-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-[#002FA7]" /> Share Leave Policy by email</DialogTitle><DialogDescription>Sends the full policy ({title}) as a formatted email.</DialogDescription></DialogHeader>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4" data-testid="share-all-team" /> All active team members (excludes distributors & drivers)</label>
        <label className="text-xs font-medium text-slate-600 block">Additional email addresses <span className="font-normal text-slate-400">(comma separated)</span>
          <Textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={2} placeholder="hr@company.com, someone@company.com" className="mt-1" data-testid="share-emails" /></label>
        <label className="text-xs font-medium text-slate-600 block">Message (optional)<Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Please review the 2026 holiday calendar for your location." className="mt-1" data-testid="share-message" /></label>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={send} disabled={busy || (!all && !emails.trim())} className="bg-[#002FA7] hover:bg-blue-800 text-white" data-testid="share-send"><Mail className="h-4 w-4 mr-2" />{busy ? 'Sending…' : 'Send'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Editor for one holiday row: date + per-location name/type
const HolidayEditRow = ({ h, locations, onChange, onRemove, idx }) => (
  <tr className="align-top" data-testid={`edit-holiday-${idx}`}>
    <td className="p-1"><Input type="date" value={h.date} onChange={(e) => onChange({ ...h, date: e.target.value })} className="h-8 w-36 text-xs" data-testid={`edit-holiday-date-${idx}`} /></td>
    {locations.map((loc) => {
      const e = h.entries?.[loc] || { name: '', type: '' };
      const set = (patch) => onChange({ ...h, entries: { ...(h.entries || {}), [loc]: { ...e, ...patch } } });
      return (
        <td key={loc} className="p-1 min-w-[150px]">
          <Input value={e.name} onChange={(ev) => set({ name: ev.target.value })} placeholder="—" className="h-8 text-xs" data-testid={`edit-holiday-${idx}-${loc}-name`} />
          <select value={e.type || ''} onChange={(ev) => set({ type: ev.target.value || null })} className="mt-1 h-7 w-full rounded-md border border-input bg-background px-1 text-[11px]" data-testid={`edit-holiday-${idx}-${loc}-type`}>
            <option value="">— (info only)</option><option value="F">F · Fixed</option><option value="V">V · Variable</option>
          </select>
        </td>
      );
    })}
    <td className="p-1"><Input value={h.note || ''} onChange={(e) => onChange({ ...h, note: e.target.value })} placeholder="Note" className="h-8 w-40 text-xs" /></td>
    <td className="p-1"><button type="button" onClick={onRemove} className="text-slate-400 hover:text-rose-600" data-testid={`edit-holiday-remove-${idx}`}><Trash2 className="h-4 w-4" /></button></td>
  </tr>
);

export const LeavePolicyDoc = () => {
  const [p, setP] = useState(null);
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [share, setShare] = useState(false);

  const load = useCallback(() => fetch(`${API_URL}/api/leave-policy`, { headers: H() }).then((r) => r.json()).then(setP).catch(() => toast.error('Could not load the leave policy')), []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...edit, locations: edit.locations.filter(Boolean), structure: edit.structure.filter((r) => r.category), holidays: edit.holidays.filter((h) => h.date) };
      const res = await fetch(`${API_URL}/api/leave-policy`, { method: 'PUT', headers: H(), body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Could not save');
      setP(d); setEdit(null); toast.success(`Leave policy saved (v${d.version})`);
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  if (!p) return <div className="py-10 text-center text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></div>;
  const locs = p.locations || [];
  const mine = p.my_location && locs.find((l) => l.toLowerCase() === String(p.my_location).toLowerCase());

  if (edit) {
    const setE = (patch) => setEdit({ ...edit, ...patch });
    return (
      <div className="space-y-6" data-testid="leave-policy-editor">
        <div className="flex flex-wrap items-center gap-2 justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-2"><Pencil className="h-4 w-4" /> Editing leave policy — changes apply to everyone once saved</p>
          <div className="flex gap-2"><Button variant="outline" onClick={() => setEdit(null)} data-testid="leave-policy-cancel-edit"><X className="h-4 w-4 mr-1" /> Cancel</Button><Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="leave-policy-save"><Save className="h-4 w-4 mr-1" /> {saving ? 'Saving…' : 'Save policy'}</Button></div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-xs sm:col-span-2">Title<Input value={edit.title} onChange={(e) => setE({ title: e.target.value })} className="mt-1" data-testid="edit-title" /></label>
          <label className="text-xs">Year<Input type="number" value={edit.year} onChange={(e) => setE({ year: parseInt(e.target.value) || edit.year })} className="mt-1" data-testid="edit-year" /></label>
        </div>
        <label className="text-xs block">Locations (comma separated)<Input value={edit.locations.join(', ')} onChange={(e) => setE({ locations: e.target.value.split(',').map((x) => x.trim()) })} className="mt-1" data-testid="edit-locations" /></label>
        <Section n="1" title="Leave & Holiday Structure">
          {edit.structure.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`edit-structure-${i}`}>
              <Input value={r.category} onChange={(e) => setE({ structure: edit.structure.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)) })} className="h-8 col-span-5" placeholder="Category" data-testid={`edit-structure-category-${i}`} />
              <Input value={r.entitlement} onChange={(e) => setE({ structure: edit.structure.map((x, j) => (j === i ? { ...x, entitlement: e.target.value } : x)) })} className="h-8 col-span-6" placeholder="Entitlement" data-testid={`edit-structure-entitlement-${i}`} />
              <button type="button" onClick={() => setE({ structure: edit.structure.filter((_, j) => j !== i) })} className="text-slate-400 hover:text-rose-600 justify-self-center"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setE({ structure: [...edit.structure, { category: '', entitlement: '' }] })} data-testid="edit-structure-add"><Plus className="h-3.5 w-3.5 mr-1" /> Add row</Button>
          <Textarea value={edit.structure_note || ''} onChange={(e) => setE({ structure_note: e.target.value })} rows={2} placeholder="Note under the structure table" data-testid="edit-structure-note" />
        </Section>
        <Section n="2" title="Master City-Wise Holiday Calendar">
          <div className="overflow-x-auto rounded-lg border">
            <table className="text-xs w-full"><thead className="bg-slate-50"><tr><th className="p-2 text-left">Date</th>{edit.locations.map((l) => <th key={l} className="p-2 text-left">{l}</th>)}<th className="p-2 text-left">Note</th><th /></tr></thead>
              <tbody>{edit.holidays.map((h, i) => <HolidayEditRow key={h.id || i} h={h} idx={i} locations={edit.locations} onChange={(nh) => setE({ holidays: edit.holidays.map((x, j) => (j === i ? nh : x)) })} onRemove={() => setE({ holidays: edit.holidays.filter((_, j) => j !== i) })} />)}</tbody></table>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setE({ holidays: [...edit.holidays, { date: `${edit.year}-01-01`, entries: {}, note: '' }] })} data-testid="edit-holiday-add"><Plus className="h-3.5 w-3.5 mr-1" /> Add holiday</Button>
          <p className="text-[11px] text-muted-foreground">Fixed (F) and Variable (V) lists per location are derived automatically from this calendar.</p>
          {edit.locations.map((l) => <label key={l} className="text-xs block">Extra variable-pool text for {l}<Input value={edit.variable_pool_extra?.[l] || ''} onChange={(e) => setE({ variable_pool_extra: { ...(edit.variable_pool_extra || {}), [l]: e.target.value } })} className="mt-1 h-8" placeholder="e.g. other HR-approved holidays" /></label>)}
        </Section>
        <Section n="3" title="Policy text sections">
          {edit.sections.map((s, i) => (
            <div key={s.key || i} className="rounded-lg border p-3 space-y-2" data-testid={`edit-section-${i}`}>
              <Input value={s.title} onChange={(e) => setE({ sections: edit.sections.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} className="h-8 font-semibold" data-testid={`edit-section-title-${i}`} />
              <Textarea value={s.body} onChange={(e) => setE({ sections: edit.sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} rows={4} data-testid={`edit-section-body-${i}`} />
              <button type="button" onClick={() => setE({ sections: edit.sections.filter((_, j) => j !== i) })} className="text-xs text-rose-600 flex items-center gap-1"><Trash2 className="h-3 w-3" /> Remove section</button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setE({ sections: [...edit.sections, { key: `s${Date.now()}`, title: 'New section', body: '' }] })} data-testid="edit-section-add"><Plus className="h-3.5 w-3.5 mr-1" /> Add section</Button>
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="leave-policy-doc">
      <ShareDialog open={share} onOpenChange={setShare} title={p.title} />
      <div className="rounded-2xl bg-[#002FA7] text-white px-5 py-5 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-blue-200 font-semibold flex items-center gap-1"><CalendarOff className="h-3.5 w-3.5" /> Company Documents</p>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mt-0.5" data-testid="leave-policy-title">{p.title}</h2>
            <p className="text-xs text-blue-100 mt-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> {locs.join(' • ')}</p>
            <p className="text-[11px] text-blue-200 mt-1 flex items-center gap-1"><History className="h-3 w-3" /> v{p.version} · updated {String(p.updated_at || '').slice(0, 10)} by {p.updated_by}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShare(true)} data-testid="leave-policy-share-btn"><Mail className="h-4 w-4 mr-2" /> Share via email</Button>
            {p.can_edit && <Button onClick={() => setEdit(JSON.parse(JSON.stringify({ year: p.year, title: p.title, locations: p.locations, structure: p.structure, structure_note: p.structure_note, holidays: p.holidays, variable_pool_extra: p.variable_pool_extra || {}, sections: p.sections })))} className="bg-white text-[#002FA7] hover:bg-blue-50 font-bold" data-testid="leave-policy-edit-btn"><Pencil className="h-4 w-4 mr-2" /> Edit</Button>}
          </div>
        </div>
        {mine && <p className="mt-3 text-xs bg-white/10 rounded-lg px-3 py-2">Your work location is <b>{mine}</b> — your fixed holidays and variable pool are highlighted below.</p>}
      </div>

      <Section n="1" title="Leave & Holiday Structure">
        <div className="rounded-lg border overflow-hidden"><table className="w-full text-sm" data-testid="leave-structure-table"><tbody>
          {(p.structure || []).map((r, i) => <tr key={i} className={i % 2 ? 'bg-slate-50/60' : ''}><td className="px-3 py-2 text-slate-600 w-1/2">{r.category}</td><td className="px-3 py-2 font-semibold text-slate-900">{r.entitlement}</td></tr>)}
        </tbody></table></div>
        {p.structure_note && <p className="text-sm text-slate-600">{p.structure_note}</p>}
      </Section>

      <Section n="2" title={`${p.year} Master City-Wise Holiday Calendar`}>
        <p className="text-xs text-muted-foreground"><Badge variant="outline" className={TYPE_STYLE.F}>F</Badge> Fixed Holiday · <Badge variant="outline" className={TYPE_STYLE.V}>V</Badge> Variable Holiday Option · — Regular Working Day</p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm" data-testid="leave-calendar-table">
            <thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left text-xs text-slate-500">Date</th><th className="px-2 py-2 text-left text-xs text-slate-500">Day</th>{locs.map((l) => <th key={l} className={`px-2 py-2 text-left text-xs ${l === mine ? 'text-[#002FA7] font-bold' : 'text-slate-500'}`}>{l}</th>)}</tr></thead>
            <tbody>{(p.holidays || []).map((h) => (
              <tr key={h.id} className="border-t" data-testid={`holiday-row-${h.date}`}>
                <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{fmt(h.date)}{h.note && <span title={h.note} className="text-amber-600">*</span>}</td>
                <td className="px-2 py-1.5 text-slate-500">{h.day}</td>
                {locs.map((l) => <td key={l} className={`px-2 py-1.5 ${l === mine ? 'bg-blue-50/60' : ''}`}><Chip e={h.entries?.[l]} /></td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
        {(p.holidays || []).filter((h) => h.note).map((h) => <p key={h.id} className="text-[11px] text-slate-500">* {fmt(h.date)}: {h.note}</p>)}
      </Section>

      <Section n="3" title="Fixed Holidays by Location">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3" data-testid="fixed-by-location">
          {locs.map((l) => (
            <div key={l} className={`rounded-lg border p-3 ${l === mine ? 'border-[#002FA7] bg-blue-50/40' : ''}`}>
              <p className="font-bold text-sm mb-1">{l} <span className="text-xs text-slate-500 font-normal">· {(p.fixed_by_location?.[l] || []).length} fixed</span></p>
              <ol className="text-xs space-y-0.5 list-decimal pl-4">{(p.fixed_by_location?.[l] || []).map((x, i) => <li key={i}>{x.name} <span className="text-slate-400">{fmt(x.date)}</span></li>)}</ol>
            </div>
          ))}
        </div>
      </Section>

      <Section n="4" title="Variable Holiday Pool – Employee Selects 2">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3" data-testid="variable-pool-table">
          {locs.map((l) => {
            const pool = p.variable_pool?.[l] || [];
            return (
              <div key={l} className={`rounded-lg border p-3 ${l === mine ? 'border-[#002FA7] bg-blue-50/40' : ''}`} data-testid={`variable-pool-${l}`}>
                <p className="font-bold text-sm mb-1">{l} <span className="text-xs text-slate-500 font-normal">· {pool.filter((x) => x.date).length} options · pick 2</span></p>
                <ol className="text-xs space-y-0.5 list-decimal pl-4">
                  {pool.map((x, i) => <li key={i}>{x.name}{x.note && <span title={x.note} className="text-amber-600">*</span>} {x.date && <span className="text-slate-400">{fmt(x.date)}</span>}</li>)}
                  {pool.length === 0 && <li className="list-none -ml-4 text-slate-400">—</li>}
                </ol>
              </div>
            );
          })}
        </div>
      </Section>

      {(p.sections || []).map((s, i) => (
        <Section key={s.key || i} n={5 + i} title={s.title}><p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line" data-testid={`policy-section-${s.key}`}>{s.body}</p></Section>
      ))}
    </div>
  );
};

export default LeavePolicyDoc;
