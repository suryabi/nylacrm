import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Loader2, AlertTriangle } from 'lucide-react';

/**
 * Strong double-confirmation dialog for destructive actions.
 * The user must type the exact entity name to enable the Delete button,
 * so a delete can never happen from a single accidental click.
 */
export const DeleteConfirmDialog = ({
  open,
  onOpenChange,
  entityType = 'record',
  entityName = '',
  onConfirm,
  loading = false,
}) => {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (open) setTyped(''); }, [open]);

  const target = (entityName || '').trim();
  const matches = typed.trim() === target && target.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="delete-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" /> Delete {entityType}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes <strong className="text-slate-800 dark:text-slate-200">{entityName || `this ${entityType}`}</strong>{' '}
            and all related data. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-1">
          <Label className="text-xs text-muted-foreground">
            To confirm, type <span className="font-semibold text-slate-700 dark:text-slate-300">{entityName}</span> below
          </Label>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={entityName}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && matches && !loading) onConfirm(); }}
            data-testid="delete-confirm-input"
          />
        </div>

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            data-testid="delete-confirm-cancel"
          >
            Cancel
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={onConfirm}
            disabled={!matches || loading}
            data-testid="delete-confirm-action"
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Delete {entityType}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteConfirmDialog;
