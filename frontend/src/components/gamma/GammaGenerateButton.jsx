import React, { useState } from 'react';
import axios from 'axios';
import { Button } from '../ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Sparkles } from 'lucide-react';
import GammaComposer from './GammaComposer';
import { useTenantConfig } from '../../context/TenantConfigContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

/**
 * "Generate Deck" button + Gamma dialog. When a source (lead/account) is given,
 * it auto-builds an editable draft from CRM data on open.
 * Props: sourceType, sourceId, label, variant, size, className
 */
export default function GammaGenerateButton({
  sourceType, sourceId, label = 'Generate Deck',
  variant = 'outline', size = 'sm', className = '',
}) {
  const { hasActionPermission } = useTenantConfig();
  const canUse = hasActionPermission ? hasActionPermission('gamma_generator', 'view') : true;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ title: '', text: '', label: null });
  const [loadingDraft, setLoadingDraft] = useState(false);

  if (!canUse) return null;

  const openDialog = async () => {
    setOpen(true);
    if (sourceType && sourceId) {
      setLoadingDraft(true);
      try {
        const r = await axios.post(`${API}/gamma/draft`,
          { source_type: sourceType, source_id: sourceId }, { headers: HEAD() });
        setDraft({ title: r.data.title, text: r.data.input_text, label: r.data.source_label });
      } catch (e) {
        setDraft({ title: '', text: '', label: null });
      } finally {
        setLoadingDraft(false);
      }
    }
  };

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={openDialog} data-testid="gamma-generate-deck-btn">
        <Sparkles className="h-4 w-4 mr-1.5" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="gamma-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" /> Generate Presentation
            </DialogTitle>
          </DialogHeader>
          <GammaComposer
            initialTitle={draft.title}
            initialText={draft.text}
            sourceType={sourceType}
            sourceId={sourceId}
            sourceLabel={draft.label}
            loadingDraft={loadingDraft}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
