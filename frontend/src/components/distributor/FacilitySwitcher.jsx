import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Building2, Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '../ui/dropdown-menu';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

/**
 * Facility switcher for distributor portal users who have portal access on more
 * than one distributor. Renders nothing for single-facility users. Switching
 * updates the active facility server-side and reloads into its Home dashboard.
 */
export default function FacilitySwitcher() {
  const [facilities, setFacilities] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [switching, setSwitching] = useState(null);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_URL}/distributor-portal/my-facilities`, { withCredentials: true })
      .then((r) => {
        if (cancelled) return;
        setFacilities(r.data.facilities || []);
        setActiveId(r.data.active_distributor_id || null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Single (or zero) facility → nothing to switch
  if (facilities.length <= 1) return null;

  const active = facilities.find((f) => f.distributor_id === activeId) || facilities[0];

  const handleSwitch = async (f) => {
    if (f.distributor_id === activeId) return;
    setSwitching(f.distributor_id);
    try {
      await axios.post(`${API_URL}/distributor-portal/switch-facility`,
        { distributor_id: f.distributor_id }, { withCredentials: true });
      toast.success(`Switched to ${f.name}`);
      // Hard reload so AppContext re-derives the active distributor everywhere
      window.location.href = '/distributor-home';
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not switch facility');
      setSwitching(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="w-full flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/15 transition-colors px-2.5 py-2 mb-3 text-left"
          data-testid="facility-switcher-trigger"
        >
          <Building2 className="h-4 w-4 text-white/70 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-white/50 leading-none mb-0.5">Facility</p>
            <p className="text-sm font-medium text-white truncate leading-tight">{active?.name}</p>
          </div>
          <ChevronsUpDown className="h-4 w-4 text-white/60 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" data-testid="facility-switcher-menu">
        <DropdownMenuLabel>Switch facility ({facilities.length})</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {facilities.map((f) => {
          const isActive = f.distributor_id === activeId;
          return (
            <DropdownMenuItem
              key={f.distributor_id}
              onClick={() => handleSwitch(f)}
              className="cursor-pointer"
              data-testid={`facility-option-${f.distributor_id}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{f.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[f.code, f.city].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              {switching === f.distributor_id ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : isActive ? (
                <Check className="h-4 w-4 text-primary shrink-0" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
