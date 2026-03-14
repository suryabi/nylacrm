import React, { useState } from 'react';
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

export default function OpportunityEstimation({ leadId, leadName, existingEstimation, onSave }) {
  const { hasIndustryFeature } = useTenantConfig();
  
  // All form values stored as STRINGS
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
  
  // Calculated results
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

  if (!hasIndustryFeature('lead_bottle_tracking')) {
    return null;
  }

  // Calculate
  // Formula: Bottles per mode = Total Covers × (Density % / 100) × (180 / Avg Table Time) × (Adoption Rate / 100)
  const calculate = () => {
    const covers = parseInt(totalCovers) || 0;
    const tableTime = parseInt(avgTableTime) || 45;
    const adoption = parseInt(adoptionRate) || 0;
    const days = parseInt(operatingDays) || 30;
    
    const slots = [
      { key: 'morning', enabled: morningEnabled, density: parseInt(morningDensity) || 0 },
      { key: 'evening', enabled: eveningEnabled, density: parseInt(eveningDensity) || 0 },
      { key: 'night', enabled: nightEnabled, density: parseInt(nightDensity) || 0 },
      { key: 'snacks', enabled: snacksEnabled, density: parseInt(snacksDensity) || 0 },
    ];
    
    let daily = 0;
    const slotResults = {};
    
    slots.forEach(slot => {
      if (slot.enabled) {
        // Bottles per mode = Total Covers × (Density % / 100) × (180 / Avg Table Time) × (Adoption Rate / 100)
        const bottles = Math.round(
          covers * (slot.density / 100) * (180 / tableTime) * (adoption / 100)
        );
        slotResults[slot.key] = bottles;
        daily += bottles;
      } else {
        slotResults[slot.key] = 0;
      }
    });
    
    setResults({ ...slotResults, daily, monthly: daily * days });
    toast.success('Calculation complete');
  };

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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Droplets className="h-5 w-5 text-blue-500" />
              Opportunity Estimation
              {leadName && <span className="text-muted-foreground font-normal">- {leadName}</span>}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            
            {/* RESULTS SECTION - AT THE TOP */}
            <div className="p-4 bg-gradient-to-r from-blue-50 to-primary/10 dark:from-blue-900/20 dark:to-primary/20 rounded-xl space-y-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2 bg-white/50 dark:bg-black/20 rounded">
                  <p className="font-bold text-lg">{results.morning.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Morning</p>
                </div>
                <div className="p-2 bg-white/50 dark:bg-black/20 rounded">
                  <p className="font-bold text-lg">{results.evening.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Evening</p>
                </div>
                <div className="p-2 bg-white/50 dark:bg-black/20 rounded">
                  <p className="font-bold text-lg">{results.night.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Night</p>
                </div>
                <div className="p-2 bg-white/50 dark:bg-black/20 rounded">
                  <p className="font-bold text-lg">{results.snacks.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Snacks</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-white/70 dark:bg-black/30 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Daily Water Opportunity</p>
                  <p className="text-4xl font-bold text-blue-600">{results.daily.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Bottles</p>
                </div>
                <div className="text-center p-4 bg-white/70 dark:bg-black/30 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Monthly Water Opportunity</p>
                  <p className="text-4xl font-bold text-primary">{results.monthly.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Bottles</p>
                </div>
              </div>

              {/* Formula Explanation */}
              <div className="p-3 bg-white/50 dark:bg-black/20 rounded-lg text-sm">
                <p className="font-medium text-muted-foreground mb-2">How is this calculated?</p>
                <p className="text-muted-foreground mb-2">
                  <span className="font-medium text-foreground">Per Mode</span> = Covers × Density% × Table Turnovers × Adoption%
                </p>
                <p className="text-xs text-muted-foreground">
                  Table Turnovers = 180 mins ÷ Avg Table Time (e.g., 180÷45 = 4 turnovers per session)
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="font-medium">Daily</span> = Sum of all enabled modes &nbsp;|&nbsp; 
                  <span className="font-medium">Monthly</span> = Daily × Operating Days
                </p>
              </div>

              {/* Override */}
              <div className="pt-3 border-t border-white/30">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm flex items-center gap-2"><Edit2 className="h-4 w-4" /> Override with known value</Label>
                  <Switch checked={isOverrideMode} onCheckedChange={(c) => { setIsOverrideMode(c); if (!c) setOverrideValue(''); }} />
                </div>
                {isOverrideMode && (
                  <div className="flex items-center gap-2">
                    <Input type="number" placeholder="Monthly bottles" value={overrideValue} onChange={(e) => setOverrideValue(e.target.value)} className="text-lg" />
                    <span className="text-sm text-muted-foreground">bottles/month</span>
                  </div>
                )}
                {isOverrideMode && overrideValue && (
                  <div className="mt-3 text-center p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                    <p className="text-sm text-amber-700 dark:text-amber-300">Final Value (Override)</p>
                    <p className="text-2xl font-bold text-amber-600">{(parseInt(overrideValue) || 0).toLocaleString()} bottles/month</p>
                  </div>
                )}
              </div>
            </div>

            {/* CALCULATE BUTTON - Prominent */}
            <Button 
              onClick={calculate} 
              className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700 text-white"
              size="lg"
            >
              <Play className="h-5 w-5 mr-2" /> 
              Calculate Estimation
            </Button>

            {/* Total Covers */}
            <div className="space-y-2">
              <Label>Total Covers (Seating Capacity)</Label>
              <Input
                type="number"
                value={totalCovers}
                onChange={(e) => setTotalCovers(e.target.value)}
                className="text-lg font-semibold"
              />
            </div>

            {/* Operating Pattern */}
            <div className="space-y-3">
              <Label>Operating Pattern</Label>
              
              <div className={`flex items-center gap-3 p-3 rounded-lg border ${morningEnabled ? 'bg-secondary/50' : 'bg-muted/30'}`}>
                <Switch checked={morningEnabled} onCheckedChange={setMorningEnabled} />
                <Sun className="h-5 w-5 text-amber-500" />
                <span className="font-medium flex-1">Morning</span>
                <Input type="number" value={morningDensity} onChange={(e) => setMorningDensity(e.target.value)} className="w-20 text-center" disabled={!morningEnabled} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              
              <div className={`flex items-center gap-3 p-3 rounded-lg border ${eveningEnabled ? 'bg-secondary/50' : 'bg-muted/30'}`}>
                <Switch checked={eveningEnabled} onCheckedChange={setEveningEnabled} />
                <Sunset className="h-5 w-5 text-orange-500" />
                <span className="font-medium flex-1">Evening</span>
                <Input type="number" value={eveningDensity} onChange={(e) => setEveningDensity(e.target.value)} className="w-20 text-center" disabled={!eveningEnabled} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              
              <div className={`flex items-center gap-3 p-3 rounded-lg border ${nightEnabled ? 'bg-secondary/50' : 'bg-muted/30'}`}>
                <Switch checked={nightEnabled} onCheckedChange={setNightEnabled} />
                <Moon className="h-5 w-5 text-indigo-500" />
                <span className="font-medium flex-1">Night</span>
                <Input type="number" value={nightDensity} onChange={(e) => setNightDensity(e.target.value)} className="w-20 text-center" disabled={!nightEnabled} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              
              <div className={`flex items-center gap-3 p-3 rounded-lg border ${snacksEnabled ? 'bg-secondary/50' : 'bg-muted/30'}`}>
                <Switch checked={snacksEnabled} onCheckedChange={setSnacksEnabled} />
                <Coffee className="h-5 w-5 text-amber-700" />
                <span className="font-medium flex-1">Snacks</span>
                <Input type="number" value={snacksDensity} onChange={(e) => setSnacksDensity(e.target.value)} className="w-20 text-center" disabled={!snacksEnabled} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>

            {/* Dining Behavior */}
            <div className="space-y-3">
              <Label>Dining Behavior</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Avg Table Time (min)</Label>
                  <Input type="number" value={avgTableTime} onChange={(e) => setAvgTableTime(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Adoption Rate (%)</Label>
                  <Input type="number" value={adoptionRate} onChange={(e) => setAdoptionRate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Operating Days</Label>
                  <Input type="number" value={operatingDays} onChange={(e) => setOperatingDays(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Save */}
            <Button onClick={handleSave} disabled={saving} className="w-full h-12">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Estimation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
