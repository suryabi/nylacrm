import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Trash2, X, Loader2, ShieldAlert } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

/**
 * Floating bulk-delete bar that appears when at least one row is selected.
 * Uses a two-step confirmation: first a "Delete N items?" dialog, then a
 * second dialog that requires the user to type "DELETE" to enable the action.
 *
 * Props:
 *   count        – number of currently selected rows
 *   entityLabel  – singular label, e.g. "lead"
 *   collection   – key registered in backend `bulk_admin.COLLECTIONS`
 *   ids          – array of ids to delete
 *   onCleared    – called with the number deleted after success (parent refetches)
 *   onCancel     – called when the user clears their selection
 */
export default function BulkDeleteBar({ count, entityLabel = 'item', collection, ids, onCleared, onCancel }) {
  const [step1, setStep1] = useState(false);
  const [step2, setStep2] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!step1 && !step2) setConfirmText('');
  }, [step1, step2]);

  if (count === 0) return null;

  const plural = count === 1 ? entityLabel : `${entityLabel}s`;

  const doDelete = async () => {
    setDeleting(true);
    try {
      const res = await axios.post(`${API}/admin/bulk-delete`,
        { collection, ids },
        { headers: HEAD() },
      );
      const deleted = res.data?.deleted ?? 0;
      toast.success(`Deleted ${deleted} ${deleted === 1 ? entityLabel : plural}`);
      setStep1(false);
      setStep2(false);
      setConfirmText('');
      onCleared?.(deleted);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Bulk delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        className="fixed left-1/2 -translate-x-1/2 bottom-6 z-40 flex items-center gap-3 rounded-full bg-slate-900 text-white shadow-xl border border-slate-800 px-4 py-2.5 animate-in slide-in-from-bottom-3"
        data-testid="bulk-delete-bar"
      >
        <span className="text-sm font-medium" data-testid="bulk-delete-count">
          {count} {plural} selected
        </span>
        <div className="h-4 w-px bg-slate-700" />
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-slate-300 hover:text-white hover:bg-slate-800"
          onClick={onCancel}
          data-testid="bulk-clear-btn"
        >
          <X className="h-4 w-4 mr-1" /> Clear
        </Button>
        <Button
          size="sm"
          onClick={() => setStep1(true)}
          className="h-8 bg-rose-600 hover:bg-rose-700 text-white"
          data-testid="bulk-delete-btn"
        >
          <Trash2 className="h-4 w-4 mr-1.5" /> Delete
        </Button>
      </div>

      {/* Step 1 — plain "are you sure" */}
      <AlertDialog open={step1} onOpenChange={setStep1}>
        <AlertDialogContent data-testid="bulk-delete-confirm-1">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {count} {plural}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {count} {plural} from your workspace.
              This action <span className="font-semibold text-rose-700">cannot be undone</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={(e) => { e.preventDefault(); setStep1(false); setStep2(true); }}
              data-testid="bulk-delete-continue-1"
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2 — type DELETE */}
      <AlertDialog open={step2} onOpenChange={(o) => { if (!deleting) setStep2(o); }}>
        <AlertDialogContent data-testid="bulk-delete-confirm-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              Final confirmation
            </AlertDialogTitle>
            <AlertDialogDescription>
              To permanently delete <span className="font-semibold">{count} {plural}</span>, type
              <span className="mx-1 px-1.5 py-0.5 rounded bg-slate-100 text-rose-700 font-mono text-xs">DELETE</span>
              below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
            autoFocus
            data-testid="bulk-delete-confirm-input"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
              disabled={confirmText.trim() !== 'DELETE' || deleting}
              onClick={(e) => { e.preventDefault(); doDelete(); }}
              data-testid="bulk-delete-confirm-btn"
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Delete {count} {plural}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
