import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { 
  MapPin, Plus, Edit2, Trash2, ChevronRight, ChevronDown, 
  Globe, Building, Home, Loader2, Search
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function MasterLocations() {
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const [flatData, setFlatData] = useState({ territories: [], states: [], cities: [] });
  const [expandedTerritories, setExpandedTerritories] = useState({});
  const [expandedStates, setExpandedStates] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState(''); // 'territory', 'state', 'city'
  const [dialogMode, setDialogMode] = useState('add'); // 'add', 'edit'
  const [editItem, setEditItem] = useState(null);
  
  // Form states
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formTerritoryId, setFormTerritoryId] = useState('');
  const [formStateId, setFormStateId] = useState('');

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [hierarchicalRes, flatRes] = await Promise.all([
        axios.get(`${API_URL}/master-locations`, { headers }),
        axios.get(`${API_URL}/master-locations/flat`, { headers })
      ]);
      
      setLocations(hierarchicalRes.data);
      setFlatData(flatRes.data);
    } catch (error) {
      toast.error('Failed to load locations');
    } finally {
      setLoading(false);
    }
  };

  const toggleTerritory = (territoryId) => {
    setExpandedTerritories(prev => ({
      ...prev,
      [territoryId]: !prev[territoryId]
    }));
  };

  const toggleState = (stateId) => {
    setExpandedStates(prev => ({
      ...prev,
      [stateId]: !prev[stateId]
    }));
  };

  const openAddDialog = (type, parentId = null) => {
    setDialogType(type);
    setDialogMode('add');
    setEditItem(null);
    setFormName('');
    setFormCode('');
    setFormTerritoryId(parentId || '');
    setFormStateId(parentId || '');
    setDialogOpen(true);
  };

  const openEditDialog = (type, item) => {
    setDialogType(type);
    setDialogMode('edit');
    setEditItem(item);
    setFormName(item.name);
    setFormCode(item.code);
    setFormTerritoryId(item.territory_id || '');
    setFormStateId(item.state_id || '');
    setDialogOpen(true);
  };

  const generateCode = (name) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  };

  const handleNameChange = (value) => {
    setFormName(value);
    if (dialogMode === 'add') {
      setFormCode(generateCode(value));
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Name is required');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      let endpoint = '';
      let data = {};
      
      if (dialogType === 'territory') {
        endpoint = '/master-locations/territories';
        data = { name: formName, code: formCode || generateCode(formName) };
      } else if (dialogType === 'state') {
        if (!formTerritoryId) {
          toast.error('Please select a territory');
          return;
        }
        endpoint = '/master-locations/states';
        data = { name: formName, code: formCode || generateCode(formName), territory_id: formTerritoryId };
      } else if (dialogType === 'city') {
        if (!formStateId) {
          toast.error('Please select a state');
          return;
        }
        endpoint = '/master-locations/cities';
        data = { name: formName, code: formCode || generateCode(formName), state_id: formStateId };
      }
      
      if (dialogMode === 'edit' && editItem) {
        await axios.put(`${API_URL}${endpoint}/${editItem.id}`, data, { headers });
        toast.success(`${dialogType.charAt(0).toUpperCase() + dialogType.slice(1)} updated`);
      } else {
        await axios.post(`${API_URL}${endpoint}`, data, { headers });
        toast.success(`${dialogType.charAt(0).toUpperCase() + dialogType.slice(1)} added`);
      }
      
      setDialogOpen(false);
      fetchLocations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save');
    }
  };

  const handleDelete = async (type, id) => {
    if (!window.confirm(`Are you sure you want to delete this ${type}?`)) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      let endpoint = '';
      if (type === 'territory') endpoint = `/master-locations/territories/${id}`;
      else if (type === 'state') endpoint = `/master-locations/states/${id}`;
      else if (type === 'city') endpoint = `/master-locations/cities/${id}`;
      
      await axios.delete(`${API_URL}${endpoint}`, { headers });
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted`);
      fetchLocations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete');
    }
  };

  // Filter locations based on search
  const filteredLocations = locations.map(territory => {
    if (!searchQuery) return territory;
    
    const matchesTerritoryName = territory.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const filteredStates = territory.states.map(state => {
      const matchesStateName = state.name.toLowerCase().includes(searchQuery.toLowerCase());
      const filteredCities = state.cities.filter(city => 
        city.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      
      if (matchesStateName || filteredCities.length > 0) {
        return { ...state, cities: matchesStateName ? state.cities : filteredCities };
      }
      return null;
    }).filter(Boolean);
    
    if (matchesTerritoryName || filteredStates.length > 0) {
      return { ...territory, states: matchesTerritoryName ? territory.states : filteredStates };
    }
    return null;
  }).filter(Boolean);

  // Stats
  const stats = {
    territories: flatData.territories.length,
    states: flatData.states.length,
    cities: flatData.cities.length
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="relative"><div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" /><Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" /></div>
          <p className="text-muted-foreground text-sm mt-4 animate-pulse">Loading locations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="master-locations-page">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/50 dark:to-purple-900/30">
            <MapPin className="h-6 w-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Master Locations</h1>
            <p className="text-muted-foreground">Manage territories, states, and cities</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => openAddDialog('territory')} data-testid="add-territory-btn" className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-lg shadow-violet-200/50 dark:shadow-violet-900/30">
            <Plus className="h-4 w-4 mr-2" />
            Add Territory
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border-0 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/50">
              <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.territories}</p>
              <p className="text-sm text-muted-foreground">Territories</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-0 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/50">
              <Building className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{stats.states}</p>
              <p className="text-sm text-muted-foreground">States</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-0 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/20 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/50">
              <Home className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stats.cities}</p>
              <p className="text-sm text-muted-foreground">Cities</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search territories, states, or cities..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="search-locations"
        />
      </div>

      {/* Locations Tree */}
      <Card className="p-4">
        <div className="space-y-2">
          {filteredLocations.map(territory => (
            <div key={territory.id} className="border rounded-lg">
              {/* Territory Row */}
              <div 
                className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 cursor-pointer"
                onClick={() => toggleTerritory(territory.id)}
              >
                <div className="flex items-center gap-2">
                  {expandedTerritories[territory.id] ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Globe className="h-4 w-4 text-blue-600" />
                  <span className="font-semibold">{territory.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({territory.states?.length || 0} states)
                  </span>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => openAddDialog('state', territory.id)}
                    title="Add State"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => openEditDialog('territory', territory)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleDelete('territory', territory.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* States */}
              {expandedTerritories[territory.id] && territory.states?.map(state => (
                <div key={state.id} className="ml-6 border-l">
                  {/* State Row */}
                  <div 
                    className="flex items-center justify-between p-2 pl-4 hover:bg-slate-50 cursor-pointer"
                    onClick={() => toggleState(state.id)}
                  >
                    <div className="flex items-center gap-2">
                      {expandedStates[state.id] ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Building className="h-4 w-4 text-green-600" />
                      <span className="font-medium">{state.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({state.cities?.length || 0} cities)
                      </span>
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => openAddDialog('city', state.id)}
                        title="Add City"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => openEditDialog('state', state)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDelete('state', state.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Cities */}
                  {expandedStates[state.id] && (
                    <div className="ml-6 border-l py-1">
                      {state.cities?.map(city => (
                        <div 
                          key={city.id}
                          className="flex items-center justify-between p-2 pl-4 hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-2">
                            <Home className="h-3 w-3 text-purple-600" />
                            <span className="text-sm">{city.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => openEditDialog('city', city)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDelete('city', city.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {(!state.cities || state.cities.length === 0) && (
                        <p className="text-sm text-muted-foreground pl-4 py-2">No cities added yet</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
          
          {filteredLocations.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? 'No locations match your search' : 'No locations found'}
            </div>
          )}
        </div>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'edit' ? 'Edit' : 'Add'} {dialogType.charAt(0).toUpperCase() + dialogType.slice(1)}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={formName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={`Enter ${dialogType} name`}
                data-testid="location-name-input"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Code</label>
              <Input
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="Auto-generated from name"
                className="font-mono text-sm"
              />
            </div>
            
            {dialogType === 'state' && (
              <div>
                <label className="text-sm font-medium">Territory *</label>
                <Select value={formTerritoryId} onValueChange={setFormTerritoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select territory" />
                  </SelectTrigger>
                  <SelectContent>
                    {flatData.territories.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {dialogType === 'city' && (
              <div>
                <label className="text-sm font-medium">State *</label>
                <Select value={formStateId} onValueChange={setFormStateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {flatData.states.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.territory_name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} data-testid="save-location-btn">
              {dialogMode === 'edit' ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
