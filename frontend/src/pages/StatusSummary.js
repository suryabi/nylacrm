import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import { Calendar, Users, Loader2, User, MapPin } from 'lucide-react';
import { format, subDays } from 'date-fns';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const TERRITORIES = ['All Territories', 'North India', 'South India', 'West India', 'East India', 'Central India'];

const TERRITORY_STATES = {
  'North India': ['Delhi NCR', 'Uttar Pradesh', 'Punjab', 'Haryana', 'Rajasthan', 'Himachal Pradesh', 'Uttarakhand'],
  'South India': ['Karnataka', 'Tamil Nadu', 'Kerala', 'Andhra Pradesh', 'Telangana'],
  'East India': ['West Bengal', 'Bihar', 'Odisha', 'Jharkhand', 'Assam'],
  'West India': ['Maharashtra', 'Gujarat', 'Goa', 'Madhya Pradesh'],
  'Central India': ['Madhya Pradesh', 'Chhattisgarh']
};

const STATE_CITIES = {
  'Karnataka': ['Bengaluru', 'Mysuru', 'Hubli', 'Mangaluru'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai'],
  'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad'],
  'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Nashik'],
  'Delhi NCR': ['New Delhi', 'Gurugram', 'Noida', 'Faridabad'],
  'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara'],
  'West Bengal': ['Kolkata', 'Howrah', 'Durgapur'],
  'Uttar Pradesh': ['Lucknow', 'Noida', 'Kanpur', 'Agra'],
};

// Helper to render bulleted content
const BulletedContent = ({ text }) => {
  if (!text) return <p className="text-sm text-muted-foreground italic">No updates provided</p>;
  
  const lines = text.split('\n').filter(line => line.trim());
  
  return (
    <ul className="space-y-1.5">
      {lines.map((line, index) => {
        const cleanLine = line.replace(/^[•\-\*]\s*/, '').trim();
        return (
          <li key={index} className="flex items-start gap-2 text-sm">
            <span className="text-primary mt-0.5">•</span>
            <span className="leading-relaxed">{cleanLine}</span>
          </li>
        );
      })}
    </ul>
  );
};

export default function StatusSummary() {
  const [selectedDate, setSelectedDate] = useState(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [statuses, setStatuses] = useState([]);
  
  // Filters
  const [territoryFilter, setTerritoryFilter] = useState('All Territories');
  const [stateFilter, setStateFilter] = useState('All States');
  const [cityFilter, setCityFilter] = useState('All Cities');
  const [resourceFilter, setResourceFilter] = useState('All Resources');

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

  // Get available states and cities based on selection
  const availableStates = territoryFilter === 'All Territories' 
    ? ['All States']
    : ['All States', ...(TERRITORY_STATES[territoryFilter] || [])];
  
  const availableCities = stateFilter === 'All States'
    ? ['All Cities']
    : ['All Cities', ...(STATE_CITIES[stateFilter] || [])];

  useEffect(() => {
    fetchAllUsers();
  }, []);

  useEffect(() => {
    fetchStatuses();
  }, [selectedDate]);

  const fetchAllUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAllUsers(response.data.filter(u => u.is_active));
    } catch (error) {
      console.error('Failed to load users');
    }
  };

  const fetchStatuses = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/daily-status/team-rollup`, {
        params: { status_date: selectedDate },
        headers: { Authorization: `Bearer ${token}` }
      });
      setStatuses(response.data.team_statuses || []);
    } catch (error) {
      toast.error('Failed to load statuses');
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setTerritoryFilter('All Territories');
    setStateFilter('All States');
    setCityFilter('All Cities');
    setResourceFilter('All Resources');
  };

  // Filter statuses based on selected filters
  let filteredStatuses = [...statuses];
  
  if (territoryFilter !== 'All Territories') {
    filteredStatuses = filteredStatuses.filter(s => s.user_territory === territoryFilter);
  }
  
  if (stateFilter !== 'All States') {
    filteredStatuses = filteredStatuses.filter(s => s.user_state === stateFilter);
  }
  
  if (cityFilter !== 'All Cities') {
    filteredStatuses = filteredStatuses.filter(s => s.user_city === cityFilter);
  }
  
  if (resourceFilter !== 'All Resources') {
    filteredStatuses = filteredStatuses.filter(s => s.user_name === resourceFilter);
  }

  // Get unique resources for dropdown
  const resourceOptions = ['All Resources', ...allUsers.map(u => u.name).filter(Boolean).sort()];

  const submittedCount = filteredStatuses.length;
  const dateLabel = selectedDate === today ? 'Today' : 
                    selectedDate === yesterday ? 'Yesterday' : 
                    format(new Date(selectedDate), 'EEEE, MMM d');

  return (
    <div className="space-y-6" data-testid="status-summary-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold flex items-center gap-3">
          <Users className="h-8 w-8 text-primary" />
          Status Summary
        </h1>
        <p className="text-muted-foreground mt-1">View daily status updates from your team</p>
      </div>

      {/* Date Selection & Filters */}
      <Card className="p-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Date Selection */}
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-2 block">Select Date</label>
            <div className="flex gap-2">
              <Button
                variant={selectedDate === yesterday ? 'default' : 'outline'}
                onClick={() => setSelectedDate(yesterday)}
                className="flex-1"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Yesterday
              </Button>
              <Button
                variant={selectedDate === today ? 'default' : 'outline'}
                onClick={() => setSelectedDate(today)}
                className="flex-1"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Today
              </Button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={today}
                className="flex-1 px-3 rounded-md border border-input bg-background text-sm"
                data-testid="date-picker"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-2 block">Territory</label>
              <Select value={territoryFilter} onValueChange={(v) => {
                setTerritoryFilter(v);
                setStateFilter('All States');
                setCityFilter('All Cities');
              }}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TERRITORIES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-2 block">State</label>
              <Select value={stateFilter} onValueChange={(v) => {
                setStateFilter(v);
                setCityFilter('All Cities');
              }} disabled={territoryFilter === 'All Territories'}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableStates.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-2 block">City</label>
              <Select value={cityFilter} onValueChange={setCityFilter} disabled={stateFilter === 'All States'}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCities.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-2 block">Resource</label>
              <Select value={resourceFilter} onValueChange={setResourceFilter}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {resourceOptions.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Reset Filters */}
        {(territoryFilter !== 'All Territories' || stateFilter !== 'All States' || 
          cityFilter !== 'All Cities' || resourceFilter !== 'All Resources') && (
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={handleResetFilters}>
              Reset Filters
            </Button>
          </div>
        )}
      </Card>

      {/* Summary Stats */}
      <div className="flex items-center gap-4">
        <p className="text-lg font-medium">
          {dateLabel}: <span className="text-primary">{submittedCount}</span> status update{submittedCount !== 1 ? 's' : ''} submitted
        </p>
      </div>

      {/* Status Cards */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredStatuses.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-muted-foreground">No status updates found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {selectedDate === today 
              ? 'Team members have not posted their status for today yet' 
              : `No updates were posted for ${format(new Date(selectedDate), 'MMMM d, yyyy')}`}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredStatuses.map((status) => (
            <Card key={status.id} className="p-5" data-testid={`status-card-${status.user_id}`}>
              {/* User Header */}
              <div className="flex items-start justify-between mb-4 pb-3 border-b">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-base">{status.user_name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{status.user_role || 'Team Member'}</span>
                      {status.user_city && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {status.user_city}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Posted {format(new Date(status.created_at), 'h:mm a')}
                </p>
              </div>

              {/* Status Content */}
              <div className="space-y-4">
                {status.yesterday_updates && (
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground mb-2">
                      {selectedDate === today ? "Today's Updates" : "Updates"}
                    </p>
                    <BulletedContent text={status.yesterday_updates} />
                  </div>
                )}

                {status.today_actions && (
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground mb-2">
                      {selectedDate === today ? "Tomorrow's Action Items" : "Action Items"}
                    </p>
                    <BulletedContent text={status.today_actions} />
                  </div>
                )}

                {status.help_needed && (
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground mb-2">Help Needed</p>
                    <BulletedContent text={status.help_needed} />
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
