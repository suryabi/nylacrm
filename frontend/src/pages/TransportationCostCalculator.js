import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { 
  Truck, MapPin, Route, Fuel, Calculator, 
  Navigation, RefreshCw, Info, Loader2
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Default values
const DEFAULTS = {
  mileageLoaded: '4.0',
  mileageEmpty: '5.0',
  dieselPrice: '100',
  crates: '600',
  bottles: '7200',
  driverExpenses: '1500',
  loadingUnloading: '1000',
  maintenanceProvision: '500',
  tollCostPerToll: '100',
};

const TRUCK_TYPES = [
  { value: 'eicher_20ft', label: 'New Eicher – 20 ft container', capacity: '6-8 tons' },
  { value: 'container_40ft', label: '40 ft container', capacity: '20-25 tons' },
];

export default function TransportationCostCalculator() {
  // Location states
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [showFromSuggestions, setShowFromSuggestions] = useState(false);
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  const [selectedFrom, setSelectedFrom] = useState(null);
  const [selectedTo, setSelectedTo] = useState(null);
  const [distance, setDistance] = useState('');
  const [duration, setDuration] = useState('');
  const [tollCount, setTollCount] = useState('');
  const [routeCalculated, setRouteCalculated] = useState(false);
  const [calculating, setCalculating] = useState(false);
  
  // Vehicle & Cost inputs (all strings for text input)
  const [truckType, setTruckType] = useState('eicher_20ft');
  const [mileageLoaded, setMileageLoaded] = useState(DEFAULTS.mileageLoaded);
  const [mileageEmpty, setMileageEmpty] = useState(DEFAULTS.mileageEmpty);
  const [dieselPrice, setDieselPrice] = useState(DEFAULTS.dieselPrice);
  const [crates, setCrates] = useState(DEFAULTS.crates);
  const [bottles, setBottles] = useState(DEFAULTS.bottles);
  const [driverExpenses, setDriverExpenses] = useState(DEFAULTS.driverExpenses);
  const [loadingUnloading, setLoadingUnloading] = useState(DEFAULTS.loadingUnloading);
  const [maintenanceProvision, setMaintenanceProvision] = useState(DEFAULTS.maintenanceProvision);
  const [tollCostPerToll, setTollCostPerToll] = useState(DEFAULTS.tollCostPerToll);
  
  // Fetch autocomplete suggestions for From location
  useEffect(() => {
    if (selectedFrom) return;
    if (fromLocation.length >= 3) {
      const timer = setTimeout(() => fetchSuggestions(fromLocation, setFromSuggestions, setShowFromSuggestions), 500);
      return () => clearTimeout(timer);
    } else {
      setFromSuggestions([]);
      setShowFromSuggestions(false);
    }
  }, [fromLocation, selectedFrom]);
  
  // Fetch autocomplete suggestions for To location
  useEffect(() => {
    if (selectedTo) return;
    if (toLocation.length >= 3) {
      const timer = setTimeout(() => fetchSuggestions(toLocation, setToSuggestions, setShowToSuggestions), 500);
      return () => clearTimeout(timer);
    } else {
      setToSuggestions([]);
      setShowToSuggestions(false);
    }
  }, [toLocation, selectedTo]);
  
  const fetchSuggestions = async (input, setSuggestions, setShow) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_URL}/transport/autocomplete`,
        { input },
        { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
      );
      setSuggestions(res.data.predictions || []);
      setShow(true);
    } catch (error) {
      console.error('Autocomplete error:', error);
    }
  };
  
  const selectFromSuggestion = (suggestion) => {
    setFromLocation(suggestion.description);
    setSelectedFrom(suggestion);
    setShowFromSuggestions(false);
    setFromSuggestions([]);
  };
  
  const selectToSuggestion = (suggestion) => {
    setToLocation(suggestion.description);
    setSelectedTo(suggestion);
    setShowToSuggestions(false);
    setToSuggestions([]);
  };
  
  // Calculate route when both locations are selected
  useEffect(() => {
    if (selectedFrom && selectedTo) {
      calculateRoute();
    }
  }, [selectedFrom, selectedTo]);
  
  const calculateRoute = async () => {
    if (!selectedFrom || !selectedTo) return;
    
    setCalculating(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_URL}/transport/calculate-route`,
        {
          origin: selectedFrom.lat && selectedFrom.lng 
            ? { lat: selectedFrom.lat, lng: selectedFrom.lng }
            : selectedFrom.description,
          destination: selectedTo.lat && selectedTo.lng
            ? { lat: selectedTo.lat, lng: selectedTo.lng }
            : selectedTo.description
        },
        { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
      );
      
      if (res.data.success) {
        setDistance(String(res.data.distance_km));
        setDuration(res.data.duration_text);
        setTollCount(String(res.data.toll_count));
        setRouteCalculated(true);
        toast.success('Route calculated successfully');
      } else {
        // Route API not available - allow manual entry
        toast.info('Please enter distance manually. You can find it using Google Maps.');
        setRouteCalculated(false);
      }
    } catch (error) {
      console.error('Route calculation error:', error);
      // Don't show error toast, just allow manual entry
      toast.info('Enter distance manually using Google Maps or other mapping service.');
    } finally {
      setCalculating(false);
    }
  };
  
  // Auto-estimate tolls when distance changes manually
  useEffect(() => {
    if (!routeCalculated && distance) {
      const dist = parseFloat(distance) || 0;
      if (dist >= 50) {
        const estimated = Math.max(1, Math.floor(dist / 70));
        setTollCount(String(estimated));
      } else {
        setTollCount('0');
      }
    }
  }, [distance, routeCalculated]);
  
  // Input validation helper - only allow numbers and decimal
  const handleNumberInput = (value, setter, allowDecimal = true) => {
    if (value === '') {
      setter('');
      return;
    }
    const regex = allowDecimal ? /^\d*\.?\d{0,2}$/ : /^\d*$/;
    if (regex.test(value)) {
      setter(value);
    }
  };
  
  // Cost calculations
  const calculateCosts = useCallback(() => {
    const dist = parseFloat(distance) || 0;
    const mileageL = parseFloat(mileageLoaded) || 1;
    const mileageE = parseFloat(mileageEmpty) || 1;
    const diesel = parseFloat(dieselPrice) || 0;
    const tolls = parseInt(tollCount) || 0;
    const tollCost = parseFloat(tollCostPerToll) || 0;
    const driver = parseFloat(driverExpenses) || 0;
    const loadUnload = parseFloat(loadingUnloading) || 0;
    const maintenance = parseFloat(maintenanceProvision) || 0;
    const cratesNum = parseInt(crates) || 1;
    const bottlesNum = parseInt(bottles) || 1;
    
    if (dist === 0) {
      return {
        dieselForward: 0,
        dieselReturn: 0,
        totalDiesel: 0,
        tollsCost: 0,
        driverExp: driver,
        loadUnload: loadUnload,
        maintenance: maintenance,
        totalCost: 0,
        costPerCrate: 0,
        costPerBottle: 0,
      };
    }
    
    // Diesel calculations
    const dieselForward = (dist / mileageL) * diesel;
    const dieselReturn = (dist / mileageE) * diesel;
    const totalDiesel = dieselForward + dieselReturn;
    
    // Toll cost (round trip)
    const tollsCostTotal = tolls * tollCost * 2;
    
    // Total cost
    const totalCost = totalDiesel + tollsCostTotal + driver + loadUnload + maintenance;
    
    // Per unit costs
    const costPerCrate = cratesNum > 0 ? totalCost / cratesNum : 0;
    const costPerBottle = bottlesNum > 0 ? totalCost / bottlesNum : 0;
    
    return {
      dieselForward: Math.round(dieselForward),
      dieselReturn: Math.round(dieselReturn),
      totalDiesel: Math.round(totalDiesel),
      tollsCost: Math.round(tollsCostTotal),
      driverExp: driver,
      loadUnload: loadUnload,
      maintenance: maintenance,
      totalCost: Math.round(totalCost),
      costPerCrate: Math.round(costPerCrate * 100) / 100,
      costPerBottle: Math.round(costPerBottle * 100) / 100,
    };
  }, [distance, mileageLoaded, mileageEmpty, dieselPrice, tollCount, tollCostPerToll, driverExpenses, loadingUnloading, maintenanceProvision, crates, bottles]);
  
  const costs = calculateCosts();
  
  const resetCalculator = () => {
    setFromLocation('');
    setToLocation('');
    setSelectedFrom(null);
    setSelectedTo(null);
    setDistance('');
    setDuration('');
    setTollCount('');
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
    setTollCostPerToll(DEFAULTS.tollCostPerToll);
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

      {/* Cost Breakdown Tiles - Always Visible at Top */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* Total Landed Cost - Main Highlight */}
        <Card className="col-span-2 p-4 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-100">TOTAL LANDED COST</p>
              <p className="text-3xl font-bold mt-1" data-testid="total-cost">
                ₹{costs.totalCost.toLocaleString()}
              </p>
            </div>
            <Calculator className="h-10 w-10 text-emerald-200" />
          </div>
        </Card>

        {/* Diesel Cost */}
        <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <p className="text-xs font-medium text-amber-700">DIESEL (ROUND TRIP)</p>
          <p className="text-xl font-bold text-amber-800 mt-1">
            ₹{costs.totalDiesel.toLocaleString()}
          </p>
          <p className="text-xs text-amber-600 mt-1">
            ↑ ₹{costs.dieselForward.toLocaleString()} + ↓ ₹{costs.dieselReturn.toLocaleString()}
          </p>
        </Card>

        {/* Tolls */}
        <Card className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200">
          <p className="text-xs font-medium text-slate-600">TOLLS (R/T)</p>
          <p className="text-xl font-bold text-slate-800 mt-1">
            ₹{costs.tollsCost.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {(parseInt(tollCount) || 0) * 2} tolls × ₹{tollCostPerToll}
          </p>
        </Card>

        {/* Cost Per Crate */}
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <p className="text-xs font-medium text-blue-600">COST / CRATE</p>
          <p className="text-xl font-bold text-blue-700 mt-1" data-testid="cost-per-crate">
            ₹{costs.costPerCrate.toFixed(2)}
          </p>
          <p className="text-xs text-blue-500 mt-1">{crates || 0} crates</p>
        </Card>

        {/* Cost Per Bottle */}
        <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <p className="text-xs font-medium text-purple-600">COST / BOTTLE</p>
          <p className="text-xl font-bold text-purple-700 mt-1" data-testid="cost-per-bottle">
            ₹{costs.costPerBottle.toFixed(2)}
          </p>
          <p className="text-xs text-purple-500 mt-1">{bottles || 0} bottles</p>
        </Card>
      </div>

      {/* Additional Cost Details Row */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Driver Expenses</p>
          <p className="text-lg font-semibold">₹{costs.driverExp.toLocaleString()}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Loading/Unloading</p>
          <p className="text-lg font-semibold">₹{costs.loadUnload.toLocaleString()}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Maintenance</p>
          <p className="text-lg font-semibold">₹{costs.maintenance.toLocaleString()}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Round Trip Distance</p>
          <p className="text-lg font-semibold text-primary">{distance ? `${parseFloat(distance) * 2} km` : '-'}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Location & Route */}
        <div className="space-y-6">
          {/* Location Inputs */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Route Selection
            </h2>
            
            <div className="space-y-4">
              {/* From Location */}
              <div className="space-y-2 relative">
                <Label htmlFor="fromLocation">From Location</Label>
                <div className="relative">
                  <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  <input
                    id="fromLocation"
                    type="text"
                    value={fromLocation}
                    onChange={(e) => {
                      setFromLocation(e.target.value);
                      setSelectedFrom(null);
                    }}
                    placeholder="Enter origin city or address..."
                    className="w-full h-11 pl-10 pr-4 border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    data-testid="from-location-input"
                    autoComplete="off"
                  />
                </div>
                {showFromSuggestions && fromSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full bg-background border rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                    {fromSuggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectFromSuggestion(suggestion)}
                        className="w-full px-4 py-3 text-left hover:bg-muted flex items-start gap-2 border-b last:border-b-0"
                      >
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-sm">{suggestion.name || suggestion.description?.split(',')[0]}</p>
                          <p className="text-xs text-muted-foreground">{suggestion.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* To Location */}
              <div className="space-y-2 relative">
                <Label htmlFor="toLocation">To Location</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                  <input
                    id="toLocation"
                    type="text"
                    value={toLocation}
                    onChange={(e) => {
                      setToLocation(e.target.value);
                      setSelectedTo(null);
                    }}
                    placeholder="Enter destination city or address..."
                    className="w-full h-11 pl-10 pr-4 border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    data-testid="to-location-input"
                    autoComplete="off"
                  />
                </div>
                {showToSuggestions && toSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full bg-background border rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                    {toSuggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectToSuggestion(suggestion)}
                        className="w-full px-4 py-3 text-left hover:bg-muted flex items-start gap-2 border-b last:border-b-0"
                      >
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-sm">{suggestion.name || suggestion.description?.split(',')[0]}</p>
                          <p className="text-xs text-muted-foreground">{suggestion.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Calculating indicator */}
              {calculating && (
                <div className="flex items-center gap-2 text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Calculating route...</span>
                </div>
              )}
              
              {/* Route Info or Manual Entry */}
              <div className="grid grid-cols-3 gap-3 pt-4 border-t">
                <div className="space-y-1">
                  <Label className="text-xs">Distance (One Way) *</Label>
                  <div className="relative">
                    <input
                      type="text"
                      value={distance}
                      onChange={(e) => {
                        handleNumberInput(e.target.value, setDistance);
                        if (!routeCalculated) setRouteCalculated(false);
                      }}
                      className={`w-full h-9 px-3 pr-10 text-right border rounded bg-background ${routeCalculated ? 'bg-muted' : ''}`}
                      placeholder="0"
                      data-testid="distance-input"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">km</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Duration</Label>
                  <div className="h-9 px-3 flex items-center justify-center border rounded bg-muted text-sm">
                    {duration || '-'}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tolls (One Way)</Label>
                  <input
                    type="text"
                    value={tollCount}
                    onChange={(e) => handleNumberInput(e.target.value, setTollCount, false)}
                    className="w-full h-9 px-3 text-center border rounded bg-background"
                    placeholder="0"
                    data-testid="toll-count-input"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Route Summary Card */}
          <Card className="p-6 bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <Route className="h-6 w-6 text-primary" />
              <h3 className="font-semibold">Route Summary</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">From:</span>
                <span className="font-medium text-right max-w-[60%] truncate">{fromLocation || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">To:</span>
                <span className="font-medium text-right max-w-[60%] truncate">{toLocation || '-'}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-muted-foreground">One Way Distance:</span>
                <span className="font-bold text-primary">{distance ? `${distance} km` : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Round Trip Distance:</span>
                <span className="font-bold text-primary">{distance ? `${parseFloat(distance) * 2} km` : '-'}</span>
              </div>
            </div>
          </Card>
          
          {/* Info Note - Moved to left column */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>
              All calculations update in real-time as you modify inputs. 
              Start typing location names to see suggestions from Google Places.
              Toll count is estimated based on distance (~1 toll per 70km on highways).
            </p>
          </div>
        </div>

        {/* Right Column - Vehicle & Cost Inputs */}
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
              
              {/* Diesel Price */}
              <div className="space-y-2">
                <Label>Diesel Price (₹/litre)</Label>
                <input
                  type="text"
                  value={dieselPrice}
                  onChange={(e) => handleNumberInput(e.target.value, setDieselPrice)}
                  className="w-full h-9 px-3 text-right border rounded bg-background"
                  placeholder="0.00"
                  data-testid="diesel-price-input"
                />
              </div>
              
              {/* Toll Cost per Toll */}
              <div className="space-y-2">
                <Label>Cost per Toll (₹)</Label>
                <input
                  type="text"
                  value={tollCostPerToll}
                  onChange={(e) => handleNumberInput(e.target.value, setTollCostPerToll)}
                  className="w-full h-9 px-3 text-right border rounded bg-background"
                  placeholder="0.00"
                  data-testid="toll-cost-input"
                />
              </div>
              
              {/* Mileage Loaded */}
              <div className="space-y-2">
                <Label>Mileage - Loaded (km/l)</Label>
                <input
                  type="text"
                  value={mileageLoaded}
                  onChange={(e) => handleNumberInput(e.target.value, setMileageLoaded)}
                  className="w-full h-9 px-3 text-right border rounded bg-background"
                  placeholder="0.0"
                  data-testid="mileage-loaded-input"
                />
              </div>
              
              {/* Mileage Empty */}
              <div className="space-y-2">
                <Label>Mileage - Empty Return (km/l)</Label>
                <input
                  type="text"
                  value={mileageEmpty}
                  onChange={(e) => handleNumberInput(e.target.value, setMileageEmpty)}
                  className="w-full h-9 px-3 text-right border rounded bg-background"
                  placeholder="0.0"
                  data-testid="mileage-empty-input"
                />
              </div>
              
              {/* Crates */}
              <div className="space-y-2">
                <Label>Crates</Label>
                <input
                  type="text"
                  value={crates}
                  onChange={(e) => handleNumberInput(e.target.value, setCrates, false)}
                  className="w-full h-9 px-3 text-right border rounded bg-background"
                  placeholder="0"
                  data-testid="crates-input"
                />
              </div>
              
              {/* Bottles */}
              <div className="space-y-2">
                <Label>Bottles</Label>
                <input
                  type="text"
                  value={bottles}
                  onChange={(e) => handleNumberInput(e.target.value, setBottles, false)}
                  className="w-full h-9 px-3 text-right border rounded bg-background"
                  placeholder="0"
                  data-testid="bottles-input"
                />
              </div>
              
              {/* Driver Expenses */}
              <div className="space-y-2">
                <Label>Driver Expenses (₹)</Label>
                <input
                  type="text"
                  value={driverExpenses}
                  onChange={(e) => handleNumberInput(e.target.value, setDriverExpenses)}
                  className="w-full h-9 px-3 text-right border rounded bg-background"
                  placeholder="0.00"
                  data-testid="driver-expenses-input"
                />
              </div>
              
              {/* Loading & Unloading */}
              <div className="space-y-2">
                <Label>Loading & Unloading (₹)</Label>
                <input
                  type="text"
                  value={loadingUnloading}
                  onChange={(e) => handleNumberInput(e.target.value, setLoadingUnloading)}
                  className="w-full h-9 px-3 text-right border rounded bg-background"
                  placeholder="0.00"
                  data-testid="loading-unloading-input"
                />
              </div>
              
              {/* Maintenance Provision */}
              <div className="col-span-2 space-y-2">
                <Label>Maintenance Provision (₹)</Label>
                <input
                  type="text"
                  value={maintenanceProvision}
                  onChange={(e) => handleNumberInput(e.target.value, setMaintenanceProvision)}
                  className="w-full h-9 px-3 text-right border rounded bg-background"
                  placeholder="0.00"
                  data-testid="maintenance-input"
                />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
