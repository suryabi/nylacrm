import React from 'react';
import { Card } from '../ui/card';
import { Droplets, Quote } from 'lucide-react';

const WATER_QUOTES = [
  { quote: "Water is the driving force of all nature.", author: "Leonardo da Vinci" },
  { quote: "Thousands have lived without love, not one without water.", author: "W.H. Auden" },
  { quote: "Water is life, and clean water means health.", author: "Audrey Hepburn" },
  { quote: "Pure water is the world's first and foremost medicine.", author: "Slovakian Proverb" },
  { quote: "When the well is dry, we know the worth of water.", author: "Benjamin Franklin" },
  { quote: "Water is the soul of the Earth.", author: "W.H. Auden" },
  { quote: "In one drop of water are found all the secrets of all the oceans.", author: "Kahlil Gibran" },
  { quote: "Nothing is softer or more flexible than water, yet nothing can resist it.", author: "Lao Tzu" },
  { quote: "Water is the most critical resource issue of our lifetime.", author: "Rosegrant" },
  { quote: "We forget that the water cycle and the life cycle are one.", author: "Jacques Cousteau" },
  { quote: "Water links us to our neighbor in a way more profound than any other.", author: "John Thorson" },
  { quote: "The cure for anything is salt water: sweat, tears, or the sea.", author: "Isak Dinesen" },
  { quote: "Water is sacred to all human beings.", author: "Rigoberta Menchu" },
  { quote: "A drop of water is worth more than a sack of gold to a thirsty man.", author: "Unknown" },
  { quote: "By means of water, we give life to everything.", author: "Quran" },
  { quote: "Water is the mirror that has the ability to show us what we cannot see.", author: "Masaru Emoto" },
  { quote: "Heavy hearts, like heavy clouds in the sky, are best relieved by letting water out.", author: "Christopher Morley" },
  { quote: "Access to safe water is a fundamental human need.", author: "Kofi Annan" },
  { quote: "Clean water and sanitation are human rights.", author: "Pope Francis" },
  { quote: "Water is life's matter and matrix, mother and medium.", author: "Albert Szent-Gyorgyi" },
  { quote: "The water you touch in a river is the last of that which has passed, and the first of that which is coming.", author: "Leonardo da Vinci" },
  { quote: "Water sustains all.", author: "Thales of Miletus" },
  { quote: "Rivers know this: there is no hurry. We shall get there some day.", author: "A.A. Milne" },
  { quote: "Water is the best of all things.", author: "Pindar" },
  { quote: "If there is magic on this planet, it is contained in water.", author: "Loren Eiseley" },
  { quote: "We never know the worth of water till the well is dry.", author: "Thomas Fuller" },
  { quote: "Water is the one substance from which the earth can conceal nothing.", author: "Loren Eiseley" },
  { quote: "Human nature is like water. It takes the shape of its container.", author: "Wallace Stevens" },
  { quote: "Ocean is more ancient than the mountains, and freighted with the memories of time.", author: "H.P. Lovecraft" },
  { quote: "Water, in all its forms, is what makes our planet a wonderful place to live.", author: "Unknown" },
  { quote: "The world's freshwater is a shared resource that must be protected.", author: "Mikhail Gorbachev" },
];

export default function WaterQuoteWidget() {
  // Get quote based on day of year (changes daily)
  const getDailyQuote = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    return WATER_QUOTES[dayOfYear % WATER_QUOTES.length];
  };

  const dailyQuote = getDailyQuote();

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
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-100 to-sky-100 dark:from-cyan-900/50 dark:to-sky-900/30 shadow-sm">
            <Droplets className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          </div>
          <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 uppercase tracking-wider">Daily Water Wisdom</span>
        </div>
        
        {/* Quote */}
        <div className="relative">
          <Quote className="absolute -top-1 -left-1 h-6 w-6 text-cyan-300 dark:text-cyan-700 opacity-50" />
          <blockquote className="pl-6 pr-2">
            <p className="text-base lg:text-lg font-medium text-slate-700 dark:text-slate-200 leading-relaxed italic">
              "{dailyQuote.quote}"
            </p>
            <footer className="mt-3 text-sm text-cyan-600 dark:text-cyan-400 font-medium">
              — {dailyQuote.author}
            </footer>
          </blockquote>
        </div>
      </div>
    </Card>
  );
}
