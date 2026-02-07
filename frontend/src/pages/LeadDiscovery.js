import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Search, MapPin, Star, DollarSign, Building2, Phone, Mail, Download } from 'lucide-react';

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
  'Wellness Center'
];

export default function LeadDiscovery() {
  const [pincode, setPincode] = React.useState('');
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

  const handleSearch = async () => {
    setSearching(true);
    setCurrentPage(1); // Reset to first page on new search
    
    try {
      // Fetch existing leads to check for duplicates
      const token = localStorage.getItem('token');
      const leadsRes = await axios.get(process.env.REACT_APP_BACKEND_URL + '/api/leads?limit=1000', {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setExistingLeads(leadsRes.data);
      
      // Simulate API call with demo data
      setTimeout(() => {
        let filtered = DEMO_OUTLETS;
        
        // Filter by types
        if (selectedTypes.length > 0) {
          filtered = filtered.filter(o => selectedTypes.includes(o.type));
        }
        
        // Filter by rating
        filtered = filtered.filter(o => o.rating >= minRating);
        
        // Filter by price range
        if (priceRange !== 'all') {
          const priceMap = { 'budget': 2, 'mid': 3, 'premium': 5 };
          filtered = filtered.filter(o => o.price_range.length >= priceMap[priceRange]);
        }
        
        // Filter by radius
        filtered = filtered.filter(o => o.distance <= radius);
        
        setResults(filtered);
        setSearching(false);
        toast.success(`Found ${filtered.length} outlets matching your criteria`);
      }, 1500);
    } catch (error) {
      setSearching(false);
      toast.error('Failed to search. Please try again.');
    }
  };

  const isAlreadyImported = (outlet) => {
    return existingLeads.some(lead => 
      lead.company?.toLowerCase() === outlet.name?.toLowerCase() ||
      (lead.phone && outlet.phone && lead.phone === outlet.phone)
    );
  };

  const toggleOutletSelection = (outletId) => {
    if (selectedOutlets.includes(outletId)) {
      setSelectedOutlets(selectedOutlets.filter(id => id !== outletId));
    } else {
      setSelectedOutlets([...selectedOutlets, outletId]);
    }
  };

  const handleImport = async () => {
    if (selectedOutlets.length === 0) {
      toast.error('Please select at least one outlet to import');
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      
      // Get current user to assign leads
      const userRes = await axios.get(process.env.REACT_APP_BACKEND_URL + '/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      
      const currentUser = userRes.data;
      const outletsToImport = results.filter(o => selectedOutlets.includes(o.id));
      
      // Import each outlet as a lead
      for (const outlet of outletsToImport) {
        const leadData = {
          company: outlet.name,
          contact_person: null,  // null instead of empty string
          email: null,  // null instead of empty string for EmailStr validation
          phone: outlet.phone || null,
          category: outlet.type,
          tier: outlet.price_range.length >= 4 ? 'Tier 1' : outlet.price_range.length >= 3 ? 'Tier 2' : 'Tier 3',
          city: 'Bengaluru',
          state: 'Karnataka',
          country: 'India',
          region: 'South India',
          status: 'new',
          source: 'Lead Discovery',  // Match exact dropdown option
          assigned_to: currentUser.id,
          priority: outlet.rating >= 4.5 ? 'high' : 'medium',
          current_water_brand: null,
          current_landing_price: null,
          current_volume: null,
          current_selling_price: null,
          interested_skus: [],
          notes: `Discovered via Lead Discovery. Rating: ${outlet.rating}★, Price: ${outlet.price_range}. Address: ${outlet.address}`,
          estimated_value: outlet.price_range.length * 100000
        };

        await axios.post(process.env.REACT_APP_BACKEND_URL + '/api/leads', leadData, {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        });
      }
      
      toast.success(`✓ ${selectedOutlets.length} outlets imported as new leads! Check Leads page.`, {
        duration: 5000
      });
      setSelectedOutlets([]);
    } catch (error) {
      console.error('Import error:', error);
      console.error('Error response:', error.response?.data);
      
      let errorMsg = 'Failed to import leads';
      
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          // Pydantic validation errors
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
              <Label>Pin Code *</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  value={pincode}
                  onChange={e => setPincode(e.target.value)}
                  placeholder="560001"
                  className="pl-10 h-12"
                />
              </div>
            </div>

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

            <Button
              onClick={handleSearch}
              disabled={searching || !pincode}
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
              <Button onClick={handleImport} className="rounded-full">
                <Download className="h-4 w-4 mr-2" />
                Import {selectedOutlets.length} Selected
              </Button>
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
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {results.map(outlet => {
                const alreadyImported = isAlreadyImported(outlet);
                
                return (
                  <Card
                    key={outlet.id}
                    className={`p-4 border-2 rounded-xl transition-all ${
                      alreadyImported
                        ? 'border-green-300 bg-green-50 opacity-60'
                        : selectedOutlets.includes(outlet.id)
                        ? 'border-primary bg-primary/5 cursor-pointer'
                        : 'border-border hover:border-primary/50 cursor-pointer'
                    }`}
                    onClick={() => !alreadyImported && toggleOutletSelection(outlet.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-start gap-3 mb-2">
                          <Checkbox
                            checked={selectedOutlets.includes(outlet.id)}
                            onCheckedChange={() => toggleOutletSelection(outlet.id)}
                            onClick={e => e.stopPropagation()}
                            disabled={alreadyImported}
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
          )}
        </Card>
      </div>

      {/* Info Banner */}
      <Card className="p-6 bg-primary/5 border-primary/20 rounded-2xl">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <MapPin className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold mb-2">Currently using Demo Data</h3>
            <p className="text-sm text-muted-foreground">
              This module is ready to integrate with Google Maps Places API. 
              Once you enable billing and provide an API key, it will search real outlets in real-time.
              For now, you're seeing sample data from Bengaluru to test the workflow.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
