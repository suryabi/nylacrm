import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Separator } from '../components/ui/separator';
import { Badge } from '../components/ui/badge';
import { Scale, TrendingUp, TrendingDown, Percent, DollarSign, RotateCcw } from 'lucide-react';

const NYLA_LOGO = 'https://customer-assets.emergentagent.com/job_pipeline-master-14/artifacts/6tqxvtds_WhatsApp%20Image%202026-02-04%20at%2011.26.46%20PM.jpeg';

// Default Nyla values
const DEFAULT_NYLA = {
  buyingPrice: 11,
  percentageGST: 18,
  sellingPrice: 20,
  percentageReturn: 100,
  returnCredit: 5
};

export default function SalesPortal() {
  // Competitor (Your Brand) state
  const [competitor, setCompetitor] = useState({
    buyingPrice: '',
    percentageGST: 18,
    sellingPrice: '',
    percentageReturn: 100,
    returnCredit: 5
  });

  // Nyla state with defaults
  const [nyla, setNyla] = useState(DEFAULT_NYLA);

  // Calculated values for competitor
  const [competitorCalc, setCompetitorCalc] = useState({
    landingPrice: 0,
    profitMargin: 0,
    profitMarginPerUnit: 0,
    totalReturnCredit: 0,
    totalProfitMargin: 0,
    totalProfitMarginPerUnit: 0
  });

  // Calculated values for Nyla
  const [nylaCalc, setNylaCalc] = useState({
    landingPrice: 0,
    profitMargin: 0,
    profitMarginPerUnit: 0,
    totalReturnCredit: 0,
    totalProfitMargin: 0,
    totalProfitMarginPerUnit: 0
  });

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
      </div>

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

      {/* Comparison Summary */}
      {(competitor.buyingPrice && competitor.sellingPrice) && (
        <Card className="border-slate-200">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              Comparison Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 rounded-lg bg-slate-50">
                <p className="text-sm text-muted-foreground mb-1">Profit Margin Difference</p>
                <p className={`text-2xl font-bold ${
                  parseFloat(nylaCalc.totalProfitMargin) > parseFloat(competitorCalc.totalProfitMargin) 
                    ? 'text-emerald-600' : 'text-red-600'
                }`}>
                  {parseFloat(nylaCalc.totalProfitMargin) > parseFloat(competitorCalc.totalProfitMargin) ? '+' : ''}
                  {(parseFloat(nylaCalc.totalProfitMargin) - parseFloat(competitorCalc.totalProfitMargin)).toFixed(2)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {parseFloat(nylaCalc.totalProfitMargin) > parseFloat(competitorCalc.totalProfitMargin) 
                    ? 'Nyla offers better margins' : 'Competitor offers better margins'}
                </p>
              </div>

              <div className="text-center p-4 rounded-lg bg-slate-50">
                <p className="text-sm text-muted-foreground mb-1">Profit Per Unit Difference</p>
                <p className={`text-2xl font-bold ${
                  parseFloat(nylaCalc.totalProfitMarginPerUnit) > parseFloat(competitorCalc.totalProfitMarginPerUnit) 
                    ? 'text-emerald-600' : 'text-red-600'
                }`}>
                  {parseFloat(nylaCalc.totalProfitMarginPerUnit) > parseFloat(competitorCalc.totalProfitMarginPerUnit) ? '+' : ''}
                  ₹{(parseFloat(nylaCalc.totalProfitMarginPerUnit) - parseFloat(competitorCalc.totalProfitMarginPerUnit)).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Per bottle profit difference
                </p>
              </div>

              <div className="text-center p-4 rounded-lg bg-slate-50">
                <p className="text-sm text-muted-foreground mb-1">Return Credit Advantage</p>
                <p className={`text-2xl font-bold ${
                  parseFloat(nylaCalc.totalReturnCredit) > parseFloat(competitorCalc.totalReturnCredit) 
                    ? 'text-emerald-600' : 'text-red-600'
                }`}>
                  {parseFloat(nylaCalc.totalReturnCredit) > parseFloat(competitorCalc.totalReturnCredit) ? '+' : ''}
                  ₹{(parseFloat(nylaCalc.totalReturnCredit) - parseFloat(competitorCalc.totalReturnCredit)).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Bottle return credit difference
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
