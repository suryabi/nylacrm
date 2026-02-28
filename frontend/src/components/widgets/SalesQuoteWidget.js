import React from 'react';
import { Card } from '../ui/card';
import { TrendingUp, Quote } from 'lucide-react';

const SALES_QUOTES = [
  { quote: "Every sale has five basic obstacles: no need, no money, no hurry, no desire, no trust.", author: "Zig Ziglar" },
  { quote: "Success is not the key to happiness. Happiness is the key to success.", author: "Albert Schweitzer" },
  { quote: "The best salespeople are the ones who put themselves in their customer's shoes.", author: "Unknown" },
  { quote: "Sales are contingent upon the attitude of the salesman, not the attitude of the prospect.", author: "W. Clement Stone" },
  { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { quote: "Your attitude, not your aptitude, will determine your altitude.", author: "Zig Ziglar" },
  { quote: "The difference between a successful person and others is not lack of strength or knowledge, but lack of will.", author: "Vince Lombardi" },
  { quote: "I have never worked a day in my life without selling. If I believe in something, I sell it.", author: "Estée Lauder" },
  { quote: "Approach each customer with the idea of helping them solve a problem.", author: "Brian Tracy" },
  { quote: "Motivation will almost always beat mere talent.", author: "Norman Ralph Augustine" },
  { quote: "Our greatest weakness lies in giving up. The most certain way to succeed is always to try just one more time.", author: "Thomas Edison" },
  { quote: "Quality performance starts with a positive attitude.", author: "Jeffrey Gitomer" },
  { quote: "Become the person who would attract the results you seek.", author: "Jim Cathcart" },
  { quote: "Don't find customers for your products, find products for your customers.", author: "Seth Godin" },
  { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { quote: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau" },
  { quote: "It's not about having the right opportunities. It's about handling the opportunities right.", author: "Mark Hunter" },
  { quote: "People don't buy for logical reasons. They buy for emotional reasons.", author: "Zig Ziglar" },
  { quote: "You don't close a sale; you open a relationship.", author: "Patricia Fripp" },
  { quote: "The key is not to call the decision maker. The key is to have the decision maker call you.", author: "Jeffrey Gitomer" },
  { quote: "Sales success comes after you stretch yourself past your limits on a daily basis.", author: "Omar Periu" },
  { quote: "Make a customer, not a sale.", author: "Katherine Barchetti" },
  { quote: "Pretend that every single person you meet has a sign around their neck that says 'Make me feel important.'", author: "Mary Kay Ash" },
  { quote: "Stop selling. Start helping.", author: "Zig Ziglar" },
  { quote: "In sales, a referral is the key to the door of resistance.", author: "Bo Bennett" },
  { quote: "The golden rule for every businessman is to put yourself in your customer's place.", author: "Orison Swett Marden" },
  { quote: "Great salespeople are relationship builders who provide value and help their customers win.", author: "Jeffrey Gitomer" },
  { quote: "Nobody counts the number of ads you run; they just remember the impression you make.", author: "William Bernbach" },
  { quote: "If you are not taking care of your customer, your competitor will.", author: "Bob Hooey" },
  { quote: "Either you run the day or the day runs you.", author: "Jim Rohn" },
  { quote: "Success is walking from failure to failure with no loss of enthusiasm.", author: "Winston Churchill" },
];

export default function SalesQuoteWidget() {
  // Get quote based on day of year (changes daily, offset to be different from water quote)
  const getDailyQuote = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    // Add offset of 15 to show different quote than water widget
    return SALES_QUOTES[(dayOfYear + 15) % SALES_QUOTES.length];
  };

  const dailyQuote = getDailyQuote();

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
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/50 dark:to-orange-900/30 shadow-sm">
            <TrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </div>
          <span className="text-xs font-semibold text-orange-700 dark:text-orange-400 uppercase tracking-wider">Daily Sales Inspiration</span>
        </div>
        
        {/* Quote */}
        <div className="relative">
          <Quote className="absolute -top-1 -left-1 h-6 w-6 text-orange-300 dark:text-orange-700 opacity-50" />
          <blockquote className="pl-6 pr-2">
            <p className="text-base lg:text-lg font-medium text-slate-700 dark:text-slate-200 leading-relaxed italic">
              "{dailyQuote.quote}"
            </p>
            <footer className="mt-3 text-sm text-orange-600 dark:text-orange-400 font-medium">
              — {dailyQuote.author}
            </footer>
          </blockquote>
        </div>
      </div>
    </Card>
  );
}
