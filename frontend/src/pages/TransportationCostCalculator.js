import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  Truck, MapPin, Route, Fuel, Calculator, 
  Package, DollarSign, Navigation, RefreshCw,
  ChevronDown, Info
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

// Default values
const DEFAULTS = {
  mileageLoaded: 4.0,
  mileageEmpty: 5.0,
  dieselPrice: 100,
  crates: 600,
  bottles: 7200,
  driverExpenses: 1500,
  loadingUnloading: 1000,
  maintenanceProvision: 500,
};

const TRUCK_TYPES = [
  { value: 'eicher_20ft', label: 'New Eicher – 20 ft container', capacity: '6-8 tons' },
  { value: 'container_40ft', label: '40 ft container', capacity: '20-25 tons' },
];

export default function TransportationCostCalculator() {
  // Location states
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [fromCoords, setFromCoords] = useState(null);
  const [toCoords, setToCoords] = useState(null);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState('');
  const [tollCount, setTollCount] = useState(0);
  const [routeCalculated, setRouteCalculated] = useState(false);
  
  // Vehicle & Cost inputs
  const [truckType, setTruckType] = useState('eicher_20ft');
  const [mileageLoaded, setMileageLoaded] = useState(DEFAULTS.mileageLoaded);
  const [mileageEmpty, setMileageEmpty] = useState(DEFAULTS.mileageEmpty);
  const [dieselPrice, setDieselPrice] = useState(DEFAULTS.dieselPrice);
  const [crates, setCrates] = useState(DEFAULTS.crates);
  const [bottles, setBottles] = useState(DEFAULTS.bottles);
  const [driverExpenses, setDriverExpenses] = useState(DEFAULTS.driverExpenses);
  const [loadingUnloading, setLoadingUnloading] = useState(DEFAULTS.loadingUnloading);
  const [maintenanceProvision, setMaintenanceProvision] = useState(DEFAULTS.maintenanceProvision);
  
  // Refs
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const fromAutocompleteRef = useRef(null);
  const toAutocompleteRef = useRef(null);
  const fromInputRef = useRef(null);
  const toInputRef = useRef(null);
  
  // Load Google Maps Script
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      toast.error('Google Maps API key not configured');
      return;
    }
    
    // Check if script already loaded
    if (window.google && window.google.maps) {
      initializeMap();
      return;
    }
    
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry&callback=initGoogleMaps`;
    script.async = true;
    script.defer = true;
    
    window.initGoogleMaps = () => {
      initializeMap();
    };
    
    document.head.appendChild(script);
    
    return () => {
      delete window.initGoogleMaps;
    };
  }, []);
  
  const initializeMap = () => {
    if (!mapRef.current || !window.google) return;
    
    // Initialize map centered on India
    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 20.5937, lng: 78.9629 },
      zoom: 5,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });
    
    directionsServiceRef.current = new window.google.maps.DirectionsService();
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      map: mapInstanceRef.current,
      suppressMarkers: false,
      polylineOptions: {
        strokeColor: '#10B981',
        strokeWeight: 5,
      },
    });
    
    // Initialize autocomplete for From location
    if (fromInputRef.current) {
      fromAutocompleteRef.current = new window.google.maps.places.Autocomplete(fromInputRef.current, {
        componentRestrictions: { country: 'in' },
        fields: ['formatted_address', 'geometry', 'name'],
      });
      
      fromAutocompleteRef.current.addListener('place_changed', () => {
        const place = fromAutocompleteRef.current.getPlace();
        if (place.geometry) {
          setFromLocation(place.formatted_address || place.name);
          setFromCoords({
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          });
        }
      });
    }
    
    // Initialize autocomplete for To location
    if (toInputRef.current) {
      toAutocompleteRef.current = new window.google.maps.places.Autocomplete(toInputRef.current, {
        componentRestrictions: { country: 'in' },
        fields: ['formatted_address', 'geometry', 'name'],
      });
      
      toAutocompleteRef.current.addListener('place_changed', () => {
        const place = toAutocompleteRef.current.getPlace();
        if (place.geometry) {
          setToLocation(place.formatted_address || place.name);
          setToCoords({
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          });
        }
      });
    }
  };
  
  // Calculate route when both locations are set
  useEffect(() => {
    if (fromCoords && toCoords && directionsServiceRef.current) {
      calculateRoute();
    }
  }, [fromCoords, toCoords]);
  
  const calculateRoute = () => {
    if (!directionsServiceRef.current || !fromCoords || !toCoords) return;
    
    const request = {
      origin: fromCoords,
      destination: toCoords,
      travelMode: window.google.maps.TravelMode.DRIVING,
      avoidHighways: false,
      avoidTolls: false,
    };
    
    directionsServiceRef.current.route(request, (result, status) => {
      if (status === 'OK') {
        directionsRendererRef.current.setDirections(result);
        
        const route = result.routes[0];
        const leg = route.legs[0];
        
        // Distance in km (one way)
        const distanceKm = leg.distance.value / 1000;
        setDistance(Math.round(distanceKm * 10) / 10);
        setDuration(leg.duration.text);
        
        // Estimate toll count based on distance and route
        // This is an approximation since Google doesn't provide exact toll count
        const estimatedTolls = estimateTollCount(distanceKm, route);
        setTollCount(estimatedTolls);
        
        setRouteCalculated(true);
        toast.success('Route calculated successfully');
      } else {
        toast.error('Could not calculate route: ' + status);
      }
    });
  };
  
  // Estimate toll count based on distance and highway usage
  const estimateTollCount = (distanceKm, route) => {
    // Rough estimate: 1 toll every 60-80 km on highways in India
    // Check if route uses highways
    const summary = route.summary.toLowerCase();
    const usesHighway = summary.includes('nh') || summary.includes('highway') || 
                        summary.includes('expressway') || distanceKm > 100;
    
    if (!usesHighway || distanceKm < 50) return 0;
    
    // Estimate based on distance
    const avgTollInterval = 70; // km
    const estimatedTolls = Math.floor(distanceKm / avgTollInterval);
    
    return Math.max(1, estimatedTolls);
  };
  
  // Cost calculations
  const calculateCosts = useCallback(() => {
    if (distance === 0) {
      return {
        dieselForward: 0,
        dieselReturn: 0,
        totalDiesel: 0,
        tollsCost: 0,
        driverExp: driverExpenses,
        loadUnload: loadingUnloading,
        maintenance: maintenanceProvision,
        totalCost: 0,
        costPerCrate: 0,
        costPerBottle: 0,
      };
    }
    
    // Diesel calculations
    const dieselForward = (distance / mileageLoaded) * dieselPrice;
    const dieselReturn = (distance / mileageEmpty) * dieselPrice;
    const totalDiesel = dieselForward + dieselReturn;
    
    // Toll cost estimation (average ₹80-120 per toll in India)
    const avgTollCost = 100;
    const tollsCost = tollCount * avgTollCost * 2; // Round trip
    
    // Total cost
    const totalCost = totalDiesel + tollsCost + driverExpenses + loadingUnloading + maintenanceProvision;
    
    // Per unit costs
    const costPerCrate = crates > 0 ? totalCost / crates : 0;
    const costPerBottle = bottles > 0 ? totalCost / bottles : 0;
    
    return {
      dieselForward: Math.round(dieselForward),
      dieselReturn: Math.round(dieselReturn),
      totalDiesel: Math.round(totalDiesel),
      tollsCost: Math.round(tollsCost),
      driverExp: driverExpenses,
      loadUnload: loadingUnloading,
      maintenance: maintenanceProvision,
      totalCost: Math.round(totalCost),
      costPerCrate: Math.round(costPerCrate * 100) / 100,
      costPerBottle: Math.round(costPerBottle * 100) / 100,
    };
  }, [distance, mileageLoaded, mileageEmpty, dieselPrice, tollCount, driverExpenses, loadingUnloading, maintenanceProvision, crates, bottles]);
  
  const costs = calculateCosts();
  
  const resetCalculator = () => {
    setFromLocation('');
    setToLocation('');
    setFromCoords(null);
    setToCoords(null);
    setDistance(0);
    setDuration('');
    setTollCount(0);
    setRouteCalculated(false);
    setTruckType('eicher_20ft');
    setMileageLoaded(DEFAULTS.mileageLoaded);
    setMileageEmpty(DEFAULTS.mileageEmpty);
    setDieselPrice(DEFAULTS.dieselPrice);
    setCrates(DEFAULTS.crates);
    setBottles(DEFAULTS.bottles);
    setDriverExpenses(DEFAULTS.driverExpenses);
    setLoadingUnloading(DEFAULTS.loadingUnloading);
    setMaintenanceProvision(DEFAULTS.maintenanceProvision);
    
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setDirections({ routes: [] });
    }
    
    if (fromInputRef.current) fromInputRef.current.value = '';
    if (toInputRef.current) toInputRef.current.value = '';
  };

  return (
    <div className="space-y-6" data-testid="transportation-calculator-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-3">
            <Truck className="h-8 w-8 text-primary" />
            Transportation Cost Calculator
          </h1>
          <p className="text-muted-foreground mt-1">Calculate full landed logistics cost for your shipments</p>
        </div>
        <Button variant="outline" onClick={resetCalculator} data-testid="reset-calculator-btn">
          <RefreshCw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Location & Map */}
        <div className="space-y-6">
          {/* Location Inputs */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Route Selection
            </h2>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fromLocation">From Location</Label>
                <div className="relative">
                  <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  <input
                    ref={fromInputRef}
                    id="fromLocation"
                    type="text"
                    placeholder="Enter origin city or address..."
                    className="w-full h-11 pl-10 pr-4 border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    data-testid="from-location-input"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="toLocation">To Location</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                  <input
                    ref={toInputRef}
                    id="toLocation"
                    type="text"
                    placeholder="Enter destination city or address..."
                    className="w-full h-11 pl-10 pr-4 border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    data-testid="to-location-input"
                  />
                </div>
              </div>
              
              {/* Route Info */}
              {routeCalculated && (
                <div className="grid grid-cols-3 gap-3 pt-4 border-t">
                  <div className="bg-blue-50 p-3 rounded-lg text-center">
                    <p className="text-xs text-blue-600 font-medium">DISTANCE (One Way)</p>
                    <p className="text-xl font-bold text-blue-700">{distance} km</p>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-lg text-center">
                    <p className="text-xs text-amber-600 font-medium">DURATION</p>
                    <p className="text-xl font-bold text-amber-700">{duration}</p>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-lg text-center">
                    <p className="text-xs text-purple-600 font-medium">TOLLS (Est.)</p>
                    <p className="text-xl font-bold text-purple-700">{tollCount}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Map */}
          <Card className="overflow-hidden">
            <div 
              ref={mapRef} 
              className="w-full h-[400px] bg-muted"
              data-testid="route-map"
            >
              {!GOOGLE_MAPS_API_KEY && (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <p>Google Maps API key not configured</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column - Inputs & Calculations */}
        <div className="space-y-6">
          {/* Vehicle & Cost Inputs */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Vehicle & Cost Parameters
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Truck Type */}
              <div className="col-span-2 space-y-2">
                <Label>Truck Type</Label>
                <Select value={truckType} onValueChange={setTruckType}>
                  <SelectTrigger data-testid="truck-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRUCK_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label} ({type.capacity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Distance (read-only) */}
              <div className="space-y-2">
                <Label>Distance (One Way)</Label>
                <div className="relative">
                  <Input 
                    value={distance} 
                    readOnly 
                    className="bg-muted pr-12"
                    data-testid="distance-input"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">km</span>
                </div>
              </div>
              
              {/* Diesel Price */}
              <div className="space-y-2">
                <Label>Diesel Price</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                  <Input 
                    type="number"
                    value={dieselPrice}
                    onChange={e => setDieselPrice(parseFloat(e.target.value) || 0)}
                    className="pl-7 pr-16"
                    data-testid="diesel-price-input"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">/litre</span>
                </div>
              </div>
              
              {/* Mileage Loaded */}
              <div className="space-y-2">
                <Label>Mileage (Loaded)</Label>
                <div className="relative">
                  <Input 
                    type="number"
                    step="0.1"
                    value={mileageLoaded}
                    onChange={e => setMileageLoaded(parseFloat(e.target.value) || 0)}
                    className="pr-12"
                    data-testid="mileage-loaded-input"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">km/l</span>
                </div>
              </div>
              
              {/* Mileage Empty */}
              <div className="space-y-2">
                <Label>Mileage (Empty Return)</Label>
                <div className="relative">
                  <Input 
                    type="number"
                    step="0.1"
                    value={mileageEmpty}
                    onChange={e => setMileageEmpty(parseFloat(e.target.value) || 0)}
                    className="pr-12"
                    data-testid="mileage-empty-input"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">km/l</span>
                </div>
              </div>
              
              {/* Crates */}
              <div className="space-y-2">
                <Label>Crates</Label>
                <Input 
                  type="number"
                  value={crates}
                  onChange={e => setCrates(parseInt(e.target.value) || 0)}
                  data-testid="crates-input"
                />
              </div>
              
              {/* Bottles */}
              <div className="space-y-2">
                <Label>Bottles</Label>
                <Input 
                  type="number"
                  value={bottles}
                  onChange={e => setBottles(parseInt(e.target.value) || 0)}
                  data-testid="bottles-input"
                />
              </div>
              
              {/* Driver Expenses */}
              <div className="space-y-2">
                <Label>Driver Expenses</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                  <Input 
                    type="number"
                    value={driverExpenses}
                    onChange={e => setDriverExpenses(parseFloat(e.target.value) || 0)}
                    className="pl-7"
                    data-testid="driver-expenses-input"
                  />
                </div>
              </div>
              
              {/* Loading & Unloading */}
              <div className="space-y-2">
                <Label>Loading & Unloading</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                  <Input 
                    type="number"
                    value={loadingUnloading}
                    onChange={e => setLoadingUnloading(parseFloat(e.target.value) || 0)}
                    className="pl-7"
                    data-testid="loading-unloading-input"
                  />
                </div>
              </div>
              
              {/* Maintenance Provision */}
              <div className="col-span-2 space-y-2">
                <Label>Maintenance Provision</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                  <Input 
                    type="number"
                    value={maintenanceProvision}
                    onChange={e => setMaintenanceProvision(parseFloat(e.target.value) || 0)}
                    className="pl-7"
                    data-testid="maintenance-input"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Cost Breakdown */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Cost Breakdown (Round Trip)
            </h2>
            
            <div className="space-y-3">
              {/* Diesel Costs */}
              <div className="bg-amber-50 p-4 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-amber-700 font-medium">
                  <Fuel className="h-4 w-4" />
                  Diesel Costs
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Forward Trip:</span>
                    <span className="font-medium">₹{costs.dieselForward.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Return Trip:</span>
                    <span className="font-medium">₹{costs.dieselReturn.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex justify-between pt-2 border-t border-amber-200">
                  <span className="font-medium text-amber-800">Total Diesel:</span>
                  <span className="font-bold text-amber-800">₹{costs.totalDiesel.toLocaleString()}</span>
                </div>
              </div>
              
              {/* Other Costs */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Route className="h-4 w-4" />
                    Tolls (Round Trip) - {tollCount * 2} tolls × ₹100
                  </span>
                  <span className="font-medium">₹{costs.tollsCost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Driver Expenses</span>
                  <span className="font-medium">₹{costs.driverExp.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Loading & Unloading</span>
                  <span className="font-medium">₹{costs.loadUnload.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Maintenance Provision</span>
                  <span className="font-medium">₹{costs.maintenance.toLocaleString()}</span>
                </div>
              </div>
              
              {/* Total */}
              <div className="bg-emerald-100 p-4 rounded-lg mt-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-emerald-800">
                    Full Landed Logistics Cost
                  </span>
                  <span className="text-2xl font-bold text-emerald-700" data-testid="total-cost">
                    ₹{costs.totalCost.toLocaleString()}
                  </span>
                </div>
              </div>
              
              {/* Per Unit Costs */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-blue-50 p-3 rounded-lg text-center">
                  <p className="text-xs text-blue-600 font-medium">COST PER CRATE</p>
                  <p className="text-xl font-bold text-blue-700" data-testid="cost-per-crate">
                    ₹{costs.costPerCrate.toFixed(2)}
                  </p>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg text-center">
                  <p className="text-xs text-purple-600 font-medium">COST PER BOTTLE</p>
                  <p className="text-xl font-bold text-purple-700" data-testid="cost-per-bottle">
                    ₹{costs.costPerBottle.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </Card>
          
          {/* Info Note */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>
              Toll count is estimated based on route distance. Actual tolls may vary.
              All calculations update in real-time as you modify inputs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
