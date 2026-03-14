import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { 
  Target, Star, Lightbulb, Tractor, HelpCircle, 
  Loader2, Save, RefreshCw, MapPin
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// Quadrant info
const QUADRANT_INFO = {
  'Stars': { icon: Star, color: 'bg-yellow-500', textColor: 'text-yellow-600', bgLight: 'bg-yellow-50' },
  'Showcase': { icon: Lightbulb, color: 'bg-purple-500', textColor: 'text-purple-600', bgLight: 'bg-purple-50' },
  'Plough Horses': { icon: Tractor, color: 'bg-blue-500', textColor: 'text-blue-600', bgLight: 'bg-blue-50' },
  'Puzzles': { icon: HelpCircle, color: 'bg-gray-500', textColor: 'text-gray-600', bgLight: 'bg-gray-50' }
};

export default function LeadScoringCard({ leadId, leadCity, leadCompany }) {
  const [model, setModel] = useState(null);
  const [leadScore, setLeadScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTiers, setSelectedTiers] = useState({});

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch model for the lead's city (will fallback to default if city doesn't have one)
      const cityParam = leadCity || 'default';
      const [modelRes, scoreRes] = await Promise.all([
        axios.get(`${API}/api/scoring/model?city=${encodeURIComponent(cityParam)}`),
        axios.get(`${API}/api/scoring/leads/${leadId}/score`)
      ]);
      
      setModel(modelRes.data);
      setLeadScore(scoreRes.data);
      
      // Pre-populate selected tiers from existing score
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

  if (loading) {
    return (
      <Card data-testid="lead-scoring-card">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!model?.categories || model.categories.length === 0) {
    return (
      <Card data-testid="lead-scoring-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="w-5 h-5" />
            Lead Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No scoring model configured. Go to Admin &gt; Lead Scoring Model to set one up.
          </p>
        </CardContent>
      </Card>
    );
  }

  const quadrantInfo = leadScore?.quadrant ? QUADRANT_INFO[leadScore.quadrant] : null;
  const QuadrantIcon = quadrantInfo?.icon;

  return (
    <Card data-testid="lead-scoring-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="w-5 h-5" />
            Lead Score
          </CardTitle>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveScore}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={fetchData}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  data-testid="edit-lead-score-btn"
                >
                  {leadScore?.scored ? 'Edit Score' : 'Score Lead'}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* City Indicator */}
        {leadCity && (
          <div className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            Using model for: {model.city === 'default' ? 'Default' : model.city}
            {model._is_fallback && ' (fallback)'}
          </div>
        )}

        {/* Score Summary */}
        {leadScore?.scored && !isEditing && (
          <div className="mb-4 p-3 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Score</p>
                <p className="text-3xl font-bold text-primary">{leadScore.total_score}</p>
              </div>
              {quadrantInfo && (
                <div className={`p-3 rounded-lg ${quadrantInfo.bgLight}`}>
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded ${quadrantInfo.color}`}>
                      <QuadrantIcon className="w-4 h-4 text-white" />
                    </div>
                    <span className={`font-semibold ${quadrantInfo.textColor}`}>
                      {leadScore.quadrant}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scoring Categories */}
        <div className="space-y-3">
          {model.categories.sort((a, b) => a.order - b.order).map((category) => {
            const existingScore = leadScore?.category_scores?.[category.id];
            const selectedTierId = selectedTiers[category.id];
            const selectedTier = category.tiers.find(t => t.id === selectedTierId);
            
            return (
              <div key={category.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{category.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {category.weight} pts max
                    </Badge>
                  </div>
                  {!isEditing && existingScore && (
                    <Badge className="bg-primary/10 text-primary">
                      {existingScore.score} pts
                    </Badge>
                  )}
                </div>
                
                {isEditing ? (
                  <Select
                    value={selectedTierId || ''}
                    onValueChange={(val) => handleTierSelect(category.id, val)}
                  >
                    <SelectTrigger className="w-full" data-testid={`tier-select-${category.id}`}>
                      <SelectValue placeholder="Select tier..." />
                    </SelectTrigger>
                    <SelectContent>
                      {category.tiers.sort((a, b) => b.score - a.score).map((tier) => (
                        <SelectItem key={tier.id} value={tier.id}>
                          <div className="flex items-center justify-between w-full">
                            <span>{tier.label}</span>
                            <Badge variant="outline" className="ml-2">{tier.score} pts</Badge>
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
        {leadScore?.scored && leadScore.scored_at && (
          <p className="mt-3 text-xs text-muted-foreground text-right">
            Last scored: {new Date(leadScore.scored_at).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
