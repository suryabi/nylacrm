import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Separator } from '../components/ui/separator';
import { Badge } from '../components/ui/badge';
import { Scale, TrendingUp, Trophy, Sparkles, Package } from 'lucide-react';

const NYLA_LOGO = 'https://customer-assets.emergentagent.com/job_pipeline-master-14/artifacts/6tqxvtds_WhatsApp%20Image%202026-02-04%20at%2011.26.46%20PM.jpeg';

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

    // Total Return Credit = (% Return / 100) * Return Credit
    const totalReturnCredit = (percentageReturn / 100) * returnCredit;

    // Total Profit Margin % = Profit Margin + (Return Credit contribution)
    const returnCreditContribution = landingPrice > 0 
      ? (totalReturnCredit / landingPrice) * 100 
      : 0;
    const totalProfitMargin = profitMargin + returnCreditContribution;

    // Total Profit Margin Per Unit = Profit Per Unit + Total Return Credit
    const totalProfitMarginPerUnit = profitMarginPerUnit + totalReturnCredit;

    return {
      landingPrice: landingPrice.toFixed(2),
      profitMargin: profitMargin.toFixed(2),
      profitMarginPerUnit: profitMarginPerUnit.toFixed(2),
      totalReturnCredit: totalReturnCredit.toFixed(2),
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

  // Compare values and return styling
  const getComparisonStyle = (competitorVal, nylaVal, higherIsBetter = true) => {
    const comp = parseFloat(competitorVal) || 0;
    const ny = parseFloat(nylaVal) || 0;
    
    if (comp === 0 && ny === 0) return '';
    
    if (higherIsBetter) {
      return ny > comp ? 'text-emerald-600 font-semibold' : ny < comp ? 'text-red-600' : '';
    } else {
      return ny < comp ? 'text-emerald-600 font-semibold' : ny > comp ? 'text-red-600' : '';
    }
  };

  // Calculate total profit for sample size
  const competitorTotalProfit = (parseFloat(competitorCalc.totalProfitMarginPerUnit) || 0) * sampleSize;
  const nylaTotalProfit = (parseFloat(nylaCalc.totalProfitMarginPerUnit) || 0) * sampleSize;
  const profitDifference = nylaTotalProfit - competitorTotalProfit;
  const isNylaWinner = nylaTotalProfit > competitorTotalProfit;

  // Calculate return credit for sample size
  const competitorReturnCreditPerBottle = parseFloat(competitorCalc.totalReturnCredit) || 0;
  const nylaReturnCreditPerBottle = parseFloat(nylaCalc.totalReturnCredit) || 0;
  const competitorTotalReturnCredit = competitorReturnCreditPerBottle * sampleSize;
  const nylaTotalReturnCredit = nylaReturnCreditPerBottle * sampleSize;
  const returnCreditDifference = nylaTotalReturnCredit - competitorTotalReturnCredit;

  const renderInputField = (label, field, data, onChange, disabled = false, highlight = false) => (
    <div className="space-y-2">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={data[field]}
        onChange={(e) => onChange(field, e.target.value)}
        disabled={disabled}
        className={`${disabled ? 'bg-muted/50' : ''} ${highlight ? 'border-emerald-500 bg-emerald-50/50' : ''}`}
        placeholder={`Enter ${label.toLowerCase()}`}
      />
    </div>
  );

  const renderCalculatedField = (label, value, highlight = false, comparisonClass = '') => (
    <div className="space-y-2">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <div className={`px-3 py-2 rounded-md border ${highlight ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
        <span className={`font-medium ${comparisonClass}`}>
          {value || '0.00'}
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="sales-portal-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Scale className="h-7 w-7 text-emerald-600" />
            Brand Comparison Calculator
          </h1>
          <p className="text-muted-foreground mt-1">Compare profit margins between your brand and Nyla</p>
        </div>
        
        {/* Sample Size Input */}
        <div className="flex items-center gap-3 bg-slate-100 px-4 py-2 rounded-lg">
          <Package className="h-5 w-5 text-slate-600" />
          <Label className="text-sm font-medium whitespace-nowrap">Sample Size:</Label>
          <Input
            type="number"
            value={sampleSize}
            onChange={(e) => setSampleSize(parseInt(e.target.value) || 0)}
            className="w-28 h-9"
            min="1"
          />
          <span className="text-sm text-muted-foreground">bottles</span>
        </div>
      </div>

      {/* Comparison Summary - NOW AT TOP */}
      {(competitor.buyingPrice && competitor.sellingPrice) && (
        <Card className={`border-2 overflow-hidden transition-all duration-500 ${
          isNylaWinner ? 'border-emerald-400 bg-gradient-to-r from-emerald-50 to-white' : 'border-orange-400 bg-gradient-to-r from-orange-50 to-white'
        }`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className={`h-6 w-6 ${isNylaWinner ? 'text-emerald-600' : 'text-orange-600'}`} />
              Comparison Summary
              <span className="text-sm font-normal text-muted-foreground ml-2">
                (for {sampleSize.toLocaleString()} bottles)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Winner Card */}
              <div className={`relative p-4 rounded-xl text-center ${
                isNylaWinner 
                  ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white' 
                  : 'bg-gradient-to-br from-orange-500 to-orange-600 text-white'
              } ${showWinnerAnimation ? 'animate-pulse' : ''}`}>
                {showWinnerAnimation && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className={`h-16 w-16 opacity-20 ${showWinnerAnimation ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
                  </div>
                )}
                <div className="relative z-10">
                  <Trophy className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm opacity-90 mb-1">Winner</p>
                  <p className="text-xl font-bold">
                    {isNylaWinner ? 'Nyla Air Water' : 'Your Brand'}
                  </p>
                </div>
              </div>

              {/* Profit Difference */}
              <div className="p-4 rounded-xl bg-white border-2 border-slate-200 text-center">
                <p className="text-sm text-muted-foreground mb-1">
                  {isNylaWinner ? 'Extra Profit with Nyla' : 'Extra Profit with Your Brand'}
                </p>
                <p className={`text-3xl font-bold ${isNylaWinner ? 'text-emerald-600' : 'text-orange-600'}`}>
                  {isNylaWinner ? '+' : '-'}₹{Math.abs(profitDifference).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  for {sampleSize.toLocaleString()} bottles
                </p>
              </div>

              {/* Your Brand Total */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <p className="text-sm text-muted-foreground mb-1">Your Brand Profit</p>
                <p className="text-2xl font-bold text-slate-700">
                  ₹{competitorTotalProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ₹{competitorCalc.totalProfitMarginPerUnit}/bottle
                </p>
              </div>

              {/* Nyla Total */}
              <div className={`p-4 rounded-xl border text-center ${
                isNylaWinner 
                  ? 'bg-emerald-50 border-emerald-200' 
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <p className="text-sm text-muted-foreground mb-1">Nyla Profit</p>
                <p className={`text-2xl font-bold ${isNylaWinner ? 'text-emerald-600' : 'text-slate-700'}`}>
                  ₹{nylaTotalProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ₹{nylaCalc.totalProfitMarginPerUnit}/bottle
                </p>
              </div>
            </div>

            {/* Savings Message */}
            {isNylaWinner && (
              <div className={`mt-4 p-3 rounded-lg bg-emerald-100 border border-emerald-200 text-center ${
                showWinnerAnimation ? 'animate-bounce' : ''
              }`} style={{ animationDuration: '2s', animationIterationCount: '2' }}>
                <p className="text-emerald-800 font-medium">
                  🎉 By choosing <strong>Nyla</strong>, you save <strong>₹{Math.abs(profitDifference).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong> on every {sampleSize.toLocaleString()} bottles!
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Competitor (Your Brand) Card */}
        <Card className="border-slate-300">
          <CardHeader className="pb-4 bg-slate-50/50 border-b">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-sm font-bold">
                ?
              </div>
              Your Brand
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {/* Pricing Section */}
            <div className="grid grid-cols-2 gap-4">
              {renderInputField('Buying Price (₹)', 'buyingPrice', competitor, handleCompetitorChange)}
              {renderInputField('GST %', 'percentageGST', competitor, handleCompetitorChange)}
            </div>

            {renderCalculatedField('Landing Price (₹)', competitorCalc.landingPrice)}
            {renderInputField('Selling Price (₹)', 'sellingPrice', competitor, handleCompetitorChange)}

            <div className="grid grid-cols-2 gap-4">
              {renderCalculatedField(
                'Profit Margin %', 
                competitorCalc.profitMargin,
                false,
                getComparisonStyle(competitorCalc.profitMargin, nylaCalc.profitMargin)
              )}
              {renderCalculatedField(
                'Profit Margin / Unit (₹)', 
                competitorCalc.profitMarginPerUnit,
                false,
                getComparisonStyle(competitorCalc.profitMarginPerUnit, nylaCalc.profitMarginPerUnit)
              )}
            </div>

            <Separator />

            {/* Bottle Returns Section */}
            <div className="grid grid-cols-2 gap-4">
              {renderInputField('% Bottle Returns', 'percentageReturn', competitor, handleCompetitorChange)}
              {renderInputField('Bottle Return Credit (₹)', 'returnCredit', competitor, handleCompetitorChange)}
            </div>

            {renderCalculatedField('Total Return Credit (₹)', competitorCalc.totalReturnCredit)}

            <div className="grid grid-cols-2 gap-4">
              {renderCalculatedField(
                'Total Profit Margin %', 
                competitorCalc.totalProfitMargin,
                true,
                getComparisonStyle(competitorCalc.totalProfitMargin, nylaCalc.totalProfitMargin)
              )}
              {renderCalculatedField(
                'Total Profit / Unit (₹)', 
                competitorCalc.totalProfitMarginPerUnit,
                true,
                getComparisonStyle(competitorCalc.totalProfitMarginPerUnit, nylaCalc.totalProfitMarginPerUnit)
              )}
            </div>
          </CardContent>
        </Card>

        {/* Nyla Card */}
        <Card className="border-emerald-300 bg-gradient-to-br from-emerald-50/30 to-white">
          <CardHeader className="pb-4 bg-emerald-50/50 border-b border-emerald-200">
            <CardTitle className="flex items-center gap-3 text-lg">
              <img src={NYLA_LOGO} alt="Nyla" className="h-8 w-8 rounded-full object-cover" />
              <span className="text-emerald-700">Nyla Air Water</span>
              <Badge className="bg-emerald-600 ml-auto">Recommended</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {/* Pricing Section */}
            <div className="grid grid-cols-2 gap-4">
              {renderInputField('Buying Price (₹)', 'buyingPrice', nyla, handleNylaChange)}
              {renderInputField('GST %', 'percentageGST', nyla, handleNylaChange)}
            </div>

            {renderCalculatedField('Landing Price (₹)', nylaCalc.landingPrice)}
            {renderInputField('Selling Price (₹)', 'sellingPrice', nyla, handleNylaChange)}

            <div className="grid grid-cols-2 gap-4">
              {renderCalculatedField(
                'Profit Margin %', 
                nylaCalc.profitMargin,
                false,
                getComparisonStyle(nylaCalc.profitMargin, competitorCalc.profitMargin)
              )}
              {renderCalculatedField(
                'Profit Margin / Unit (₹)', 
                nylaCalc.profitMarginPerUnit,
                false,
                getComparisonStyle(nylaCalc.profitMarginPerUnit, competitorCalc.profitMarginPerUnit)
              )}
            </div>

            <Separator className="bg-emerald-200" />

            {/* Bottle Returns Section */}
            <div className="grid grid-cols-2 gap-4">
              {renderInputField('% Bottle Returns', 'percentageReturn', nyla, handleNylaChange)}
              {renderInputField('Bottle Return Credit (₹)', 'returnCredit', nyla, handleNylaChange)}
            </div>

            {renderCalculatedField('Total Return Credit (₹)', nylaCalc.totalReturnCredit)}

            <div className="grid grid-cols-2 gap-4">
              {renderCalculatedField(
                'Total Profit Margin %', 
                nylaCalc.totalProfitMargin,
                true,
                getComparisonStyle(nylaCalc.totalProfitMargin, competitorCalc.totalProfitMargin)
              )}
              {renderCalculatedField(
                'Total Profit / Unit (₹)', 
                nylaCalc.totalProfitMarginPerUnit,
                true,
                getComparisonStyle(nylaCalc.totalProfitMarginPerUnit, competitorCalc.totalProfitMarginPerUnit)
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
