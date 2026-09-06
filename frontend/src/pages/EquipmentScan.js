import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Wrench, RefreshCw, LogIn, CalendarX2, XCircle } from 'lucide-react';
import { ScanInstructions } from '../components/ScanInstructions';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function EquipmentScan() {
  const { equipmentId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/maintenance/equipment-scan/${equipmentId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('session_token')}` },
        });
        if (res.status === 401 || res.status === 403) { setState({ needLogin: true }); return; }
        const data = await res.json();
        if (!res.ok) { setState({ error: data.detail || 'Unknown equipment QR' }); return; }
        if (data.scheduled_today && data.token) { navigate(`/maintenance-scan/${data.token}`, { replace: true }); return; }
        setState(data);
      } catch { setState({ error: 'Could not reach the server' }); }
    })();
  }, [equipmentId, navigate]);

  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center p-4 pt-8" data-testid="equipment-scan-page">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-2 text-slate-700">
          <div className="p-2 rounded-lg bg-[#002FA7] text-white"><Wrench className="h-5 w-5" /></div>
          <div>
            <p className="font-bold leading-tight">Equipment Maintenance</p>
            <p className="text-xs text-muted-foreground">Equipment QR check-in</p>
          </div>
        </div>
        {state.loading && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Checking equipment QR…
          </CardContent></Card>
        )}
        {state.needLogin && (
          <Card><CardContent className="py-8 text-center space-y-3" data-testid="eqscan-need-login">
            <LogIn className="h-8 w-8 mx-auto text-slate-400" />
            <p className="font-medium">Please log in to record maintenance</p>
            <Button onClick={() => { window.location.href = `/login?redirect=/equipment-scan/${equipmentId}`; }} data-testid="eqscan-login-btn">Go to Login</Button>
          </CardContent></Card>
        )}
        {state.error && (
          <Card><CardContent className="py-8 text-center" data-testid="eqscan-error">
            <XCircle className="h-8 w-8 mx-auto text-red-500 mb-2" /><p className="font-medium">{state.error}</p>
          </CardContent></Card>
        )}
        {!state.loading && !state.needLogin && !state.error && (
          <>
            <Card><CardContent className="p-4 space-y-1" data-testid="eqscan-equipment-info">
              <p className="font-bold text-lg">{state.equipment_name}</p>
              <p className="text-xs text-muted-foreground">{state.equipment_type}</p>
              {state.location && <p className="text-sm text-muted-foreground">{state.location}</p>}
            </CardContent></Card>
            <Card className="border-amber-300"><CardContent className="py-8 text-center space-y-2" data-testid="eqscan-not-scheduled">
              <CalendarX2 className="h-10 w-10 mx-auto text-amber-500" />
              <p className="font-bold text-lg">{state.message || 'No maintenance is scheduled for today.'}</p>
              {state.next_due && <p className="text-sm text-muted-foreground">Next scheduled maintenance: <span className="font-semibold">{state.next_due}</span></p>}
            </CardContent></Card>
            <ScanInstructions equipmentId={state.equipment_id} maintenance={state.maintenance_instructions}
              replacement={state.replacement_instructions} files={state.instruction_files || []} />
          </>
        )}
      </div>
    </div>
  );
}
