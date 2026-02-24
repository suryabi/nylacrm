import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Search, MapPin, Star, DollarSign, Building2, Phone, Mail, Download, RefreshCw } from 'lucide-react';
import { leadsAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useMasterLocations } from '../hooks/useMasterLocations';

// Demo data - will be replaced with Google Places API
const DEMO_OUTLETS = [
  { id: 1, name: 'The Leela Palace', type: 'Star Hotel', address: 'MG Road, Bengaluru 560001', phone: '+91 80 2521 1234', rating: 4.8, price_range: '₹₹₹₹₹', pincode: '560001', distance: 0.5 },
  { id: 2, name: 'Taj West End', type: 'Star Hotel', address: 'Race Course Road, Bengaluru 560001', phone: '+91 80 6660 5660', rating: 4.7, price_range: '₹₹₹₹₹', pincode: '560001', distance: 1.2 },
  { id: 3, name: 'Koshy\'s Restaurant', type: 'Restaurant', address: 'St. Marks Road, Bengaluru 560001', phone: '+91 80 2221 3793', rating: 4.3, price_range: '₹₹', pincode: '560001', distance: 0.8 },
  { id: 4, name: 'Blue Frog Lounge', type: 'Bar & Kitchen', address: 'Church Street, Bengaluru 560001', phone: '+91 80 4178 0877', rating: 4.4, price_range: '₹₹₹', pincode: '560001', distance: 1.5 },
  { id: 5, name: 'Café Coffee Day Premium', type: 'Cafe', address: 'Brigade Road, Bengaluru 560001', phone: '+91 80 4112 7890', rating: 4.2, price_range: '₹₹', pincode: '560001', distance: 1.0 },
  { id: 6, name: 'The Oberoi', type: 'Star Hotel', address: 'MG Road, Bengaluru 560001', phone: '+91 80 2558 5858', rating: 4.9, price_range: '₹₹₹₹₹', pincode: '560001', distance: 0.7 },
  { id: 7, name: 'Truffles Cafe', type: 'Cafe', address: 'Koramangala, Bengaluru 560034', phone: '+91 80 4112 4561', rating: 4.5, price_range: '₹₹', pincode: '560034', distance: 3.2 },
  { id: 8, name: 'ITC Gardenia', type: 'Star Hotel', address: 'Residency Road, Bengaluru 560025', phone: '+91 80 4952 1234', rating: 4.7, price_range: '₹₹₹₹₹', pincode: '560025', distance: 2.1 },
];

const OUTLET_TYPES = [
  'Star Hotel',
  'Restaurant',
  'Bar & Kitchen',
  'Cafe',
  'Event Caterer',
  'Premium Club',
  'Wellness Center',
  'Jewellery Stores'
];

export default function LeadDiscovery() {
  const { user, token } = useAuth();
  const [searchMode, setSearchMode] = React.useState('location'); // 'location' or 'outlet_name'
  const [selectedCity, setSelectedCity] = React.useState('');
  const [locationName, setLocationName] = React.useState('');
  const [outletName, setOutletName] = React.useState('');
  const [locationSuggestions, setLocationSuggestions] = React.useState([]);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [selectedLocation, setSelectedLocation] = React.useState(null);
  const [radius, setRadius] = React.useState(5);
  const [selectedTypes, setSelectedTypes] = React.useState([]);
  const [minRating, setMinRating] = React.useState(4.0);
  const [priceRange, setPriceRange] = React.useState('all');
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState([]);
  const [selectedOutlets, setSelectedOutlets] = React.useState([]);
  const [existingLeads, setExistingLeads] = React.useState([]);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [itemsPerPage] = React.useState(10);
  
  // Master locations from API
  const { territories, states, cities } = useMasterLocations();
  
  // Helper to find state and territory for a city
  const getLocationInfoForCity = (cityName) => {
    const cityObj = cities.find(c => c.name === cityName);
    if (!cityObj) return { state: 'Unknown', territory: 'Unknown' };
    
    const stateObj = states.find(s => s.id === cityObj.state_id);
    if (!stateObj) return { state: 'Unknown', territory: 'Unknown' };
    
    const territoryObj = territories.find(t => t.id === stateObj.territory_id);
    return {
      state: stateObj.name,
      territory: territoryObj?.name || 'Unknown'
    };
  };

  // Debounced autocomplete
  React.useEffect(() => {
    // Don't fetch if location already selected
    if (selectedLocation) {
      return;
    }
    
    if (locationName.length >= 3 && selectedCity) {
      const timer = setTimeout(() => {
        fetchLocationSuggestions();
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setLocationSuggestions([]);
      setShowSuggestions(false);
    }
  }, [locationName, selectedCity, selectedLocation]);

  const fetchLocationSuggestions = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        process.env.REACT_APP_BACKEND_URL + '/api/lead-discovery/autocomplete',
        {
          input: locationName,
          city: selectedCity
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      setLocationSuggestions(res.data.predictions || []);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Autocomplete error:', error);
    }
  };

  const selectSuggestion = (suggestion) => {
    setLocationName(suggestion.description);
    setSelectedLocation(suggestion);
    setShowSuggestions(false);
    setLocationSuggestions([]); // Clear suggestions
  };

  const handleSearch = async () => {
    setSearching(true);
    setCurrentPage(1);
    
    try {
      const token = localStorage.getItem('token');
      
      // Fetch existing leads for duplicate check - use large page_size
      const leadsRes = await axios.get(process.env.REACT_APP_BACKEND_URL + '/api/leads?page=1&page_size=100', {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      // Extract data from paginated response
      setExistingLeads(leadsRes.data.data || []);
      
      // Call Google Places API via backend
      const searchRes = await axios.post(
        process.env.REACT_APP_BACKEND_URL + '/api/lead-discovery/search',
        searchMode === 'outlet_name' 
          ? {
              outlet_name: outletName,
              city: selectedCity
            }
          : {
              location_name: selectedLocation ? selectedLocation.description : locationName,
              radius: radius,
              types: selectedTypes,
              min_rating: minRating,
              price_range: priceRange
            },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      
      // Transform Google Places results to match our outlet format
      const transformedResults = searchRes.data.results.map((place, idx) => ({
        id: place.place_id || idx,
        name: place.name,
        type: selectedTypes[0] || 'Restaurant',
        address: place.address,
        phone: place.phone,
        rating: place.rating,
        price_range: place.price_level,
        distance: 0,
        place_id: place.place_id
      }));
      
      setResults(transformedResults);
      toast.success(`Found ${transformedResults.length} real outlets!`, {
        duration: 4000
      });
    } catch (error) {
      console.error('Search error:', error);
      toast.error(error.response?.data?.detail || 'Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const getExistingLead = (outlet) => {
    return existingLeads.find(lead => 
      lead.company?.toLowerCase() === outlet.name?.toLowerCase() ||
      (lead.phone && outlet.phone && lead.phone === outlet.phone)
    );
  };

  const isAlreadyImported = (outlet) => {
    return !!getExistingLead(outlet);
  };

  const toggleOutletSelection = (outletId) => {
    if (selectedOutlets.includes(outletId)) {
      setSelectedOutlets(selectedOutlets.filter(id => id !== outletId));
    } else {
      setSelectedOutlets([...selectedOutlets, outletId]);
    }
  };

  // Helper function to retry failed requests
  const retryRequest = async (fn, retries = 2, delay = 1000) => {
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries) throw error;
        // Only retry on 5xx errors or network issues
        if (error.response?.status >= 500 || !error.response) {
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
  };

  const handleImport = async (forceReimport = false) => {
    if (selectedOutlets.length === 0) {
      toast.error('Please select at least one outlet to import');
      return;
    }
    
    // Use user from AuthContext - no need to make another API call
    if (!user || !user.id) {
      toast.error('Session expired. Please login again.');
      return;
    }
    
    try {
      const outletsToImport = results.filter(o => selectedOutlets.includes(o.id));
      
      let successCount = 0;
      let updateCount = 0;
      let failCount = 0;
      const errors = [];
      
      // Import each outlet as a lead
      for (const outlet of outletsToImport) {
        try {
          // Extract city info from selected city
          const cityStateMap = {
            'Bengaluru': { state: 'Karnataka', territory: 'South India' },
            'Chennai': { state: 'Tamil Nadu', territory: 'South India' },
            'Hyderabad': { state: 'Telangana', territory: 'South India' },
            'Mumbai': { state: 'Maharashtra', territory: 'West India' },
            'Pune': { state: 'Maharashtra', territory: 'West India' },
            'Delhi': { state: 'Delhi', territory: 'North India' },
            'Kolkata': { state: 'West Bengal', territory: 'East India' },
            'Ahmedabad': { state: 'Gujarat', territory: 'West India' }
          };
          
          const locationInfo = cityStateMap[selectedCity] || { state: 'Unknown', territory: 'Unknown' };
          
          // Calculate tier safely
          const priceStr = outlet.price_range || '';
          const priceLen = typeof priceStr === 'string' ? priceStr.length : 0;
          const tier = priceLen >= 4 ? 'Tier 1' : priceLen >= 3 ? 'Tier 2' : 'Tier 3';
          
          const leadData = {
            company: outlet.name,
            contact_person: null,
            email: null,
            phone: outlet.phone || null,
            category: outlet.type || 'Restaurant',
            tier: tier,
            city: selectedCity,
            state: locationInfo.state,
            country: 'India',
            region: locationInfo.territory,
            status: 'new',
            source: 'Lead Discovery',
            assigned_to: user.id,
            priority: (outlet.rating || 0) >= 4.5 ? 'high' : 'medium',
            current_water_brand: null,
            current_landing_price: null,
            current_volume: null,
            current_selling_price: null,
            interested_skus: [],
            notes: `Discovered via Lead Discovery. Rating: ${outlet.rating || 'N/A'}★, Price: ${outlet.price_range || 'N/A'}. Address: ${outlet.address || 'N/A'}`,
            estimated_value: priceLen * 100000 || 100000
          };
          
          // Check if lead exists and we're doing a re-import
          const existingLead = getExistingLead(outlet);
          
          if (existingLead && forceReimport) {
            // Update existing lead with retry using leadsAPI
            await retryRequest(() => leadsAPI.update(existingLead.id, leadData));
            updateCount++;
          } else if (!existingLead) {
            // Create new lead with retry using leadsAPI
            await retryRequest(() => leadsAPI.create(leadData));
            successCount++;
          } else {
            // Skip - already exists and not forcing re-import
            continue;
          }
        } catch (err) {
          console.error(`Failed to import ${outlet.name}:`, err.response?.data || err);
          failCount++;
          errors.push(`${outlet.name}: ${err.response?.data?.detail || err.message}`);
        }
      }
      
      // Show appropriate message
      if (successCount > 0 || updateCount > 0) {
        let message = '';
        if (successCount > 0) message += `✓ ${successCount} new leads imported. `;
        if (updateCount > 0) message += `✓ ${updateCount} leads updated. `;
        toast.success(message.trim(), { duration: 5000 });
        
        // Refresh existing leads list using leadsAPI
        try {
          const leadsRes = await leadsAPI.getAll({ pageSize: 100 });
          setExistingLeads(leadsRes.data.data || []);
        } catch (refreshErr) {
          console.error('Failed to refresh leads list:', refreshErr);
        }
      }
      
      if (failCount > 0) {
        toast.error(`${failCount} imports failed. Check console for details.`, { duration: 5000 });
        console.error('Import errors:', errors);
      }
      
      if (successCount === 0 && updateCount === 0 && failCount === 0) {
        toast.info('All selected outlets were already imported. Use "Re-import" to update them.');
      }
      
      setSelectedOutlets([]);
    } catch (error) {
      console.error('Import error:', error);
      console.error('Error response:', error.response?.data);
      
      let errorMsg = 'Failed to import leads';
      
      // Handle specific error codes
      if (error.response?.status === 520) {
        errorMsg = 'Server temporarily unavailable. Please wait a moment and try again.';
      } else if (error.response?.status === 401) {
        errorMsg = 'Session expired. Please login again.';
      } else if (error.code === 'ECONNABORTED') {
        errorMsg = 'Request timed out. Please try again.';
      } else if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorMsg = error.response.data.detail.map(e => `${e.loc?.join('.')}: ${e.msg}`).join(', ');
        } else {
          errorMsg = error.response.data.detail;
        }
      }
      
      toast.error(errorMsg);
    }
  };

  const toggleType = (type) => {
    if (selectedTypes.includes(type)) {
      setSelectedTypes(selectedTypes.filter(t => t !== type));
    } else {
      setSelectedTypes([...selectedTypes, type]);
    }
  };

  // Pagination
  const totalPages = Math.ceil(results.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentResults = results.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-light mb-2">Lead Discovery</h1>
        <p className="text-muted-foreground">Discover potential customers in your area</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Search Criteria */}
        <Card className="p-6 border rounded-2xl lg:col-span-1">
          <h2 className="text-lg font-semibold mb-6">Search Criteria</h2>
          
          <div className="space-y-5">
            <div>
              <Label className="mb-3 block">Search Mode</Label>
              <div className="flex gap-2 bg-secondary p-1 rounded-full">
                <Button
                  type="button"
                  variant={searchMode === 'location' ? 'default' : 'ghost'}
                  onClick={() => setSearchMode('location')}
                  size="sm"
                  className="rounded-full flex-1"
                >
                  By Area
                </Button>
                <Button
                  type="button"
                  variant={searchMode === 'outlet_name' ? 'default' : 'ghost'}
                  onClick={() => setSearchMode('outlet_name')}
                  size="sm"
                  className="rounded-full flex-1"
                >
                  By Outlet Name
                </Button>
              </div>
            </div>

            <div>
              <Label>Select City *</Label>
              <select
                value={selectedCity}
                onChange={e => {
                  setSelectedCity(e.target.value);
                  setLocationName('');
                  setOutletName('');
                  setSelectedLocation(null);
                }}
                className="w-full h-12 px-4 rounded-xl border bg-background"
              >
                <option value="">Choose a city...</option>
                <option value="Bengaluru">Bengaluru</option>
                <option value="Chennai">Chennai</option>
                <option value="Hyderabad">Hyderabad</option>
                <option value="Mumbai">Mumbai</option>
                <option value="Pune">Pune</option>
                <option value="Delhi">Delhi</option>
                <option value="Kolkata">Kolkata</option>
                <option value="Ahmedabad">Ahmedabad</option>
              </select>
            </div>

            {searchMode === 'location' ? (
              // Location Area Search
              selectedCity && (
              <div className="relative">
                <Label>Location/Area Name *</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    value={locationName}
                    onChange={e => {
                      setLocationName(e.target.value);
                      setSelectedLocation(null); // Clear selection when typing new text
                    }}
                    onFocus={() => {
                      if (locationSuggestions.length > 0 && !selectedLocation) {
                        setShowSuggestions(true);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowSuggestions(false), 200);
                    }}
                    placeholder="e.g., Jubilee Hills, MG Road, Koramangala"
                    className="pl-10 h-12"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Start typing area name in {selectedCity}
                </p>

                {/* Autocomplete Suggestions */}
                {showSuggestions && locationSuggestions.length > 0 && (
                  <Card className="absolute z-50 w-full mt-1 max-h-64 overflow-y-auto border-2 border-primary/30">
                    {locationSuggestions.map((suggestion, idx) => (
                      <div
                        key={idx}
                        onClick={() => selectSuggestion(suggestion)}
                        className="p-3 hover:bg-secondary cursor-pointer border-b last:border-0"
                      >
                        <p className="font-medium text-sm">{suggestion.description}</p>
                        <p className="text-xs text-muted-foreground">{suggestion.structured_formatting?.secondary_text}</p>
                      </div>
                    ))}
                  </Card>
                )}
              </div>
            )
            ) : (
              // Direct Outlet Name Search
              selectedCity && (
                <div>
                  <Label>Outlet Name *</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      value={outletName}
                      onChange={e => setOutletName(e.target.value)}
                      placeholder="e.g., Taj Hotel, ITC Gardenia, Cafe Coffee Day"
                      className="pl-10 h-12"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter exact outlet name - ignores radius and filters
                  </p>
                </div>
              )
            )}

            {searchMode === 'location' && (
              // Only show filters for area search
              <>
            <div>
              <Label>Radius: {radius} km</Label>
              <input
                type="range"
                min="1"
                max="20"
                value={radius}
                onChange={e => setRadius(parseInt(e.target.value))}
                className="w-full h-3 bg-secondary rounded-lg appearance-none cursor-pointer"
                style={{
                  WebkitAppearance: 'none',
                  background: `linear-gradient(to right, hsl(155, 35%, 42%) 0%, hsl(155, 35%, 42%) ${(radius - 1) / 19 * 100}%, hsl(35, 15%, 88%) ${(radius - 1) / 19 * 100}%, hsl(35, 15%, 88%) 100%)`
                }}
              />
              <style>{`
                input[type="range"]::-webkit-slider-thumb {
                  appearance: none;
                  width: 24px;
                  height: 24px;
                  border-radius: 50%;
                  background: hsl(155, 35%, 42%);
                  cursor: pointer;
                  border: 3px solid white;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
                input[type="range"]::-moz-range-thumb {
                  width: 24px;
                  height: 24px;
                  border-radius: 50%;
                  background: hsl(155, 35%, 42%);
                  cursor: pointer;
                  border: 3px solid white;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
              `}</style>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>1 km</span>
                <span>20 km</span>
              </div>
            </div>

            <div>
              <Label className="mb-3 block">Outlet Types</Label>
              <div className="space-y-2">
                {OUTLET_TYPES.map(type => (
                  <div key={type} className="flex items-center space-x-2">
                    <Checkbox
                      id={type}
                      checked={selectedTypes.includes(type)}
                      onCheckedChange={() => toggleType(type)}
                    />
                    <label htmlFor={type} className="text-sm cursor-pointer">
                      {type}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Minimum Rating: {minRating} ★</Label>
              <input
                type="range"
                min="3.0"
                max="5.0"
                step="0.1"
                value={minRating}
                onChange={e => setMinRating(parseFloat(e.target.value))}
                className="w-full h-3 bg-secondary rounded-lg appearance-none cursor-pointer"
                style={{
                  WebkitAppearance: 'none',
                  background: `linear-gradient(to right, hsl(42, 85%, 65%) 0%, hsl(42, 85%, 65%) ${(minRating - 3) / 2 * 100}%, hsl(35, 15%, 88%) ${(minRating - 3) / 2 * 100}%, hsl(35, 15%, 88%) 100%)`
                }}
              />
              <style>{`
                input[type="range"]::-webkit-slider-thumb {
                  appearance: none;
                  width: 24px;
                  height: 24px;
                  border-radius: 50%;
                  background: hsl(42, 85%, 65%);
                  cursor: pointer;
                  border: 3px solid white;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
                input[type="range"]::-moz-range-thumb {
                  width: 24px;
                  height: 24px;
                  border-radius: 50%;
                  background: hsl(42, 85%, 65%);
                  cursor: pointer;
                  border: 3px solid white;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
              `}</style>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>3.0 ★</span>
                <span>5.0 ★</span>
              </div>
            </div>

            <div>
              <Label>Price Range</Label>
              <select
                value={priceRange}
                onChange={e => setPriceRange(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border bg-background"
              >
                <option value="all">All Price Ranges</option>
                <option value="budget">Budget (₹₹)</option>
                <option value="mid">Mid Range (₹₹₹)</option>
                <option value="premium">Premium (₹₹₹₹₹)</option>
              </select>
            </div>
              </>
            )}

            <Button
              onClick={handleSearch}
              disabled={searching || !selectedCity || (searchMode === 'location' && !locationName) || (searchMode === 'outlet_name' && !outletName)}
              className="w-full h-14 rounded-full text-base"
            >
              {searching ? (
                <>Searching...</>
              ) : (
                <><Search className="h-5 w-5 mr-2" />Search Outlets</>
              )}
            </Button>
          </div>
        </Card>

        {/* Results */}
        <Card className="p-6 border rounded-2xl lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold">
              Search Results {results.length > 0 && `(${results.length})`}
            </h2>
            {selectedOutlets.length > 0 && (
              <div className="flex gap-2">
                <Button onClick={() => handleImport(false)} className="rounded-full">
                  <Download className="h-4 w-4 mr-2" />
                  Import New ({selectedOutlets.length})
                </Button>
                <Button onClick={() => handleImport(true)} variant="outline" className="rounded-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-import All ({selectedOutlets.length})
                </Button>
              </div>
            )}
          </div>

          {results.length === 0 ? (
            <div className="text-center py-16">
              <Search className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">No results yet</p>
              <p className="text-sm text-muted-foreground">
                Enter pin code and click Search to discover outlets
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  Showing {startIndex + 1}-{Math.min(endIndex, results.length)} of {results.length} results
                </p>
                {selectedOutlets.length > 0 && (
                  <p className="text-sm font-medium text-primary">
                    {selectedOutlets.length} selected
                  </p>
                )}
              </div>

              <div className="space-y-3 mb-6">
                {currentResults.map(outlet => {
                const alreadyImported = isAlreadyImported(outlet);
                
                return (
                  <Card
                    key={outlet.id}
                    className={`p-4 border-2 rounded-xl transition-all cursor-pointer ${
                      alreadyImported && !selectedOutlets.includes(outlet.id)
                        ? 'border-green-300 bg-green-50'
                        : selectedOutlets.includes(outlet.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => toggleOutletSelection(outlet.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-start gap-3 mb-2">
                          <Checkbox
                            checked={selectedOutlets.includes(outlet.id)}
                            onCheckedChange={() => toggleOutletSelection(outlet.id)}
                            onClick={e => e.stopPropagation()}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-lg">{outlet.name}</h3>
                              {alreadyImported && (
                                <Badge className="bg-green-600 text-white">Already Imported</Badge>
                              )}
                            </div>
                            <Badge variant="outline" className="mt-1">{outlet.type}</Badge>
                          </div>
                        </div>
                      
                      <div className="ml-10 space-y-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {outlet.address} ({outlet.distance} km away)
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          {outlet.phone}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="flex items-center gap-1 text-amber-600 font-semibold mb-2">
                        <Star className="h-4 w-4 fill-current" />
                        {outlet.rating}
                      </div>
                      <p className="text-sm text-muted-foreground">{outlet.price_range}</p>
                    </div>
                  </div>
                </Card>
              );
              })}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="rounded-full"
                  >
                    Previous
                  </Button>
                  
                  <div className="flex items-center gap-2">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? 'default' : 'outline'}
                          onClick={() => setCurrentPage(pageNum)}
                          className="rounded-full w-10 h-10 p-0"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="rounded-full"
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Info Banner */}
      <Card className="p-6 bg-green-50 border-green-200 rounded-2xl">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
            <MapPin className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-green-800 mb-2">✓ Google Places API Integrated</h3>
            <p className="text-sm text-green-700">
              Lead Discovery is now powered by Google Places API with real-time data. 
              Search any pin code in India to discover actual outlets with verified information including 
              ratings, phone numbers, and addresses. Results are live from Google's database.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
