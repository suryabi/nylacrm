import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { 
  Target, Star, Lightbulb, Tractor, HelpCircle, 
  Loader2, Save, RefreshCw, MapPin, ChevronDown, ChevronUp, X
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// Quadrant info with card-level colors matching the dashboard quadrant view
const QUADRANT_INFO = {
  'Stars': { 
    icon: Star, 
    iconBg: 'bg-amber-400', 
    textColor: 'text-amber-600', 
    cardBg: 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    summaryBg: 'bg-amber-100/60 dark:bg-amber-900/30',
    description: 'High Volume + High Margin',
    examples: 'Luxury Hotels, Premium Restaurants'
  },
  'Showcase': { 
    icon: Lightbulb, 
    iconBg: 'bg-purple-500', 
    textColor: 'text-purple-600', 
    cardBg: 'bg-purple-50/80 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800',
    summaryBg: 'bg-purple-100/60 dark:bg-purple-900/30',
    description: 'Low Volume + High Brand Visibility',
    examples: 'Chef Restaurants, Influential Dining'
  },
  'Plough Horses': { 
    icon: Tractor, 
    iconBg: 'bg-blue-500', 
    textColor: 'text-blue-600', 
    cardBg: 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
    summaryBg: 'bg-blue-100/60 dark:bg-blue-900/30',
    description: 'High Volume + Low Margin',
    examples: 'Beach Clubs, Chains, High Footfall'
  },
  'Puzzles': { 
    icon: HelpCircle, 
    iconBg: 'bg-slate-400', 
    textColor: 'text-slate-600', 
    cardBg: 'bg-slate-50/80 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800',
    summaryBg: 'bg-slate-100/60 dark:bg-slate-900/30',
    description: 'Low Volume + Low Margin',
    examples: 'Small Cafés, Low-Impact Accounts'
  }
};

export default function LeadScoringCard({ leadId, leadCity, leadCompany }) {
  const [model, setModel] = useState(null);
  const [leadScore, setLeadScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTiers, setSelectedTiers] = useState({});
  const [expanded, setExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const cityParam = leadCity || 'default';
      const [modelRes, scoreRes] = await Promise.all([
        axios.get(`${API}/api/scoring/model?city=${encodeURIComponent(cityParam)}`),
        axios.get(`${API}/api/scoring/leads/${leadId}/score`)
      ]);
      
      setModel(modelRes.data);
      setLeadScore(scoreRes.data);
      
      if (scoreRes.data.scored && scoreRes.data.category_scores) {
        const existingTiers = {};
        Object.entries(scoreRes.data.category_scores).forEach(([catId, data]) => {
          existingTiers[catId] = data.tier_id;
        });
        setSelectedTiers(existingTiers);
      }
    } catch (err) {
      console.error('Error fetching scoring data:', err);
    } finally {
      setLoading(false);
    }
  }, [leadId, leadCity]);

  useEffect(() => {
    if (leadId) {
      fetchData();
    }
  }, [leadId, fetchData]);

  const handleTierSelect = (categoryId, tierId) => {
    setSelectedTiers(prev => ({ ...prev, [categoryId]: tierId }));
  };

  const handleSaveScore = async () => {
    try {
      setSaving(true);
      await axios.post(`${API}/api/scoring/leads/${leadId}/score`, {
        category_scores: selectedTiers
      });
      toast.success('Lead score saved');
      setIsEditing(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save score');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    // Reset to existing score values
    if (leadScore?.scored && leadScore.category_scores) {
      const existingTiers = {};
      Object.entries(leadScore.category_scores).forEach(([catId, data]) => {
        existingTiers[catId] = data.tier_id;
      });
      setSelectedTiers(existingTiers);
    }
    setIsEditing(false);
  };

  const handleStartEditing = () => {
    setIsEditing(true);
    setExpanded(true);
  };

  if (loading) {
    return (
      <Card className="p-4" data-testid="lead-scoring-card">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  if (!model?.categories || model.categories.length === 0) {
    return (
      <Card className="p-4" data-testid="lead-scoring-card">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-5 w-5 text-indigo-500" />
          <span className="font-semibold">Lead Score</span>
        </div>
        <p className="text-sm text-muted-foreground">
          No scoring model configured. Go to Admin → Lead Scoring Model to set one up.
        </p>
      </Card>
    );
  }

  const quadrantInfo = leadScore?.quadrant ? QUADRANT_INFO[leadScore.quadrant] : null;
  const QuadrantIcon = quadrantInfo?.icon;
  
  // Determine card styling based on quadrant
  const cardClassName = quadrantInfo && leadScore?.scored
    ? `p-4 border-2 transition-all ${quadrantInfo.cardBg}`
    : 'p-4';

  return (
    <Card className={cardClassName} data-testid="lead-scoring-card">
      <div className="space-y-3">
        {/* Header - Matches OpportunityEstimation style */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-indigo-500" />
            <span className="font-semibold">Lead Score</span>
          </div>
          <div className="flex items-center gap-1">
            {!isEditing && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7" 
                onClick={fetchData}
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7" 
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Score Summary - Always visible */}
        {leadScore?.scored ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className={`p-3 rounded-lg text-center ${quadrantInfo ? quadrantInfo.summaryBg : 'bg-indigo-50 dark:bg-indigo-900/20'}`}>
                <p className={`text-2xl font-bold ${quadrantInfo ? quadrantInfo.textColor : 'text-indigo-600'}`}>{leadScore.total_score}</p>
                <p className="text-xs text-muted-foreground">Total Score</p>
              </div>
              {quadrantInfo && (
                <div className={`p-3 ${quadrantInfo.summaryBg} rounded-lg text-center`}>
                  <div className="flex items-center justify-center gap-2">
                    <div className={`p-1.5 rounded ${quadrantInfo.iconBg}`}>
                      <QuadrantIcon className="w-4 h-4 text-white" />
                    </div>
                    <span className={`font-bold ${quadrantInfo.textColor}`}>{leadScore.quadrant}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Quadrant</p>
                </div>
              )}
            </div>
            
            {/* Quadrant Description - Helps user understand the category */}
            {quadrantInfo && (
              <div className={`p-3 ${quadrantInfo.summaryBg} rounded-lg border ${quadrantInfo.cardBg.includes('amber') ? 'border-amber-200 dark:border-amber-700' : quadrantInfo.cardBg.includes('purple') ? 'border-purple-200 dark:border-purple-700' : quadrantInfo.cardBg.includes('blue') ? 'border-blue-200 dark:border-blue-700' : 'border-slate-200 dark:border-slate-700'}`}>
                <p className={`text-sm font-medium ${quadrantInfo.textColor}`}>{quadrantInfo.description}</p>
                <p className="text-xs text-muted-foreground mt-1">{quadrantInfo.examples}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 bg-slate-50 dark:bg-slate-900/20 rounded-lg text-center">
            <p className="text-sm text-muted-foreground">Not yet scored</p>
            <Button 
              size="sm" 
              className="mt-2"
              onClick={handleStartEditing}
              data-testid="score-lead-btn"
            >
              <Target className="h-4 w-4 mr-2" /> Score This Lead
            </Button>
          </div>
        )}

        {/* City Model Indicator */}
        {leadCity && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            Model: {model?.city === 'default' ? 'Default' : model?.city}
            {model?._is_fallback && <Badge variant="outline" className="ml-1 text-[10px] py-0">fallback</Badge>}
          </div>
        )}

        {/* Expanded Content */}
        {expanded && (
          <div className="pt-3 border-t space-y-3">
            {/* Edit/Score Button - When NOT editing */}
            {!isEditing && leadScore?.scored && (
              <Button 
                size="sm" 
                variant="outline"
                className="w-full"
                onClick={handleStartEditing}
                data-testid="edit-lead-score-btn"
              >
                Edit Score
              </Button>
            )}

            {/* Scoring Categories */}
            <div className="space-y-2">
              {model?.categories?.sort((a, b) => a.order - b.order).map((category) => {
                const existingScore = leadScore?.category_scores?.[category.id];
                const selectedTierId = selectedTiers[category.id];
                
                return (
                  <div 
                    key={category.id} 
                    className={`border rounded-lg p-3 transition-all ${
                      isEditing ? 'bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-800' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{category.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {existingScore?.score || 0} / {category.weight}
                      </Badge>
                    </div>
                    
                    {isEditing ? (
                      <Select
                        value={selectedTierId || ''}
                        onValueChange={(val) => handleTierSelect(category.id, val)}
                      >
                        <SelectTrigger 
                          className="w-full bg-slate-50 dark:bg-slate-900" 
                          data-testid={`tier-select-${category.id}`}
                        >
                          <SelectValue placeholder="Select tier..." />
                        </SelectTrigger>
                        <SelectContent>
                          {category.tiers.sort((a, b) => b.score - a.score).map((tier) => (
                            <SelectItem key={tier.id} value={tier.id}>
                              <div className="flex items-center justify-between w-full gap-3">
                                <span>{tier.label}</span>
                                <Badge variant="outline" className="text-xs">{tier.score} pts</Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {existingScore ? existingScore.tier_label : 'Not scored'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Score timestamp */}
            {leadScore?.scored && leadScore.scored_at && !isEditing && (
              <p className="text-xs text-muted-foreground text-right">
                Last scored: {new Date(leadScore.scored_at).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* PROMINENT Save/Cancel Actions - When Editing */}
        {isEditing && (
          <div className="pt-3 border-t border-indigo-100 dark:border-indigo-900 space-y-2">
            <Button 
              onClick={handleSaveScore} 
              disabled={saving} 
              className="w-full h-11 text-base bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
              data-testid="save-lead-score-btn"
            >
              {saving ? (
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Saving...</>
              ) : (
                <><Save className="h-5 w-5 mr-2" /> Save Lead Score</>
              )}
            </Button>
            <Button 
              variant="outline"
              onClick={handleCancelEdit}
              className="w-full"
              data-testid="cancel-lead-score-btn"
            >
              <X className="h-4 w-4 mr-2" /> Cancel
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
