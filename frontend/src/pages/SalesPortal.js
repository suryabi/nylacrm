import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Scale, Trophy, Package, Droplets, Leaf, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';

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
  const [bottleSize, setBottleSize] = useState(660);
  const [sampleSize, setSampleSize] = useState(1000);
  const [competitor, setCompetitor] = useState(DEFAULT_COMPETITOR);
  const [nyla, setNyla] = useState(DEFAULT_NYLA);
  const [competitorCalc, setCompetitorCalc] = useState({ landingPrice: 0, totalProfitMarginPerUnit: 0, returnCreditPerBottle: 0 });
  const [nylaCalc, setNylaCalc] = useState({ landingPrice: 0, totalProfitMarginPerUnit: 0, returnCreditPerBottle: 0 });

  const calculateValues = useCallback((data) => {
    const buyingPrice = parseFloat(data.buyingPrice) || 0;
    const gst = parseFloat(data.percentageGST) || 0;
    const sellingPrice = parseFloat(data.sellingPrice) || 0;
    const percentageReturn = parseFloat(data.percentageReturn) || 0;
    const returnCredit = parseFloat(data.returnCredit) || 0;

    const landingPrice = buyingPrice + (buyingPrice * gst / 100);
    const profitMarginPerUnit = sellingPrice - landingPrice;
    const returnCreditPerBottle = (percentageReturn / 100) * returnCredit;
    const totalProfitMarginPerUnit = profitMarginPerUnit + returnCreditPerBottle;

    return {
      landingPrice: landingPrice.toFixed(2),
      totalProfitMarginPerUnit: totalProfitMarginPerUnit.toFixed(2),
      returnCreditPerBottle: returnCreditPerBottle.toFixed(2)
    };
  }, []);

  useEffect(() => {
    setCompetitorCalc(calculateValues(competitor));
  }, [competitor, calculateValues]);

  useEffect(() => {
    setNylaCalc(calculateValues(nyla));
  }, [nyla, calculateValues]);

  const handleCompetitorChange = (field, value) => {
    setCompetitor(prev => ({ ...prev, [field]: value }));
  };

  const handleNylaChange = (field, value) => {
    setNyla(prev => ({ ...prev, [field]: value }));
  };

  // Calculations
  const competitorLandingPrice = parseFloat(competitorCalc.landingPrice) || 0;
  const nylaLandingPrice = parseFloat(nylaCalc.landingPrice) || 0;
  const competitorTotalCost = competitorLandingPrice * sampleSize;
  const nylaTotalCost = nylaLandingPrice * sampleSize;
  const competitorTopLine = (parseFloat(competitor.sellingPrice) || 0) * sampleSize;
  const nylaTopLine = (parseFloat(nyla.sellingPrice) || 0) * sampleSize;
  const competitorReturnCredit = (parseFloat(competitorCalc.returnCreditPerBottle) || 0) * sampleSize;
  const nylaReturnCredit = (parseFloat(nylaCalc.returnCreditPerBottle) || 0) * sampleSize;
  const competitorTotalProfit = (parseFloat(competitorCalc.totalProfitMarginPerUnit) || 0) * sampleSize;
  const nylaTotalProfit = (parseFloat(nylaCalc.totalProfitMarginPerUnit) || 0) * sampleSize;
  const profitDifference = nylaTotalProfit - competitorTotalProfit;
  const isNylaWinner = nylaTotalProfit > competitorTotalProfit;
  const hasCompetitorData = competitor.buyingPrice && competitor.sellingPrice;

  // Sustainability
  const groundwaterSavedMonthly = (sampleSize * 3 * bottleSize) / 1000;
  const groundwaterSavedYearly = groundwaterSavedMonthly * 12;

  const formatCurrency = (val) => `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const CompactInput = ({ label, field, data, onChange, disabled = false }) => (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground w-20 shrink-0">{label}</Label>
      <Input
        type="number"
        value={data[field]}
        onChange={(e) => onChange(field, e.target.value)}
        disabled={disabled}
        className="h-8 text-sm"
        placeholder="0"
      />
    </div>
  );

  return (
    <div className="space-y-4" data-testid="sales-portal-page">
      {/* Header with Controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Scale className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Brand Comparison Calculator</h1>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Size:</span>
            {BOTTLE_SIZES.map(size => (
              <button
                key={size.value}
                onClick={() => setBottleSize(size.value)}
                data-testid={`bottle-size-${size.value}`}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  bottleSize === size.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary hover:bg-secondary/80'
                }`}
              >
                {size.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Volume:</span>
            <Input
              type="number"
              value={sampleSize}
              onChange={(e) => setSampleSize(parseInt(e.target.value) || 0)}
              className="w-24 h-8 text-sm"
              data-testid="sample-size-input"
            />
            <span className="text-xs text-muted-foreground">/month</span>
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Left Column - Input Forms */}
        <div className="xl:col-span-1 grid grid-cols-2 gap-3">
          {/* Competitor Input */}
          <Card className="border-slate-300 dark:border-slate-600">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2 pb-2 border-b">
                <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold">?</div>
                <span className="text-sm font-semibold">Current Brand</span>
              </div>
              <CompactInput label="Buy Price" field="buyingPrice" data={competitor} onChange={handleCompetitorChange} />
              <CompactInput label="GST %" field="percentageGST" data={competitor} onChange={handleCompetitorChange} />
              <div className="flex items-center gap-2 py-1 px-2 bg-slate-50 dark:bg-slate-800 rounded text-xs">
                <span className="text-muted-foreground w-20">Landing</span>
                <span className="font-semibold">₹{competitorCalc.landingPrice}</span>
              </div>
              <CompactInput label="Sell Price" field="sellingPrice" data={competitor} onChange={handleCompetitorChange} />
              <CompactInput label="Return %" field="percentageReturn" data={competitor} onChange={handleCompetitorChange} />
              <CompactInput label="Return Cr." field="returnCredit" data={competitor} onChange={handleCompetitorChange} />
            </CardContent>
          </Card>

          {/* Nyla Input */}
          <Card className="border-emerald-300 dark:border-emerald-700 bg-emerald-50/30 dark:bg-emerald-900/10">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2 pb-2 border-b border-emerald-200 dark:border-emerald-800">
                <img src={NYLA_LOGO} alt="Nyla" className="h-6 w-6 rounded-full object-cover" />
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Nyla</span>
                <Badge className="bg-emerald-600 text-[10px] h-4 ml-auto">Best</Badge>
              </div>
              <CompactInput label="Buy Price" field="buyingPrice" data={nyla} onChange={handleNylaChange} />
              <CompactInput label="GST %" field="percentageGST" data={nyla} onChange={handleNylaChange} />
              <div className="flex items-center gap-2 py-1 px-2 bg-emerald-100 dark:bg-emerald-900/30 rounded text-xs">
                <span className="text-muted-foreground w-20">Landing</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">₹{nylaCalc.landingPrice}</span>
              </div>
              <CompactInput label="Sell Price" field="sellingPrice" data={nyla} onChange={handleNylaChange} />
              <CompactInput label="Return %" field="percentageReturn" data={nyla} onChange={handleNylaChange} />
              <CompactInput label="Return Cr." field="returnCredit" data={nyla} onChange={handleNylaChange} />
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Comparison & Results */}
        <div className="xl:col-span-2 space-y-3">
          {/* Metrics Comparison Table */}
          {hasCompetitorData && (
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-4 gap-2 text-sm">
                  {/* Header Row */}
                  <div className="font-semibold text-muted-foreground">Metric</div>
                  <div className="font-semibold text-center">Current Brand</div>
                  <div className="font-semibold text-center text-emerald-600 dark:text-emerald-400">Nyla</div>
                  <div className="font-semibold text-center">Difference</div>

                  {/* Total Cost Row */}
                  <div className="py-2 text-muted-foreground">Total Cost</div>
                  <div className="py-2 text-center font-medium">{formatCurrency(competitorTotalCost)}</div>
                  <div className="py-2 text-center font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(nylaTotalCost)}</div>
                  <div className={`py-2 text-center font-medium flex items-center justify-center gap-1 ${nylaTotalCost < competitorTotalCost ? 'text-emerald-600' : 'text-red-500'}`}>
                    {nylaTotalCost < competitorTotalCost ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                    {formatCurrency(Math.abs(nylaTotalCost - competitorTotalCost))}
                  </div>

                  {/* Revenue Row */}
                  <div className="py-2 text-muted-foreground border-t">Revenue</div>
                  <div className="py-2 text-center font-medium border-t">{formatCurrency(competitorTopLine)}</div>
                  <div className="py-2 text-center font-medium border-t text-emerald-600 dark:text-emerald-400">{formatCurrency(nylaTopLine)}</div>
                  <div className={`py-2 text-center font-medium border-t flex items-center justify-center gap-1 ${nylaTopLine > competitorTopLine ? 'text-emerald-600' : 'text-red-500'}`}>
                    {nylaTopLine > competitorTopLine ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {formatCurrency(Math.abs(nylaTopLine - competitorTopLine))}
                  </div>

                  {/* Return Credit Row */}
                  <div className="py-2 text-muted-foreground border-t">Return Credit</div>
                  <div className="py-2 text-center font-medium border-t">{formatCurrency(competitorReturnCredit)}</div>
                  <div className="py-2 text-center font-medium border-t text-emerald-600 dark:text-emerald-400">{formatCurrency(nylaReturnCredit)}</div>
                  <div className={`py-2 text-center font-medium border-t flex items-center justify-center gap-1 ${nylaReturnCredit > competitorReturnCredit ? 'text-emerald-600' : 'text-red-500'}`}>
                    {nylaReturnCredit > competitorReturnCredit ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {formatCurrency(Math.abs(nylaReturnCredit - competitorReturnCredit))}
                  </div>

                  {/* Profit Row */}
                  <div className="py-2 font-semibold border-t-2 border-primary/30">Net Profit</div>
                  <div className="py-2 text-center font-bold border-t-2 border-primary/30">{formatCurrency(competitorTotalProfit)}</div>
                  <div className="py-2 text-center font-bold border-t-2 border-primary/30 text-emerald-600 dark:text-emerald-400">{formatCurrency(nylaTotalProfit)}</div>
                  <div className={`py-2 text-center font-bold border-t-2 border-primary/30 flex items-center justify-center gap-1 ${isNylaWinner ? 'text-emerald-600' : 'text-red-500'}`}>
                    {isNylaWinner ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {formatCurrency(Math.abs(profitDifference))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Winner Banner + Sustainability - Compact Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Winner Banner */}
            {hasCompetitorData && isNylaWinner && (
              <Card className="border-emerald-400 dark:border-emerald-600 bg-gradient-to-r from-emerald-50 dark:from-emerald-900/30 to-transparent">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-full">
                    <Trophy className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Extra Monthly Earnings with Nyla</p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(Math.abs(profitDifference))}
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-emerald-400 ml-auto" />
                </CardContent>
              </Card>
            )}

            {/* Sustainability Impact - Compact */}
            <Card className="border-teal-300 dark:border-teal-700 bg-gradient-to-r from-teal-50 dark:from-teal-900/20 to-transparent">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-cyan-100 dark:bg-cyan-900/50 rounded-full">
                      <Droplets className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Monthly Saved</p>
                      <p className="text-lg font-bold text-cyan-700 dark:text-cyan-300">
                        {groundwaterSavedMonthly.toLocaleString('en-IN', { maximumFractionDigits: 0 })}L
                      </p>
                    </div>
                  </div>
                  <div className="h-8 w-px bg-border" />
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-full">
                      <Leaf className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Yearly Saved</p>
                      <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                        {(groundwaterSavedYearly / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })}KL
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-teal-600 dark:text-teal-400 mt-2">
                  Groundwater preserved by choosing Nyla Air Water
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Summary - Only show when no competitor data */}
          {!hasCompetitorData && (
            <Card className="border-dashed border-2">
              <CardContent className="p-6 text-center">
                <Scale className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground">Enter competitor's buying and selling price to see the comparison</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
