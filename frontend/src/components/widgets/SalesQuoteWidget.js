import React, { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { TrendingUp, Quote, RefreshCw } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function SalesQuoteWidget() {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchQuote = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/quotes/sales`);
      const data = await response.json();
      setQuote(data);
    } catch (error) {
      console.error('Failed to fetch sales quote:', error);
      setQuote({
        quote: "Success is not the key to happiness. Happiness is the key to success.",
        author: "Albert Schweitzer"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuote();
  }, []);

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-rose-950/20 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-500 group">
      {/* Animated gradient background */}
      <div className="absolute inset-0 overflow-hidden">
        <div 
          className="absolute inset-0 opacity-10 dark:opacity-5"
          style={{
            background: 'radial-gradient(circle at 80% 20%, rgba(251, 146, 60, 0.3) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(244, 63, 94, 0.2) 0%, transparent 50%)',
          }}
        />
      </div>
      
      {/* Gradient top accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500" />
      
      {/* Decorative icon */}
      <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity duration-500">
        <TrendingUp className="h-24 w-24 text-orange-500 dark:text-orange-400" />
      </div>
      
      {/* Animated sparkle effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-amber-400/30 rounded-full animate-pulse" style={{ animationDelay: '0s' }} />
        <div className="absolute top-1/3 right-1/3 w-1.5 h-1.5 bg-orange-400/30 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} />
        <div className="absolute bottom-1/4 right-1/4 w-2 h-2 bg-rose-400/30 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
      </div>
      
      <div className="relative p-5" data-testid="sales-quote-widget">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/50 dark:to-orange-900/30 shadow-sm">
              <TrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <span className="text-xs font-semibold text-orange-700 dark:text-orange-400 uppercase tracking-wider">Daily Sales Inspiration</span>
          </div>
          <button 
            onClick={fetchQuote}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors disabled:opacity-50"
            title="Get new quote"
          >
            <RefreshCw className={`h-4 w-4 text-orange-600 dark:text-orange-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        {/* Quote */}
        <div className="relative min-h-[80px]">
          {loading ? (
            <div className="flex items-center justify-center h-[80px]">
              <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : quote ? (
            <>
              <Quote className="absolute -top-1 -left-1 h-6 w-6 text-orange-300 dark:text-orange-700 opacity-50" />
              <blockquote className="pl-6 pr-2">
                <p className="text-base lg:text-lg font-medium text-slate-700 dark:text-slate-200 leading-relaxed italic">
                  "{quote.quote}"
                </p>
                <footer className="mt-3 text-sm text-orange-600 dark:text-orange-400 font-medium">
                  — {quote.author}
                </footer>
              </blockquote>
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
