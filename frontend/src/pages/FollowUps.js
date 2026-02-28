import React, { useEffect, useState } from 'react';
import { followUpsAPI, leadsAPI } from '../utils/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Calendar } from '../components/ui/calendar';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, CheckCircle2, Clock, Plus, Loader2 } from 'lucide-react';
import { format, isToday, isFuture, isPast } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

export default function FollowUps() {
  const [followUps, setFollowUps] = useState([]);
  const [leads, setLeads] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [followUpsRes, leadsRes] = await Promise.all([
        followUpsAPI.getAll(),
        leadsAPI.getAll(),
      ]);
      setFollowUps(followUpsRes.data);
      setLeads(leadsRes.data);
    } catch (error) {
      toast.error('Failed to load follow-ups');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (id) => {
    try {
      await followUpsAPI.complete(id);
      toast.success('Follow-up marked as completed');
      fetchData();
    } catch (error) {
      toast.error('Failed to complete follow-up');
    }
  };

  const upcomingFollowUps = followUps
    .filter(f => !f.is_completed)
    .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

  const completedFollowUps = followUps.filter(f => f.is_completed);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="relative"><div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" /><Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" /></div>
          <p className="text-muted-foreground text-sm mt-4 animate-pulse">Loading follow-ups...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="follow-ups-page">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-100 to-teal-100 dark:from-cyan-900/50 dark:to-teal-900/30">
            <CalendarIcon className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Follow-ups</h1>
            <p className="text-muted-foreground">Manage scheduled follow-ups with leads</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-followup-button" className="bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 text-white shadow-lg shadow-cyan-200/50 dark:shadow-cyan-900/30">
              <Plus className="h-4 w-4 mr-2" />
              Schedule Follow-up
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Follow-up</DialogTitle>
            </DialogHeader>
            <AddFollowUpForm
              leads={leads}
              onSuccess={() => {
                setDialogOpen(false);
                fetchData();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="p-6 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            Calendar
          </h2>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            className="rounded-md border"
          />
        </Card>

        {/* Upcoming Follow-ups */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-6 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              Upcoming Follow-ups
            </h2>
            <div className="space-y-3">
              {upcomingFollowUps.length === 0 ? (
                <p className="text-muted-foreground text-sm" data-testid="no-followups-message">
                  No upcoming follow-ups scheduled
                </p>
              ) : (
                upcomingFollowUps.slice(0, 10).map((followUp) => {
                  const lead = leads.find(l => l.id === followUp.lead_id);
                  const scheduleDate = new Date(followUp.scheduled_date);
                  const isOverdue = isPast(scheduleDate) && !isToday(scheduleDate);
                  
                  return (
                    <div
                      key={followUp.id}
                      className="flex items-start justify-between p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-700/30 rounded-xl border border-slate-100 dark:border-slate-700/50"
                      data-testid={`followup-${followUp.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-slate-800 dark:text-white">{followUp.title}</p>
                          {isOverdue && (
                            <Badge variant="destructive" className="text-xs">Overdue</Badge>
                          )}
                          {isToday(scheduleDate) && (
                            <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">Today</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {lead?.name} - {format(scheduleDate, 'MMM d, yyyy h:mm a')}
                        </p>
                        {followUp.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-400">{followUp.description}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleComplete(followUp.id)}
                        data-testid={`complete-followup-${followUp.id}`}
                        className="border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Completed Follow-ups */}
          {completedFollowUps.length > 0 && (
            <Card className="p-6 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Recently Completed
              </h2>
              <div className="space-y-3">
                {completedFollowUps.slice(0, 5).map((followUp) => {
                  const lead = leads.find(l => l.id === followUp.lead_id);
                  return (
                    <div key={followUp.id} className="flex items-center gap-3 p-3 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/10 rounded-lg border border-emerald-100 dark:border-emerald-800/30">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      <div className="flex-1">
                        <p className="font-medium text-sm text-slate-800 dark:text-white">{followUp.title}</p>
                        <p className="text-xs text-muted-foreground">{lead?.name}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function AddFollowUpForm({ leads, onSuccess }) {
  const [formData, setFormData] = useState({
    lead_id: '',
    title: '',
    description: '',
    scheduled_date: new Date().toISOString().slice(0, 16),
    assigned_to: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const selectedLead = leads.find(l => l.id === formData.lead_id);
      await followUpsAPI.create({
        ...formData,
        scheduled_date: new Date(formData.scheduled_date).toISOString(),
        assigned_to: formData.assigned_to || selectedLead?.assigned_to || selectedLead?.created_by
      });
      toast.success('Follow-up scheduled');
      onSuccess();
    } catch (error) {
      toast.error('Failed to schedule follow-up');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Lead *</Label>
        <Select value={formData.lead_id} onValueChange={(value) => setFormData({...formData, lead_id: value})} required>
          <SelectTrigger data-testid="followup-lead-select">
            <SelectValue placeholder="Select a lead" />
          </SelectTrigger>
          <SelectContent>
            {leads.map(lead => (
              <SelectItem key={lead.id} value={lead.id}>{lead.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({...formData, title: e.target.value})}
          placeholder="e.g., Follow-up call"
          required
          data-testid="followup-title-input"
        />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          rows={3}
          data-testid="followup-description-input"
        />
      </div>
      <div className="space-y-2">
        <Label>Scheduled Date & Time *</Label>
        <Input
          type="datetime-local"
          value={formData.scheduled_date}
          onChange={(e) => setFormData({...formData, scheduled_date: e.target.value})}
          required
          data-testid="followup-date-input"
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full" data-testid="submit-followup-button">
        {loading ? 'Scheduling...' : 'Schedule Follow-up'}
      </Button>
    </form>
  );
}
