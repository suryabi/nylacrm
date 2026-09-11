import React, { useEffect, useState } from 'react';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Search, UserCog } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('session_token')}`, 'Content-Type': 'application/json' });

// Multi-select of active team members (app users) — used for equipment / area supervisors.
export const SupervisorPicker = ({ selected, onChange, testid = 'supervisor-picker' }) => {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/api/users?is_active=true`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setUsers(Array.isArray(d) ? d : d.users || []))
      .catch(() => setUsers([]));
  }, []);

  const sel = new Set(selected || []);
  const toggle = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); onChange([...n]); };
  const q = search.toLowerCase();
  const list = users.filter((u) => !q || `${u.name || ''} ${u.email || ''} ${u.role || ''}`.toLowerCase().includes(q));

  return (
    <div className="space-y-2" data-testid={testid}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <UserCog className="h-3.5 w-3.5" /> Supervisors (team members) · {sel.size} selected
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team by name, email or role…" className="pl-8 h-9" data-testid={`${testid}-search`} />
      </div>
      <div className="max-h-[220px] overflow-y-auto rounded-lg border divide-y">
        {list.map((u) => (
          <label key={u.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50" data-testid={`${testid}-user-${u.id}`}>
            <Checkbox checked={sel.has(u.id)} onCheckedChange={() => toggle(u.id)} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{u.name || u.email}</p>
              <p className="text-[11px] text-muted-foreground truncate">{[u.role, u.email].filter(Boolean).join(' · ')}</p>
            </div>
          </label>
        ))}
        {list.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No team members found</p>}
      </div>
    </div>
  );
};

export default SupervisorPicker;
