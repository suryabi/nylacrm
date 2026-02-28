import React, { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Droplets, Quote, RefreshCw } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function WaterQuoteWidget() {
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchQuote = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/quotes/water`);
      const data = await response.json();
      setQuote(data);
    } catch (error) {
      console.error('Failed to fetch water quote:', error);
      setQuote({
        quote: "Water is the driving force of all nature.",
        author: "Leonardo da Vinci"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuote();
  }, []);

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-cyan-50 via-sky-50 to-blue-50 dark:from-cyan-950/40 dark:via-sky-950/30 dark:to-blue-950/20 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-500 group">
      {/* Animated water wave background */}
      <div className="absolute inset-0 overflow-hidden opacity-20 dark:opacity-10">
        <svg className="absolute bottom-0 left-0 right-0" viewBox="0 0 1440 120" preserveAspectRatio="none">
          <path 
            fill="currentColor" 
            className="text-cyan-400 dark:text-cyan-600"
            d="M0,64L48,69.3C96,75,192,85,288,80C384,75,480,53,576,48C672,43,768,53,864,58.7C960,64,1056,64,1152,58.7C1248,53,1344,43,1392,37.3L1440,32L1440,120L1392,120C1344,120,1248,120,1152,120C1056,120,960,120,864,120C768,120,672,120,576,120C480,120,384,120,288,120C192,120,96,120,48,120L0,120Z"
          >
            <animate 
              attributeName="d" 
              dur="10s" 
              repeatCount="indefinite"
              values="M0,64L48,69.3C96,75,192,85,288,80C384,75,480,53,576,48C672,43,768,53,864,58.7C960,64,1056,64,1152,58.7C1248,53,1344,43,1392,37.3L1440,32L1440,120L1392,120C1344,120,1248,120,1152,120C1056,120,960,120,864,120C768,120,672,120,576,120C480,120,384,120,288,120C192,120,96,120,48,120L0,120Z;
                      M0,32L48,42.7C96,53,192,75,288,80C384,85,480,75,576,64C672,53,768,43,864,48C960,53,1056,75,1152,80C1248,85,1344,75,1392,69.3L1440,64L1440,120L1392,120C1344,120,1248,120,1152,120C1056,120,960,120,864,120C768,120,672,120,576,120C480,120,384,120,288,120C192,120,96,120,48,120L0,120Z;
                      M0,64L48,69.3C96,75,192,85,288,80C384,75,480,53,576,48C672,43,768,53,864,58.7C960,64,1056,64,1152,58.7C1248,53,1344,43,1392,37.3L1440,32L1440,120L1392,120C1344,120,1248,120,1152,120C1056,120,960,120,864,120C768,120,672,120,576,120C480,120,384,120,288,120C192,120,96,120,48,120L0,120Z"
            />
          </path>
        </svg>
      </div>
      
      {/* Gradient top accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-500" />
      
      {/* Decorative droplet */}
      <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity duration-500">
        <Droplets className="h-24 w-24 text-cyan-500 dark:text-cyan-400" />
      </div>
      
      <div className="relative p-5" data-testid="water-quote-widget">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-100 to-sky-100 dark:from-cyan-900/50 dark:to-sky-900/30 shadow-sm">
              <Droplets className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 uppercase tracking-wider">Daily Water Wisdom</span>
          </div>
          <button 
            onClick={fetchQuote}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-cyan-100 dark:hover:bg-cyan-900/30 transition-colors disabled:opacity-50"
            title="Get new quote"
          >
            <RefreshCw className={`h-4 w-4 text-cyan-600 dark:text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        {/* Quote */}
        <div className="relative min-h-[80px]">
          {loading ? (
            <div className="flex items-center justify-center h-[80px]">
              <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : quote ? (
            <>
              <Quote className="absolute -top-1 -left-1 h-6 w-6 text-cyan-300 dark:text-cyan-700 opacity-50" />
              <blockquote className="pl-6 pr-2">
                <p className="text-base lg:text-lg font-medium text-slate-700 dark:text-slate-200 leading-relaxed italic">
                  "{quote.quote}"
                </p>
                <footer className="mt-3 text-sm text-cyan-600 dark:text-cyan-400 font-medium">
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
