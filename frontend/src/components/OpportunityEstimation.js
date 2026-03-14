import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { 
  Droplets, Calculator, Save, Maximize2, X, 
  Loader2, Edit2, ChevronDown, ChevronUp,
  Sun, Moon, Sunset, Coffee, Play
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { useTenantConfig } from '../context/TenantConfigContext';

const API = process.env.REACT_APP_BACKEND_URL;

// Time slot configuration
const TIME_SLOTS = [
  { key: 'morning', label: 'Morning', icon: Sun, color: 'text-amber-500', defaultHours: 4 },
  { key: 'evening', label: 'Evening', icon: Sunset, color: 'text-orange-500', defaultHours: 4 },
  { key: 'night', label: 'Night', icon: Moon, color: 'text-indigo-500', defaultHours: 4 },
  { key: 'snacks', label: 'Snacks', icon: Coffee, color: 'text-brown-500', defaultHours: 3 },
];

// Default estimation values
const DEFAULT_ESTIMATION = {
  total_covers: 100,
  operating_pattern: {
    morning: { enabled: true, density: 60 },
    evening: { enabled: true, density: 80 },
    night: { enabled: true, density: 90 },
    snacks: { enabled: false, density: 40 },
  },
  dining_behavior: {
    avg_table_time: 45,
    water_adoption_rate: 70,
    operating_days: 30,
  },
  override_value: null,
};

// Calculate estimation from inputs
const calculateFromInputs = (inputs, bottlesPerCover) => {
  const { total_covers, operating_pattern, dining_behavior } = inputs;
  const { avg_table_time, water_adoption_rate, operating_days } = dining_behavior;
  
  const turnoversPerHour = 60 / avg_table_time;
  const slotEstimations = {};
  let dailyTotal = 0;
  
  TIME_SLOTS.forEach(slot => {
    const pattern = operating_pattern[slot.key];
    if (pattern?.enabled) {
      const density = (pattern.density || 0) / 100;
      const activeCoverCount = total_covers * density;
      const turnovers = turnoversPerHour * slot.defaultHours;
      const adoptionRate = water_adoption_rate / 100;
      const bottles = Math.round(activeCoverCount * turnovers * adoptionRate * bottlesPerCover);
      slotEstimations[slot.key] = bottles;
      dailyTotal += bottles;
    } else {
      slotEstimations[slot.key] = 0;
    }
  });
  
  const monthlyTotal = dailyTotal * operating_days;
  
  return { slotEstimations, dailyTotal, monthlyTotal };
};

export default function OpportunityEstimation({ leadId, leadName, existingEstimation, onSave }) {
  const { hasIndustryFeature, getIndustryConfig } = useTenantConfig();
  
  // Saved estimation (what's persisted)
  const [savedEstimation, setSavedEstimation] = useState(existingEstimation || DEFAULT_ESTIMATION);
  
  // Form inputs (local state for editing - doesn't trigger calculation on every keystroke)
  const [formInputs, setFormInputs] = useState(existingEstimation || DEFAULT_ESTIMATION);
  
  // Calculated results (only updated on Apply)
  const defaultBottlesPerCover = getIndustryConfig('default_bottles_per_cover', 2);
  const [calculatedResults, setCalculatedResults] = useState(() => 
    calculateFromInputs(existingEstimation || DEFAULT_ESTIMATION, defaultBottlesPerCover)
  );
  
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isOverrideMode, setIsOverrideMode] = useState(!!existingEstimation?.override_value);
  const [overrideInput, setOverrideInput] = useState(existingEstimation?.override_value || '');
  const [hasUnappliedChanges, setHasUnappliedChanges] = useState(false);

  // Apply calculation - useCallback must be before conditional return
  const handleApplyCalculation = useCallback(() => {
    const results = calculateFromInputs(formInputs, defaultBottlesPerCover);
    setCalculatedResults(results);
    setHasUnappliedChanges(false);
    toast.success('Calculation applied');
  }, [formInputs, defaultBottlesPerCover]);

  // Handle blur - recalculate on tab out
  const handleInputBlur = useCallback(() => {
    if (hasUnappliedChanges) {
      const results = calculateFromInputs(formInputs, defaultBottlesPerCover);
      setCalculatedResults(results);
      setHasUnappliedChanges(false);
    }
  }, [hasUnappliedChanges, formInputs, defaultBottlesPerCover]);

  // Check if this feature is available - must be after all hooks
  if (!hasIndustryFeature('lead_bottle_tracking')) {
    return null;
  }

  // Final values (override or calculated)
  const finalMonthlyValue = isOverrideMode && overrideInput 
    ? parseInt(overrideInput) 
    : calculatedResults.monthlyTotal;

  const finalDailyValue = isOverrideMode && overrideInput 
    ? Math.round(parseInt(overrideInput) / formInputs.dining_behavior.operating_days)
    : calculatedResults.dailyTotal;

  // Update form inputs (doesn't recalculate)
  const updateFormInput = (path, value) => {
    setFormInputs(prev => {
      const newInputs = { ...prev };
      const keys = path.split('.');
      let obj = newInputs;
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] = { ...obj[keys[i]] };
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return newInputs;
    });
    setHasUnappliedChanges(true);
  };

  // Update operating pattern
  const updatePattern = (slot, field, value) => {
    setFormInputs(prev => ({
      ...prev,
      operating_pattern: {
        ...prev.operating_pattern,
        [slot]: {
          ...prev.operating_pattern[slot],
          [field]: value
        }
      }
    }));
    setHasUnappliedChanges(true);
  };

  // Update dining behavior
  const updateBehavior = (field, value) => {
    setFormInputs(prev => ({
      ...prev,
      dining_behavior: {
        ...prev.dining_behavior,
        [field]: value
      }
    }));
    setHasUnappliedChanges(true);
  };

  // Save estimation to backend
  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Ensure we have latest calculation
      const finalResults = calculateFromInputs(formInputs, defaultBottlesPerCover);
      setCalculatedResults(finalResults);
      
      const payload = {
        ...formInputs,
        calculated_daily: finalResults.dailyTotal,
        calculated_monthly: finalResults.monthlyTotal,
        override_value: isOverrideMode ? parseInt(overrideInput) || null : null,
        final_monthly: isOverrideMode && overrideInput ? parseInt(overrideInput) : finalResults.monthlyTotal,
        final_daily: isOverrideMode && overrideInput 
          ? Math.round(parseInt(overrideInput) / formInputs.dining_behavior.operating_days)
          : finalResults.dailyTotal,
      };
      
      await axios.put(`${API}/api/leads/${leadId}/opportunity-estimation`, payload);
      
      setSavedEstimation(formInputs);
      setHasUnappliedChanges(false);
      toast.success('Opportunity estimation saved');
      if (onSave) onSave(payload);
      setShowModal(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save estimation');
    } finally {
      setSaving(false);
    }
  };

  // Reset form to saved values
  const handleReset = () => {
    setFormInputs(savedEstimation);
    setCalculatedResults(calculateFromInputs(savedEstimation, defaultBottlesPerCover));
    setHasUnappliedChanges(false);
  };

  // Compact view content
  const CompactView = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplets className="h-5 w-5 text-blue-500" />
          <span className="font-semibold">Opportunity Estimation</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowModal(true)}
            data-testid="expand-estimation-btn"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
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

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
          <p className="text-2xl font-bold text-blue-600">{finalDailyValue.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Daily Bottles</p>
        </div>
        <div className="p-3 bg-primary/10 rounded-lg text-center">
          <p className="text-2xl font-bold text-primary">{finalMonthlyValue.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Monthly Bottles</p>
        </div>
      </div>

      {isOverrideMode && (
        <Badge variant="outline" className="text-xs">
          <Edit2 className="h-3 w-3 mr-1" /> Manual Override
        </Badge>
      )}

      {/* Expanded Quick View */}
      {expanded && (
        <div className="pt-3 border-t space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Total Covers:</span>
              <span className="ml-2 font-medium">{formInputs.total_covers}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Operating Days:</span>
              <span className="ml-2 font-medium">{formInputs.dining_behavior.operating_days}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Adoption Rate:</span>
              <span className="ml-2 font-medium">{formInputs.dining_behavior.water_adoption_rate}%</span>
            </div>
            <div>
              <span className="text-muted-foreground">Avg Table Time:</span>
              <span className="ml-2 font-medium">{formInputs.dining_behavior.avg_table_time} min</span>
            </div>
          </div>
          
          {/* Mode-wise breakdown */}
          <div className="grid grid-cols-4 gap-1 text-xs">
            {TIME_SLOTS.map(slot => {
              const Icon = slot.icon;
              const pattern = formInputs.operating_pattern[slot.key];
              return (
                <div 
                  key={slot.key} 
                  className={`p-2 rounded text-center ${pattern?.enabled ? 'bg-secondary' : 'bg-muted/30 opacity-50'}`}
                >
                  <Icon className={`h-3 w-3 mx-auto mb-1 ${slot.color}`} />
                  <p className="font-medium">{calculatedResults.slotEstimations[slot.key]}</p>
                  <p className="text-muted-foreground">{slot.label}</p>
                </div>
              );
            })}
          </div>

          <Button 
            size="sm" 
            className="w-full" 
            onClick={() => setShowModal(true)}
            data-testid="edit-estimation-btn"
          >
            <Calculator className="h-4 w-4 mr-2" />
            Edit Estimation
          </Button>
        </div>
      )}
    </div>
  );

  // Full estimation form
  const EstimationForm = () => (
    <div className="space-y-6">
      {/* Total Covers */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Total Covers (Seating Capacity)</Label>
        <Input
          type="number"
          value={formInputs.total_covers}
          onChange={(e) => updateFormInput('total_covers', parseInt(e.target.value) || 0)}
          onBlur={handleInputBlur}
          className="text-lg font-semibold"
          data-testid="total-covers-input"
        />
      </div>

      {/* Operating Pattern */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Operating Pattern</Label>
        <div className="space-y-2">
          {TIME_SLOTS.map(slot => {
            const Icon = slot.icon;
            const pattern = formInputs.operating_pattern[slot.key];
            return (
              <div 
                key={slot.key}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  pattern?.enabled ? 'bg-secondary/50 border-primary/20' : 'bg-muted/30 border-transparent'
                }`}
              >
                <Switch
                  checked={pattern?.enabled || false}
                  onCheckedChange={(checked) => {
                    updatePattern(slot.key, 'enabled', checked);
                    // Auto-apply when toggling switches
                    setTimeout(() => {
                      const newInputs = {
                        ...formInputs,
                        operating_pattern: {
                          ...formInputs.operating_pattern,
                          [slot.key]: { ...formInputs.operating_pattern[slot.key], enabled: checked }
                        }
                      };
                      setCalculatedResults(calculateFromInputs(newInputs, defaultBottlesPerCover));
                      setHasUnappliedChanges(false);
                    }, 0);
                  }}
                  data-testid={`toggle-${slot.key}`}
                />
                <Icon className={`h-5 w-5 ${slot.color}`} />
                <span className="font-medium flex-1">{slot.label}</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={pattern?.density || 0}
                    onChange={(e) => updatePattern(slot.key, 'density', parseInt(e.target.value) || 0)}
                    onBlur={handleInputBlur}
                    className="w-20 text-center"
                    disabled={!pattern?.enabled}
                    data-testid={`density-${slot.key}`}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dining Behavior */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Dining Behavior</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Avg Table Time (min)</Label>
            <Input
              type="number"
              value={formInputs.dining_behavior.avg_table_time}
              onChange={(e) => updateBehavior('avg_table_time', parseInt(e.target.value) || 30)}
              onBlur={handleInputBlur}
              data-testid="avg-table-time"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Water Adoption Rate (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={formInputs.dining_behavior.water_adoption_rate}
              onChange={(e) => updateBehavior('water_adoption_rate', parseInt(e.target.value) || 0)}
              onBlur={handleInputBlur}
              data-testid="water-adoption-rate"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Operating Days/Month</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={formInputs.dining_behavior.operating_days}
              onChange={(e) => updateBehavior('operating_days', parseInt(e.target.value) || 30)}
              onBlur={handleInputBlur}
              data-testid="operating-days"
            />
          </div>
        </div>
      </div>

      {/* Apply Button */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant={hasUnappliedChanges ? "default" : "outline"}
          onClick={handleApplyCalculation}
          className="flex-1"
          data-testid="apply-calculation-btn"
        >
          <Play className="h-4 w-4 mr-2" />
          {hasUnappliedChanges ? 'Apply Changes' : 'Recalculate'}
        </Button>
        {hasUnappliedChanges && (
          <Button
            type="button"
            variant="ghost"
            onClick={handleReset}
            className="text-muted-foreground"
          >
            Reset
          </Button>
        )}
      </div>

      {/* Mode-wise Estimation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Mode-wise Estimation</Label>
          {hasUnappliedChanges && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
              Unapplied changes
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {TIME_SLOTS.map(slot => {
            const Icon = slot.icon;
            const pattern = formInputs.operating_pattern[slot.key];
            const bottles = calculatedResults.slotEstimations[slot.key];
            return (
              <div 
                key={slot.key}
                className={`p-3 rounded-lg text-center transition-all ${
                  pattern?.enabled 
                    ? 'bg-secondary border border-primary/10' 
                    : 'bg-muted/30 opacity-50'
                }`}
              >
                <Icon className={`h-5 w-5 mx-auto mb-2 ${slot.color}`} />
                <p className="text-lg font-bold">{bottles.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{slot.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Results */}
      <div className="p-4 bg-gradient-to-r from-blue-50 to-primary/10 dark:from-blue-900/20 dark:to-primary/20 rounded-xl space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-4 bg-white/50 dark:bg-black/20 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Daily Water Opportunity</p>
            <p className="text-3xl font-bold text-blue-600">
              {calculatedResults.dailyTotal.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Bottles</p>
          </div>
          <div className="text-center p-4 bg-white/50 dark:bg-black/20 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Monthly Water Opportunity</p>
            <p className="text-3xl font-bold text-primary">
              {calculatedResults.monthlyTotal.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Bottles</p>
          </div>
        </div>

        {/* Override Option */}
        <div className="pt-4 border-t border-white/20">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Edit2 className="h-4 w-4" />
              Override with known value
            </Label>
            <Switch
              checked={isOverrideMode}
              onCheckedChange={(checked) => {
                setIsOverrideMode(checked);
                if (!checked) setOverrideInput('');
              }}
              data-testid="override-toggle"
            />
          </div>
          {isOverrideMode && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Enter monthly bottles"
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
                className="text-lg font-semibold"
                data-testid="override-value-input"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">bottles/month</span>
            </div>
          )}
        </div>

        {/* Final Value */}
        {isOverrideMode && overrideInput && (
          <div className="text-center p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-1">Final Value (Override)</p>
            <p className="text-2xl font-bold text-amber-600">{parseInt(overrideInput).toLocaleString()} bottles/month</p>
          </div>
        )}
      </div>

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full"
        data-testid="save-estimation-btn"
      >
        {saving ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
        ) : (
          <><Save className="h-4 w-4 mr-2" /> Save Estimation</>
        )}
      </Button>
    </div>
  );

  return (
    <>
      {/* Compact Card View */}
      <Card className="p-4" data-testid="opportunity-estimation-card">
        <CompactView />
      </Card>

      {/* Full Modal View */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Droplets className="h-5 w-5 text-blue-500" />
              Opportunity Estimation
              {leadName && <span className="text-muted-foreground font-normal">- {leadName}</span>}
            </DialogTitle>
          </DialogHeader>
          <EstimationForm />
        </DialogContent>
      </Dialog>
    </>
  );
}
