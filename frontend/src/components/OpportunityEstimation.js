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
  Droplets, Calculator, Save, Maximize2,
  Loader2, Edit2, ChevronDown, ChevronUp,
  Sun, Moon, Sunset, Coffee, Info
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { useTenantConfig } from '../context/TenantConfigContext';

const API = process.env.REACT_APP_BACKEND_URL;

export default function OpportunityEstimation({ leadId, leadName, existingEstimation, onSave }) {
  const { hasIndustryFeature } = useTenantConfig();
  
  // Form values as strings
  const [totalCovers, setTotalCovers] = useState(String(existingEstimation?.total_covers ?? 100));
  const [morningEnabled, setMorningEnabled] = useState(existingEstimation?.operating_pattern?.morning?.enabled ?? true);
  const [morningDensity, setMorningDensity] = useState(String(existingEstimation?.operating_pattern?.morning?.density ?? 60));
  const [eveningEnabled, setEveningEnabled] = useState(existingEstimation?.operating_pattern?.evening?.enabled ?? true);
  const [eveningDensity, setEveningDensity] = useState(String(existingEstimation?.operating_pattern?.evening?.density ?? 80));
  const [nightEnabled, setNightEnabled] = useState(existingEstimation?.operating_pattern?.night?.enabled ?? true);
  const [nightDensity, setNightDensity] = useState(String(existingEstimation?.operating_pattern?.night?.density ?? 90));
  const [snacksEnabled, setSnacksEnabled] = useState(existingEstimation?.operating_pattern?.snacks?.enabled ?? false);
  const [snacksDensity, setSnacksDensity] = useState(String(existingEstimation?.operating_pattern?.snacks?.density ?? 40));
  const [avgTableTime, setAvgTableTime] = useState(String(existingEstimation?.dining_behavior?.avg_table_time ?? 45));
  const [adoptionRate, setAdoptionRate] = useState(String(existingEstimation?.dining_behavior?.water_adoption_rate ?? 70));
  const [operatingDays, setOperatingDays] = useState(String(existingEstimation?.dining_behavior?.operating_days ?? 30));
  const [overrideValue, setOverrideValue] = useState(String(existingEstimation?.override_value ?? ''));
  const [isOverrideMode, setIsOverrideMode] = useState(!!existingEstimation?.override_value);
  
  const [results, setResults] = useState({
    morning: existingEstimation?.calculated_daily ? Math.round(existingEstimation.calculated_daily * 0.26) : 0,
    evening: existingEstimation?.calculated_daily ? Math.round(existingEstimation.calculated_daily * 0.35) : 0,
    night: existingEstimation?.calculated_daily ? Math.round(existingEstimation.calculated_daily * 0.39) : 0,
    snacks: 0,
    daily: existingEstimation?.calculated_daily || 0,
    monthly: existingEstimation?.calculated_monthly || 0
  });
  
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showFormula, setShowFormula] = useState(false);

  // Calculate function - called on blur and toggle
  const calculate = useCallback((overrides = {}) => {
    const covers = parseInt(overrides.totalCovers ?? totalCovers) || 0;
    const tableTime = parseInt(overrides.avgTableTime ?? avgTableTime) || 45;
    const adoption = parseInt(overrides.adoptionRate ?? adoptionRate) || 0;
    const days = parseInt(overrides.operatingDays ?? operatingDays) || 30;
    
    const slots = [
      { key: 'morning', enabled: overrides.morningEnabled ?? morningEnabled, density: parseInt(overrides.morningDensity ?? morningDensity) || 0 },
      { key: 'evening', enabled: overrides.eveningEnabled ?? eveningEnabled, density: parseInt(overrides.eveningDensity ?? eveningDensity) || 0 },
      { key: 'night', enabled: overrides.nightEnabled ?? nightEnabled, density: parseInt(overrides.nightDensity ?? nightDensity) || 0 },
      { key: 'snacks', enabled: overrides.snacksEnabled ?? snacksEnabled, density: parseInt(overrides.snacksDensity ?? snacksDensity) || 0 },
    ];
    
    let daily = 0;
    const slotResults = {};
    
    slots.forEach(slot => {
      if (slot.enabled) {
        // Formula: Covers × (Occupancy% / 100) × (180 / TableTime) × (Adoption% / 100)
        const bottles = Math.round(covers * (slot.density / 100) * (180 / tableTime) * (adoption / 100));
        slotResults[slot.key] = bottles;
        daily += bottles;
      } else {
        slotResults[slot.key] = 0;
      }
    });
    
    setResults({ ...slotResults, daily, monthly: daily * days });
  }, [totalCovers, avgTableTime, adoptionRate, operatingDays, morningEnabled, morningDensity, eveningEnabled, eveningDensity, nightEnabled, nightDensity, snacksEnabled, snacksDensity]);

  // Handle blur - recalculate
  const handleBlur = () => {
    calculate();
  };

  // Handle toggle with auto-calculate
  const handleToggle = (mode, value) => {
    if (mode === 'morning') {
      setMorningEnabled(value);
      calculate({ morningEnabled: value });
    } else if (mode === 'evening') {
      setEveningEnabled(value);
      calculate({ eveningEnabled: value });
    } else if (mode === 'night') {
      setNightEnabled(value);
      calculate({ nightEnabled: value });
    } else if (mode === 'snacks') {
      setSnacksEnabled(value);
      calculate({ snacksEnabled: value });
    }
  };

  if (!hasIndustryFeature('lead_bottle_tracking')) {
    return null;
  }

  const finalMonthly = isOverrideMode && overrideValue ? parseInt(overrideValue) || 0 : results.monthly;
  const finalDaily = isOverrideMode && overrideValue 
    ? Math.round((parseInt(overrideValue) || 0) / (parseInt(operatingDays) || 1))
    : results.daily;

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        total_covers: parseInt(totalCovers) || 0,
        operating_pattern: {
          morning: { enabled: morningEnabled, density: parseInt(morningDensity) || 0 },
          evening: { enabled: eveningEnabled, density: parseInt(eveningDensity) || 0 },
          night: { enabled: nightEnabled, density: parseInt(nightDensity) || 0 },
          snacks: { enabled: snacksEnabled, density: parseInt(snacksDensity) || 0 },
        },
        dining_behavior: {
          avg_table_time: parseInt(avgTableTime) || 45,
          water_adoption_rate: parseInt(adoptionRate) || 0,
          operating_days: parseInt(operatingDays) || 30,
        },
        calculated_daily: results.daily,
        calculated_monthly: results.monthly,
        override_value: isOverrideMode ? parseInt(overrideValue) || null : null,
        final_monthly: finalMonthly,
        final_daily: finalDaily,
      };
      
      await axios.put(`${API}/api/leads/${leadId}/opportunity-estimation`, payload);
      toast.success('Estimation saved');
      if (onSave) onSave(payload);
      setShowModal(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Compact Card */}
      <Card className="p-4" data-testid="opportunity-estimation-card">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="h-5 w-5 text-blue-500" />
              <span className="font-semibold">Opportunity Estimation</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowModal(true)}>
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
              <p className="text-2xl font-bold text-blue-600">{finalDaily.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Daily Bottles</p>
            </div>
            <div className="p-3 bg-primary/10 rounded-lg text-center">
              <p className="text-2xl font-bold text-primary">{finalMonthly.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Monthly Bottles</p>
            </div>
          </div>

          {isOverrideMode && <Badge variant="outline" className="text-xs"><Edit2 className="h-3 w-3 mr-1" /> Manual Override</Badge>}

          {expanded && (
            <div className="pt-3 border-t space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Total Covers:</span> <span className="ml-2 font-medium">{totalCovers}</span></div>
                <div><span className="text-muted-foreground">Operating Days:</span> <span className="ml-2 font-medium">{operatingDays}</span></div>
                <div><span className="text-muted-foreground">Adoption Rate:</span> <span className="ml-2 font-medium">{adoptionRate}%</span></div>
                <div><span className="text-muted-foreground">Table Time:</span> <span className="ml-2 font-medium">{avgTableTime} min</span></div>
              </div>
              <Button size="sm" className="w-full" onClick={() => setShowModal(true)}>
                <Calculator className="h-4 w-4 mr-2" /> Edit Estimation
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Droplets className="h-5 w-5 text-blue-500" />
              Opportunity Estimation
              {leadName && <span className="text-muted-foreground font-normal">- {leadName}</span>}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* RESULTS SECTION */}
            <div className="p-4 bg-gradient-to-r from-blue-50 to-primary/10 dark:from-blue-900/20 dark:to-primary/20 rounded-xl">
              <div className="grid grid-cols-6 gap-2 text-center mb-3">
                <div className="p-2 bg-white/50 dark:bg-black/20 rounded">
                  <p className="font-bold">{results.morning.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Morning</p>
                </div>
                <div className="p-2 bg-white/50 dark:bg-black/20 rounded">
                  <p className="font-bold">{results.evening.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Evening</p>
                </div>
                <div className="p-2 bg-white/50 dark:bg-black/20 rounded">
                  <p className="font-bold">{results.night.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Night</p>
                </div>
                <div className="p-2 bg-white/50 dark:bg-black/20 rounded">
                  <p className="font-bold">{results.snacks.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Snacks</p>
                </div>
                <div className="p-2 bg-white/70 dark:bg-black/30 rounded">
                  <p className="font-bold text-blue-600">{results.daily.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Daily</p>
                </div>
                <div className="p-2 bg-white/70 dark:bg-black/30 rounded">
                  <p className="font-bold text-primary">{results.monthly.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Monthly</p>
                </div>
              </div>

              {/* Override Row */}
              <div className="flex items-center gap-3 pt-2 border-t border-white/30">
                <div className="flex items-center gap-2">
                  <Switch checked={isOverrideMode} onCheckedChange={(c) => { setIsOverrideMode(c); if (!c) setOverrideValue(''); }} />
                  <span className="text-sm"><Edit2 className="h-3 w-3 inline mr-1" />Override</span>
                </div>
                {isOverrideMode && (
                  <>
                    <Input type="number" placeholder="Monthly bottles" value={overrideValue} onChange={(e) => setOverrideValue(e.target.value)} className="w-32 h-8" />
                    {overrideValue && <span className="text-sm font-medium text-amber-600">= {(parseInt(overrideValue) || 0).toLocaleString()}/month</span>}
                  </>
                )}
              </div>
            </div>

            {/* Formula - Collapsible */}
            <div 
              className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground"
              onClick={() => setShowFormula(!showFormula)}
            >
              <Info className="h-4 w-4" />
              <span>How is this calculated?</span>
              {showFormula ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </div>
            {showFormula && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">Per Mode</span> = Covers × Occupancy% × Table Turnovers × Adoption%</p>
                <p className="text-xs mt-1">Table Turnovers = 180 mins ÷ Avg Table Time (each mode is assumed to be 3 hours)</p>
                <p className="text-xs mt-1"><span className="font-medium">Daily</span> = Sum of enabled modes &nbsp;|&nbsp; <span className="font-medium">Monthly</span> = Daily × Operating Days</p>
              </div>
            )}

            {/* Total Covers */}
            <div className="space-y-1">
              <Label>Total Covers (Seating Capacity)</Label>
              <Input 
                type="number" 
                value={totalCovers} 
                onChange={(e) => setTotalCovers(e.target.value)} 
                onBlur={handleBlur}
                className="text-lg font-semibold" 
              />
            </div>

            {/* Two Column Layout: Operating Pattern + Dining Behavior */}
            <div className="grid grid-cols-2 gap-6">
              {/* Operating Pattern - Left */}
              <div className="space-y-2">
                <Label>Operating Pattern</Label>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 font-medium">Mode</th>
                        <th className="text-center p-2 font-medium">Occupancy %</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className={`border-t ${morningEnabled ? '' : 'opacity-50'}`}>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <Switch checked={morningEnabled} onCheckedChange={(v) => handleToggle('morning', v)} />
                            <Sun className="h-4 w-4 text-amber-500" />
                            <span>Morning</span>
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <Input 
                            type="number" 
                            value={morningDensity} 
                            onChange={(e) => setMorningDensity(e.target.value)} 
                            onBlur={handleBlur}
                            className="w-20 text-center mx-auto h-8" 
                            disabled={!morningEnabled} 
                          />
                        </td>
                      </tr>
                      <tr className={`border-t ${eveningEnabled ? '' : 'opacity-50'}`}>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <Switch checked={eveningEnabled} onCheckedChange={(v) => handleToggle('evening', v)} />
                            <Sunset className="h-4 w-4 text-orange-500" />
                            <span>Evening</span>
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <Input 
                            type="number" 
                            value={eveningDensity} 
                            onChange={(e) => setEveningDensity(e.target.value)} 
                            onBlur={handleBlur}
                            className="w-20 text-center mx-auto h-8" 
                            disabled={!eveningEnabled} 
                          />
                        </td>
                      </tr>
                      <tr className={`border-t ${nightEnabled ? '' : 'opacity-50'}`}>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <Switch checked={nightEnabled} onCheckedChange={(v) => handleToggle('night', v)} />
                            <Moon className="h-4 w-4 text-indigo-500" />
                            <span>Night</span>
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <Input 
                            type="number" 
                            value={nightDensity} 
                            onChange={(e) => setNightDensity(e.target.value)} 
                            onBlur={handleBlur}
                            className="w-20 text-center mx-auto h-8" 
                            disabled={!nightEnabled} 
                          />
                        </td>
                      </tr>
                      <tr className={`border-t ${snacksEnabled ? '' : 'opacity-50'}`}>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <Switch checked={snacksEnabled} onCheckedChange={(v) => handleToggle('snacks', v)} />
                            <Coffee className="h-4 w-4 text-amber-700" />
                            <span>Snacks</span>
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <Input 
                            type="number" 
                            value={snacksDensity} 
                            onChange={(e) => setSnacksDensity(e.target.value)} 
                            onBlur={handleBlur}
                            className="w-20 text-center mx-auto h-8" 
                            disabled={!snacksEnabled} 
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dining Behavior - Right */}
              <div className="space-y-2">
                <Label>Dining Behavior</Label>
                <div className="border rounded-lg p-4 space-y-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Avg Table Time (min)</Label>
                    <Input 
                      type="number" 
                      value={avgTableTime} 
                      onChange={(e) => setAvgTableTime(e.target.value)} 
                      onBlur={handleBlur}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">% of guests opting bottled water</Label>
                    <Input 
                      type="number" 
                      value={adoptionRate} 
                      onChange={(e) => setAdoptionRate(e.target.value)} 
                      onBlur={handleBlur}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Operating Days / Month</Label>
                    <Input 
                      type="number" 
                      value={operatingDays} 
                      onChange={(e) => setOperatingDays(e.target.value)} 
                      onBlur={handleBlur}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Save - Large blue button */}
            <Button 
              onClick={handleSave} 
              disabled={saving} 
              className="w-full h-12 text-lg bg-blue-600 hover:bg-blue-700 text-white"
              size="lg"
            >
              {saving ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Save className="h-5 w-5 mr-2" />}
              Save Estimation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
