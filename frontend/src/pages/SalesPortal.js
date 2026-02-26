import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Separator } from '../components/ui/separator';
import { Badge } from '../components/ui/badge';
import { Scale, TrendingUp, Trophy, Sparkles, Package, Droplets, Leaf, Globe } from 'lucide-react';

const NYLA_LOGO = 'https://customer-assets.emergentagent.com/job_pipeline-master-14/artifacts/6tqxvtds_WhatsApp%20Image%202026-02-04%20at%2011.26.46%20PM.jpeg';

// Bottle size options
const BOTTLE_SIZES = [
  { value: 660, label: '660 ml' },
  { value: 330, label: '330 ml' }
];

// Default Nyla values
const DEFAULT_NYLA = {
  buyingPrice: 11,
  percentageGST: 5,
  sellingPrice: 20,
  percentageReturn: 75,
  returnCredit: 15
};

// Default Competitor values
const DEFAULT_COMPETITOR = {
  buyingPrice: '',
  percentageGST: 5,
  sellingPrice: '',
  percentageReturn: 75,
  returnCredit: 0
};

export default function SalesPortal() {
  // Bottle size selection (mandatory)
  const [bottleSize, setBottleSize] = useState(660);
  
  // Sample size for calculations
  const [sampleSize, setSampleSize] = useState(1000);

  // Competitor (Your Brand) state
  const [competitor, setCompetitor] = useState(DEFAULT_COMPETITOR);

  // Nyla state with defaults
  const [nyla, setNyla] = useState(DEFAULT_NYLA);

  // Calculated values for competitor
  const [competitorCalc, setCompetitorCalc] = useState({
    landingPrice: 0,
    profitMargin: 0,
    profitMarginPerUnit: 0,
    returnCreditPerBottle: 0,
    totalProfitMargin: 0,
    totalProfitMarginPerUnit: 0
  });

  // Calculated values for Nyla
  const [nylaCalc, setNylaCalc] = useState({
    landingPrice: 0,
    profitMargin: 0,
    profitMarginPerUnit: 0,
    returnCreditPerBottle: 0,
    totalProfitMargin: 0,
    totalProfitMarginPerUnit: 0
  });

  // Winner state for animation
  const [showWinnerAnimation, setShowWinnerAnimation] = useState(false);

  // Calculate derived values
  const calculateValues = useCallback((data) => {
    const buyingPrice = parseFloat(data.buyingPrice) || 0;
    const gst = parseFloat(data.percentageGST) || 0;
    const sellingPrice = parseFloat(data.sellingPrice) || 0;
    const percentageReturn = parseFloat(data.percentageReturn) || 0;
    const returnCredit = parseFloat(data.returnCredit) || 0;

    // Landing Price = Buying Price + GST
    const landingPrice = buyingPrice + (buyingPrice * gst / 100);

    // Profit Margin % = ((Selling - Landing) / Landing) * 100
    const profitMargin = landingPrice > 0 
      ? ((sellingPrice - landingPrice) / landingPrice) * 100 
      : 0;

    // Profit Margin Per Unit = Selling - Landing
    const profitMarginPerUnit = sellingPrice - landingPrice;

    // Return Credit Per Bottle = (% Return / 100) * Return Credit
    const returnCreditPerBottle = (percentageReturn / 100) * returnCredit;

    // Total Profit Margin % = Profit Margin + (Return Credit contribution)
    const returnCreditContribution = landingPrice > 0 
      ? (returnCreditPerBottle / landingPrice) * 100 
      : 0;
    const totalProfitMargin = profitMargin + returnCreditContribution;

    // Total Profit Margin Per Unit = Profit Per Unit + Return Credit Per Bottle
    const totalProfitMarginPerUnit = profitMarginPerUnit + returnCreditPerBottle;

    return {
      landingPrice: landingPrice.toFixed(2),
      profitMargin: profitMargin.toFixed(2),
      profitMarginPerUnit: profitMarginPerUnit.toFixed(2),
      returnCreditPerBottle: returnCreditPerBottle.toFixed(2),
      totalProfitMargin: totalProfitMargin.toFixed(2),
      totalProfitMarginPerUnit: totalProfitMarginPerUnit.toFixed(2)
    };
  }, []);

  // Update competitor calculations
  useEffect(() => {
    setCompetitorCalc(calculateValues(competitor));
  }, [competitor, calculateValues]);

  // Update Nyla calculations
  useEffect(() => {
    setNylaCalc(calculateValues(nyla));
  }, [nyla, calculateValues]);

  // Trigger winner animation when values change
  useEffect(() => {
    if (competitor.buyingPrice && competitor.sellingPrice) {
      setShowWinnerAnimation(false);
      setTimeout(() => setShowWinnerAnimation(true), 100);
    }
  }, [competitorCalc, nylaCalc, competitor.buyingPrice, competitor.sellingPrice]);

  // Handle input change for competitor
  const handleCompetitorChange = (field, value) => {
    setCompetitor(prev => ({ ...prev, [field]: value }));
  };

  // Handle input change for Nyla
  const handleNylaChange = (field, value) => {
    setNyla(prev => ({ ...prev, [field]: value }));
  };

  // Calculate total values for sample size
  const competitorLandingPrice = parseFloat(competitorCalc.landingPrice) || 0;
  const nylaLandingPrice = parseFloat(nylaCalc.landingPrice) || 0;
  
  // Total Purchase/Landed Cost
  const competitorTotalCost = competitorLandingPrice * sampleSize;
  const nylaTotalCost = nylaLandingPrice * sampleSize;
  
  // Top Line (Revenue)
  const competitorTopLine = (parseFloat(competitor.sellingPrice) || 0) * sampleSize;
  const nylaTopLine = (parseFloat(nyla.sellingPrice) || 0) * sampleSize;
  
  // Return Credit
  const competitorReturnCreditPerBottle = parseFloat(competitorCalc.returnCreditPerBottle) || 0;
  const nylaReturnCreditPerBottle = parseFloat(nylaCalc.returnCreditPerBottle) || 0;
  const competitorTotalReturnCredit = competitorReturnCreditPerBottle * sampleSize;
  const nylaTotalReturnCredit = nylaReturnCreditPerBottle * sampleSize;
  
  // Bottom Line (Profit)
  const competitorTotalProfit = (parseFloat(competitorCalc.totalProfitMarginPerUnit) || 0) * sampleSize;
  const nylaTotalProfit = (parseFloat(nylaCalc.totalProfitMarginPerUnit) || 0) * sampleSize;
  
  const profitDifference = nylaTotalProfit - competitorTotalProfit;
  const isNylaWinner = nylaTotalProfit > competitorTotalProfit;

  // Sustainability Impact Calculation
  // Formula: Number of Bottles × 3 × Selected Bottle Size (in ml, converted to litres)
  const groundwaterSavedMonthly = (sampleSize * 3 * bottleSize) / 1000; // Convert to litres
  const groundwaterSavedYearly = groundwaterSavedMonthly * 12;

  const renderInputField = (label, field, data, onChange, disabled = false, highlight = false) => (
    <div className="space-y-2">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={data[field]}
        onChange={(e) => onChange(field, e.target.value)}
        disabled={disabled}
        className={`${disabled ? 'bg-muted/50' : ''} ${highlight ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20' : ''}`}
        placeholder={`Enter ${label.toLowerCase()}`}
      />
    </div>
  );

  const renderCalculatedField = (label, value, highlight = false) => (
    <div className="space-y-2">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <div className={`px-3 py-2 rounded-md border ${highlight ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
        <span className="font-medium">
          {value || '0.00'}
        </span>
      </div>
    </div>
  );

  const hasCompetitorData = competitor.buyingPrice && competitor.sellingPrice;

  return (
    <div className="space-y-6" data-testid="sales-portal-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Scale className="h-7 w-7 text-primary" />
            Brand Comparison Calculator
          </h1>
          <p className="text-muted-foreground mt-1">Compare profit margins between your brand and Nyla</p>
        </div>
      </div>

      {/* Bottle Size & Sample Size Selection */}
      <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-6">
            {/* Bottle Size Selection */}
            <div className="flex items-center gap-3">
              <Droplets className="h-5 w-5 text-primary" />
              <Label className="text-sm font-semibold whitespace-nowrap">Bottle Size:</Label>
              <div className="flex gap-2">
                {BOTTLE_SIZES.map(size => (
                  <button
                    key={size.value}
                    onClick={() => setBottleSize(size.value)}
                    data-testid={`bottle-size-${size.value}`}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      bottleSize === size.value
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                    }`}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </div>

            <Separator orientation="vertical" className="h-8 hidden md:block" />

            {/* Sample Size Input */}
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-muted-foreground" />
              <Label className="text-sm font-semibold whitespace-nowrap">Monthly Volume:</Label>
              <Input
                type="number"
                value={sampleSize}
                onChange={(e) => setSampleSize(parseInt(e.target.value) || 0)}
                className="w-28 h-9"
                min="1"
                data-testid="sample-size-input"
              />
              <span className="text-sm text-muted-foreground">bottles</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Input Forms - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Competitor (Your Brand) Card */}
        <Card className="border-slate-300 dark:border-slate-600">
          <CardHeader className="pb-4 bg-slate-50/50 dark:bg-slate-800/50 border-b">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 text-sm font-bold">
                ?
              </div>
              Current Brand
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {renderInputField('Buying Price (₹)', 'buyingPrice', competitor, handleCompetitorChange)}
              {renderInputField('GST %', 'percentageGST', competitor, handleCompetitorChange)}
            </div>
            {renderCalculatedField('Landing Price (₹)', competitorCalc.landingPrice)}
            {renderInputField('Selling Price (₹)', 'sellingPrice', competitor, handleCompetitorChange)}
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              {renderInputField('% Bottle Returns', 'percentageReturn', competitor, handleCompetitorChange)}
              {renderInputField('Return Credit (₹)', 'returnCredit', competitor, handleCompetitorChange)}
            </div>
          </CardContent>
        </Card>

        {/* Nyla Card */}
        <Card className="border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-50/30 dark:from-emerald-900/20 to-transparent">
          <CardHeader className="pb-4 bg-emerald-50/50 dark:bg-emerald-900/30 border-b border-emerald-200 dark:border-emerald-800">
            <CardTitle className="flex items-center gap-3 text-lg">
              <img src={NYLA_LOGO} alt="Nyla" className="h-8 w-8 rounded-full object-cover" />
              <span className="text-emerald-700 dark:text-emerald-400">Nyla Air Water</span>
              <Badge className="bg-emerald-600 ml-auto">Recommended</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {renderInputField('Buying Price (₹)', 'buyingPrice', nyla, handleNylaChange)}
              {renderInputField('GST %', 'percentageGST', nyla, handleNylaChange)}
            </div>
            {renderCalculatedField('Landing Price (₹)', nylaCalc.landingPrice, true)}
            {renderInputField('Selling Price (₹)', 'sellingPrice', nyla, handleNylaChange)}
            <Separator className="bg-emerald-200 dark:bg-emerald-800" />
            <div className="grid grid-cols-2 gap-4">
              {renderInputField('% Bottle Returns', 'percentageReturn', nyla, handleNylaChange)}
              {renderInputField('Return Credit (₹)', 'returnCredit', nyla, handleNylaChange)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Metrics Comparison - Side by Side */}
      {hasCompetitorData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* A. With Current Brand */}
          <Card className="border-slate-300 dark:border-slate-600">
            <CardHeader className="pb-3 bg-slate-100 dark:bg-slate-800 border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center text-xs font-bold">A</div>
                With Current Brand
              </CardTitle>
              <p className="text-sm text-muted-foreground">For {sampleSize.toLocaleString()} bottles/month</p>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <p className="text-sm text-muted-foreground mb-1">Total Purchase Cost</p>
                <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">
                  ₹{competitorTotalCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-muted-foreground">₹{competitorCalc.landingPrice}/bottle</p>
              </div>
              
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-muted-foreground mb-1">Top Line (Revenue)</p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                  ₹{competitorTopLine.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-muted-foreground">₹{competitor.sellingPrice || 0}/bottle</p>
              </div>
              
              <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                <p className="text-sm text-muted-foreground mb-1">Return Bottle Credit</p>
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">
                  ₹{competitorTotalReturnCredit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-muted-foreground">₹{competitorReturnCreditPerBottle.toFixed(2)}/bottle</p>
              </div>
              
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-muted-foreground mb-1">Bottom Line (Profit)</p>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                  ₹{competitorTotalProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-muted-foreground">₹{competitorCalc.totalProfitMarginPerUnit}/bottle</p>
              </div>
            </CardContent>
          </Card>

          {/* B. With Nyla */}
          <Card className={`border-2 transition-all ${isNylaWinner ? 'border-emerald-400 dark:border-emerald-600' : 'border-slate-300 dark:border-slate-600'}`}>
            <CardHeader className={`pb-3 border-b ${isNylaWinner ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800' : 'bg-slate-100 dark:bg-slate-800'}`}>
              <CardTitle className="text-lg flex items-center gap-2">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${isNylaWinner ? 'bg-emerald-500 text-white' : 'bg-slate-300 dark:bg-slate-600'}`}>B</div>
                With Nyla
                {isNylaWinner && <Trophy className="h-5 w-5 text-emerald-600 dark:text-emerald-400 ml-2" />}
              </CardTitle>
              <p className="text-sm text-muted-foreground">For {sampleSize.toLocaleString()} bottles/month</p>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className={`p-4 rounded-xl border ${isNylaWinner ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                <p className="text-sm text-muted-foreground mb-1">Total Landed Cost</p>
                <p className={`text-2xl font-bold ${nylaTotalCost < competitorTotalCost ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>
                  ₹{nylaTotalCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  {nylaTotalCost < competitorTotalCost && <span className="text-sm ml-2">↓ Save ₹{(competitorTotalCost - nylaTotalCost).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}
                </p>
                <p className="text-xs text-muted-foreground">₹{nylaCalc.landingPrice}/bottle</p>
              </div>
              
              <div className={`p-4 rounded-xl border ${nylaTopLine > competitorTopLine ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                <p className="text-sm text-muted-foreground mb-1">Top Line (Revenue)</p>
                <p className={`text-2xl font-bold ${nylaTopLine > competitorTopLine ? 'text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-200'}`}>
                  ₹{nylaTopLine.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-muted-foreground">₹{nyla.sellingPrice}/bottle</p>
              </div>
              
              <div className={`p-4 rounded-xl border ${nylaTotalReturnCredit > competitorTotalReturnCredit ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                <p className="text-sm text-muted-foreground mb-1">Return Bottle Credit</p>
                <p className={`text-2xl font-bold ${nylaTotalReturnCredit > competitorTotalReturnCredit ? 'text-purple-700 dark:text-purple-400' : 'text-slate-700 dark:text-slate-200'}`}>
                  ₹{nylaTotalReturnCredit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  {nylaTotalReturnCredit > competitorTotalReturnCredit && <span className="text-sm ml-2">↑ +₹{(nylaTotalReturnCredit - competitorTotalReturnCredit).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}
                </p>
                <p className="text-xs text-muted-foreground">₹{nylaReturnCreditPerBottle.toFixed(2)}/bottle</p>
              </div>
              
              <div className={`p-4 rounded-xl border ${isNylaWinner ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
                <p className="text-sm text-muted-foreground mb-1">Bottom Line (Profit)</p>
                <p className={`text-2xl font-bold ${isNylaWinner ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  ₹{nylaTotalProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  {isNylaWinner && <span className="text-sm ml-2">↑ +₹{profitDifference.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}
                </p>
                <p className="text-xs text-muted-foreground">₹{nylaCalc.totalProfitMarginPerUnit}/bottle</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Winner Summary */}
      {hasCompetitorData && isNylaWinner && (
        <Card className={`border-2 border-emerald-400 dark:border-emerald-600 overflow-hidden ${showWinnerAnimation ? 'animate-pulse' : ''}`} style={{ animationDuration: '2s', animationIterationCount: '2' }}>
          <CardContent className="p-6 bg-gradient-to-r from-emerald-50 dark:from-emerald-900/30 to-white dark:to-transparent">
            <div className="flex items-center justify-center gap-4 text-center">
              <Trophy className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">
                  By choosing <strong>Nyla Air Water</strong>, you earn an extra
                </p>
                <p className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">
                  ₹{Math.abs(profitDifference).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-sm text-muted-foreground">per month on {sampleSize.toLocaleString()} bottles</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sustainability Impact Section */}
      <Card className="border-2 border-teal-300 dark:border-teal-700 bg-gradient-to-br from-teal-50 dark:from-teal-900/20 to-cyan-50 dark:to-cyan-900/10">
        <CardHeader className="border-b border-teal-200 dark:border-teal-800">
          <CardTitle className="flex items-center gap-3 text-xl text-teal-800 dark:text-teal-300">
            <div className="p-2 bg-teal-100 dark:bg-teal-900/50 rounded-full">
              <Globe className="h-6 w-6 text-teal-600 dark:text-teal-400" />
            </div>
            Sustainability Impact
          </CardTitle>
          <p className="text-sm text-teal-700 dark:text-teal-400">Positive environmental impact by switching to Nyla Air Water</p>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Monthly Impact */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-cyan-100 dark:from-cyan-900/30 to-teal-100 dark:to-teal-900/30 border border-teal-200 dark:border-teal-800">
              <div className="flex items-center gap-3 mb-4">
                <Droplets className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
                <div>
                  <p className="text-sm font-medium text-teal-700 dark:text-teal-400">Monthly Groundwater Saved</p>
                  <p className="text-xs text-muted-foreground">({sampleSize.toLocaleString()} bottles × 3 × {bottleSize}ml)</p>
                </div>
              </div>
              <p className="text-4xl font-bold text-cyan-700 dark:text-cyan-300">
                {groundwaterSavedMonthly.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                <span className="text-xl font-normal ml-2">litres</span>
              </p>
            </div>

            {/* Yearly Impact */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-100 dark:from-emerald-900/30 to-green-100 dark:to-green-900/30 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-3 mb-4">
                <Leaf className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Yearly Groundwater Saved</p>
                  <p className="text-xs text-muted-foreground">(Monthly × 12 months)</p>
                </div>
              </div>
              <p className="text-4xl font-bold text-emerald-700 dark:text-emerald-300">
                {groundwaterSavedYearly.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                <span className="text-xl font-normal ml-2">litres</span>
              </p>
            </div>
          </div>

          {/* Environmental Message */}
          <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-center">
            <p className="text-lg font-medium">
              By choosing Nyla Air Water, you help preserve <strong>{(groundwaterSavedYearly / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} kilolitres</strong> of groundwater annually
            </p>
            <p className="text-sm opacity-90 mt-1">
              A sustainable choice for future generations
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
