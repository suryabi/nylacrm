import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { 
  Target, Star, Lightbulb, Tractor, HelpCircle, 
  Loader2, ChevronDown, ChevronUp, Check, RefreshCw
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// Quadrant display info
const QUADRANT_INFO = {
  'Stars': {
    icon: Star,
    color: 'bg-yellow-500',
    textColor: 'text-yellow-600',
    bgLight: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderColor: 'border-yellow-300'
  },
  'Showcase': {
    icon: Lightbulb,
    color: 'bg-purple-500',
    textColor: 'text-purple-600',
    bgLight: 'bg-purple-50 dark:bg-purple-900/20',
    borderColor: 'border-purple-300'
  },
  'Plough Horses': {
    icon: Tractor,
    color: 'bg-blue-500',
    textColor: 'text-blue-600',
    bgLight: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-300'
  },
  'Puzzles': {
    icon: HelpCircle,
    color: 'bg-gray-500',
    textColor: 'text-gray-600',
    bgLight: 'bg-gray-50 dark:bg-gray-900/20',
    borderColor: 'border-gray-300'
  }
};

export default function AccountScoringCard({ accountId, accountName }) {
  const [scoringModel, setScoringModel] = useState(null);
  const [accountScore, setAccountScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedTiers, setSelectedTiers] = useState({});

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [modelRes, scoreRes] = await Promise.all([
        axios.get(`${API}/api/scoring/model`),
        axios.get(`${API}/api/scoring/accounts/${accountId}/score`)
      ]);
      
      setScoringModel(modelRes.data);
      
      if (scoreRes.data.scored) {
        setAccountScore(scoreRes.data);
        // Pre-populate selected tiers from existing score
        const tiers = {};
        Object.entries(scoreRes.data.category_scores || {}).forEach(([catId, data]) => {
          tiers[catId] = data.tier_id;
        });
        setSelectedTiers(tiers);
      } else {
        setAccountScore(null);
      }
    } catch (err) {
      console.error('Error fetching scoring data:', err);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTierSelect = (categoryId, tierId) => {
    setSelectedTiers(prev => ({
      ...prev,
      [categoryId]: tierId
    }));
  };

  const handleSaveScore = async () => {
    // Validate all categories have a selection
    const categories = scoringModel?.categories || [];
    const missing = categories.filter(cat => !selectedTiers[cat.id]);
    
    if (missing.length > 0) {
      toast.error(`Please select a tier for: ${missing.map(c => c.name).join(', ')}`);
      return;
    }

    try {
      setSaving(true);
      const res = await axios.post(`${API}/api/scoring/accounts/${accountId}/score`, {
        category_scores: selectedTiers
      });
      
      setAccountScore(res.data);
      toast.success(`Account scored: ${res.data.total_score}/100 - ${res.data.quadrant}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save score');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6" data-testid="account-scoring-card">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  // No scoring model configured
  if (!scoringModel?.categories || scoringModel.categories.length === 0) {
    return (
      <Card className="p-6" data-testid="account-scoring-card">
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Account Score
        </h3>
        <p className="text-sm text-muted-foreground">
          No scoring model configured. Contact your administrator to set up the lead scoring model.
        </p>
      </Card>
    );
  }

  const quadrantInfo = accountScore ? QUADRANT_INFO[accountScore.quadrant] : null;
  const QuadrantIcon = quadrantInfo?.icon;

  return (
    <Card className="p-6" data-testid="account-scoring-card">
      {/* Header */}
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Account Score
        </h3>
        <div className="flex items-center gap-2">
          {accountScore && (
            <Badge className={`${quadrantInfo?.bgLight} ${quadrantInfo?.textColor} border ${quadrantInfo?.borderColor}`}>
              {QuadrantIcon && <QuadrantIcon className="w-3 h-3 mr-1" />}
              {accountScore.quadrant}
            </Badge>
          )}
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Score Summary (always visible) */}
      {accountScore ? (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Total Score</span>
            <span className="text-2xl font-bold text-primary">{accountScore.total_score}/100</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all"
              style={{ width: `${accountScore.total_score}%` }}
            />
          </div>
          {accountScore.scored_at && (
            <p className="text-xs text-muted-foreground mt-2">
              Last scored: {new Date(accountScore.scored_at).toLocaleDateString()}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            This account has not been scored yet. Expand to evaluate.
          </p>
        </div>
      )}

      {/* Expanded Scoring Form */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-border space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Evaluate by Category</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchData}
              disabled={loading}
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>
          </div>

          {(scoringModel.categories || []).sort((a, b) => a.order - b.order).map((category) => (
            <div key={category.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{category.name}</span>
                <span className="text-xs text-muted-foreground">{category.weight} pts</span>
              </div>
              <div className="grid gap-1">
                {(category.tiers || []).sort((a, b) => b.score - a.score).map((tier) => {
                  const isSelected = selectedTiers[category.id] === tier.id;
                  return (
                    <button
                      key={tier.id}
                      onClick={() => handleTierSelect(category.id, tier.id)}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-sm transition-all ${
                        isSelected 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-secondary/50 hover:bg-secondary'
                      }`}
                      data-testid={`tier-option-${tier.id}`}
                    >
                      <span className="flex items-center gap-2">
                        {isSelected && <Check className="w-3 h-3" />}
                        <span className={isSelected ? 'font-medium' : ''}>{tier.label}</span>
                      </span>
                      <span className={`text-xs ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                        {tier.score} pts
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Preview Score */}
          {Object.keys(selectedTiers).length > 0 && (
            <div className="p-3 bg-secondary/50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Preview Score</span>
                <span className="font-semibold">
                  {scoringModel.categories.reduce((total, cat) => {
                    const tierId = selectedTiers[cat.id];
                    if (tierId) {
                      const tier = cat.tiers?.find(t => t.id === tierId);
                      return total + (tier?.score || 0);
                    }
                    return total;
                  }, 0)}/100
                </span>
              </div>
            </div>
          )}

          {/* Save Button */}
          <Button
            onClick={handleSaveScore}
            disabled={saving || Object.keys(selectedTiers).length === 0}
            className="w-full"
            data-testid="save-account-score-btn"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
            ) : accountScore ? (
              'Update Score'
            ) : (
              'Save Score'
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}
