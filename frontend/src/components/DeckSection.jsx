import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import {
  Loader2, Presentation, ExternalLink, Download, Sparkles,
  CheckCircle, AlertCircle, XCircle, Clock, MessageSquare,
} from 'lucide-react';
import { format } from 'date-fns';
import GammaGenerateButton from './gamma/GammaGenerateButton';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const TERMINAL = new Set(['completed', 'failed']);
const reviewConfig = {
  pending_review: { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  changes_requested: { label: 'Changes Requested', color: 'bg-orange-100 text-orange-800', icon: AlertCircle },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle },
};

export const DeckSection = ({ leadId, sourceLabel, canReview = false }) => {
  const [deck, setDeck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const pollRef = useRef(null);

  const fetchDeck = async () => {
    try {
      const r = await axios.get(`${API}/gamma/generations`, {
        params: { source_type: 'lead', source_id: leadId, limit: 1 },
        headers: HEAD(),
      });
      const latest = (r.data.generations || [])[0] || null;
      setDeck(latest);
      return latest;
    } catch (e) {
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeck();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  // Poll while the latest deck is still being generated.
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (deck && !TERMINAL.has(deck.status)) {
      pollRef.current = setInterval(async () => {
        try {
          const r = await axios.get(`${API}/gamma/generations/${deck.id}`, { headers: HEAD() });
          setDeck((prev) => ({ ...prev, ...r.data }));
          if (TERMINAL.has(r.data.status)) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            if (r.data.status === 'completed') toast.success('Deck ready — pending review');
            if (r.data.status === 'failed') toast.error(r.data.error_message || 'Deck generation failed');
          }
        } catch (e) { /* keep polling */ }
      }, 5000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck?.id, deck?.status]);

  const handleReview = async (action) => {
    if (action !== 'approved' && !reviewComment.trim()) {
      toast.error('Please add a comment'); return;
    }
    setReviewing(true);
    try {
      const r = await axios.put(`${API}/gamma/generations/${deck.id}/review`,
        { action, comment: reviewComment }, { headers: HEAD() });
      toast.success(r.data.message || `Deck ${action.replace('_', ' ')}`);
      setReviewComment('');
      setDeck(r.data.generation);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to submit review');
    } finally {
      setReviewing(false);
    }
  };

  const generating = deck && !TERMINAL.has(deck.status);
  const completed = deck && deck.status === 'completed';
  const reviewStatus = deck?.review_status || 'pending_review';
  const cfg = reviewConfig[reviewStatus] || reviewConfig.pending_review;

  return (
    <Card className="p-6" data-testid="deck-section">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Presentation className="h-5 w-5 text-indigo-600" /> Deck
        </h2>
        {completed && (
          <Badge className={cfg.color} data-testid="deck-status-badge">{cfg.label}</Badge>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : generating ? (
        <div className="text-center py-8" data-testid="deck-generating">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-3" />
          <p className="font-medium text-slate-700">Generating deck…</p>
          <p className="text-sm text-muted-foreground capitalize">
            {(deck.status || 'starting').replace('_', ' ')} · this usually takes ~30-60s
          </p>
        </div>
      ) : !completed ? (
        <div className="text-center py-8">
          <Presentation className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground mb-4">
            {deck && deck.status === 'failed'
              ? (deck.error_message || 'Last generation failed — try again')
              : 'No deck yet — generate a branded presentation from this lead'}
          </p>
          <GammaGenerateButton
            sourceType="lead" sourceId={leadId} label="Generate Deck"
            variant="default"
            className="bg-indigo-600 hover:bg-indigo-700"
            onClose={fetchDeck}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Deck info */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                <Presentation className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{deck.title || 'Presentation deck'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs border-indigo-300 text-indigo-600">Presentation</Badge>
                  {deck.credits_deducted ? (
                    <span className="text-xs text-muted-foreground">{deck.credits_deducted} credits</span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Version {deck.version || 1} · Generated by {deck.created_by_name}
                </p>
                {deck.created_at && (
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(deck.created_at), 'MMM d, yyyy h:mm a')}
                  </p>
                )}
              </div>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap">
              {deck.gamma_url && (
                <Button asChild variant="default" size="sm" className="bg-indigo-600 hover:bg-indigo-700" data-testid="deck-view-btn">
                  <a href={deck.gamma_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" /> View Deck
                  </a>
                </Button>
              )}
              {deck.export_url && (
                <Button asChild variant="outline" size="sm" data-testid="deck-download-btn">
                  <a href={deck.export_url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4 mr-1" /> Download PDF
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* Review history */}
          {deck.review_comments && deck.review_comments.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Review History</p>
              {deck.review_comments.map((c, idx) => {
                const Icon = reviewConfig[c.action]?.icon || MessageSquare;
                return (
                  <div key={c.id || idx} className="flex gap-3 p-3 border rounded-lg">
                    <Icon className={`h-5 w-5 flex-shrink-0 ${
                      c.action === 'approved' ? 'text-green-600'
                        : c.action === 'rejected' ? 'text-red-600'
                          : c.action === 'changes_requested' ? 'text-orange-600' : 'text-muted-foreground'
                    }`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{c.reviewer_name}</span>
                        <Badge variant="outline" className="text-xs capitalize">{c.action.replace('_', ' ')}</Badge>
                      </div>
                      {c.comment && <p className="text-sm text-muted-foreground mt-1">{c.comment}</p>}
                      {c.created_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(c.created_at), 'MMM d, yyyy h:mm a')}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Review actions */}
          {canReview && ['pending_review', 'changes_requested'].includes(reviewStatus) && (
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium">Review Deck</p>
              <Textarea
                placeholder="Add comments or suggested changes..."
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={3}
                data-testid="deck-review-comment"
              />
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => handleReview('approved')} disabled={reviewing}
                  className="bg-green-600 hover:bg-green-700" data-testid="deck-approve-btn">
                  <CheckCircle className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button variant="outline" onClick={() => handleReview('changes_requested')}
                  disabled={reviewing || !reviewComment.trim()}
                  className="text-orange-600 border-orange-300 hover:bg-orange-50" data-testid="deck-changes-btn">
                  <AlertCircle className="h-4 w-4 mr-1" /> Request Changes
                </Button>
                <Button variant="outline" onClick={() => handleReview('rejected')}
                  disabled={reviewing || !reviewComment.trim()}
                  className="text-red-600 border-red-300 hover:bg-red-50" data-testid="deck-reject-btn">
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
              </div>
            </div>
          )}

          {/* Regenerate */}
          <div className="border-t pt-4">
            <GammaGenerateButton
              sourceType="lead" sourceId={leadId} label="Regenerate Deck"
              variant="outline"
              onClose={fetchDeck}
            />
            {reviewStatus === 'approved' && (
              <p className="text-xs text-muted-foreground mt-2">
                Regenerating will replace the deck and reset the approval status.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

export default DeckSection;
