import React from 'react';
import { Card } from '../ui/card';
import { Lightbulb, Sparkles } from 'lucide-react';

const FACTS = [
  { fact: "The Earth's oceans contain about 97% of all water on the planet, but only 3% of Earth's water is freshwater.", category: "Water" },
  { fact: "A single tree can absorb up to 48 pounds of carbon dioxide per year and release enough oxygen for two people.", category: "Nature" },
  { fact: "The Amazon Rainforest produces about 20% of the world's oxygen and is home to 10% of all species on Earth.", category: "Nature" },
  { fact: "Water is the only substance on Earth that naturally exists in three states: solid, liquid, and gas.", category: "Water" },
  { fact: "The deepest part of the ocean, the Mariana Trench, is deeper than Mount Everest is tall - nearly 36,000 feet deep.", category: "Ocean" },
  { fact: "Oceans absorb about 30% of the carbon dioxide produced by humans, helping to buffer climate change.", category: "Ocean" },
  { fact: "A healthy coral reef can reduce wave energy by up to 97%, protecting coastlines from storms and erosion.", category: "Ocean" },
  { fact: "The human body is about 60% water. Our brains and hearts are composed of 73% water, and lungs are about 83% water.", category: "Water" },
  { fact: "One mature tree can provide a day's supply of oxygen for up to 4 people and cool the air by up to 10°F.", category: "Nature" },
  { fact: "The ocean produces over 50% of the world's oxygen through phytoplankton, seaweed, and other marine plants.", category: "Ocean" },
  { fact: "It takes about 2,700 liters of water to produce a single cotton t-shirt, from growing the cotton to manufacturing.", category: "Water" },
  { fact: "Forests cover about 31% of the world's land area and are home to 80% of terrestrial biodiversity.", category: "Nature" },
  { fact: "The Great Barrier Reef is the largest living structure on Earth, visible from space, spanning over 2,300 kilometers.", category: "Ocean" },
  { fact: "A dripping faucet can waste up to 3,000 gallons of water per year - enough for 180 showers.", category: "Water" },
  { fact: "Mangrove forests can store up to 4 times more carbon than tropical rainforests, making them vital for climate.", category: "Nature" },
  { fact: "The Antarctic ice sheet contains about 70% of the world's fresh water locked in ice.", category: "Water" },
  { fact: "Seagrass meadows can capture carbon 35 times faster than tropical rainforests, despite covering less area.", category: "Ocean" },
  { fact: "A single honeybee colony can pollinate 300 million flowers each day, essential for one-third of our food.", category: "Nature" },
  { fact: "Water can dissolve more substances than any other liquid, earning it the title 'universal solvent'.", category: "Water" },
  { fact: "The Pacific Ocean is larger than all of Earth's landmass combined, covering more than 60 million square miles.", category: "Ocean" },
  { fact: "Old-growth forests can take 200+ years to develop and support ecosystems that cannot exist anywhere else.", category: "Nature" },
  { fact: "Hot water freezes faster than cold water in certain conditions - a phenomenon called the Mpemba effect.", category: "Water" },
  { fact: "Whale poop fertilizes ocean surface waters, supporting phytoplankton that produces oxygen we breathe.", category: "Ocean" },
  { fact: "A single large oak tree can release up to 40,000 gallons of water into the atmosphere in one year.", category: "Nature" },
  { fact: "Less than 1% of all the water on Earth is available for human use - the rest is saltwater or frozen.", category: "Water" },
  { fact: "The ocean floor has mountain ranges, valleys, and plains just like land - some underwater peaks are taller than Everest.", category: "Ocean" },
  { fact: "Bamboo is the fastest-growing plant on Earth, capable of growing up to 35 inches in a single day.", category: "Nature" },
  { fact: "It takes 1,800 gallons of water to produce one pound of beef, including water for the animal and its feed.", category: "Water" },
  { fact: "Blue whales are the largest animals ever known to exist, with hearts the size of a small car.", category: "Ocean" },
  { fact: "Trees communicate and share nutrients through underground fungal networks called the 'Wood Wide Web'.", category: "Nature" },
  { fact: "If all the ice in Antarctica melted, sea levels would rise by about 200 feet worldwide.", category: "Water" },
];

export default function DidYouKnowWidget() {
  // Get fact based on day of year (changes daily)
  const getDailyFact = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    // Add offset of 7 to show different content than quote widgets
    return FACTS[(dayOfYear + 7) % FACTS.length];
  };

  const dailyFact = getDailyFact();

  const getCategoryColor = (category) => {
    switch (category) {
      case 'Water': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300';
      case 'Ocean': return 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300';
      case 'Nature': return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300';
      default: return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300';
    }
  };

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 dark:from-emerald-950/40 dark:via-green-950/30 dark:to-teal-950/20 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-500 group">
      {/* Animated leaf/nature pattern background */}
      <div className="absolute inset-0 overflow-hidden opacity-10 dark:opacity-5">
        <div className="absolute -top-4 -right-4 w-32 h-32 rounded-full bg-emerald-400/30 blur-2xl" />
        <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-teal-400/30 blur-2xl" />
      </div>
      
      {/* Gradient top accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-green-500 to-teal-500" />
      
      {/* Decorative icon */}
      <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity duration-500">
        <Lightbulb className="h-24 w-24 text-emerald-500 dark:text-emerald-400" />
      </div>
      
      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/3 w-1.5 h-1.5 bg-emerald-400/40 rounded-full animate-bounce" style={{ animationDelay: '0s', animationDuration: '3s' }} />
        <div className="absolute top-1/2 right-1/4 w-2 h-2 bg-green-400/30 rounded-full animate-bounce" style={{ animationDelay: '1s', animationDuration: '4s' }} />
        <div className="absolute bottom-1/3 left-1/4 w-1.5 h-1.5 bg-teal-400/40 rounded-full animate-bounce" style={{ animationDelay: '2s', animationDuration: '3.5s' }} />
      </div>
      
      <div className="relative p-5" data-testid="did-you-know-widget">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/50 dark:to-green-900/30 shadow-sm">
              <Lightbulb className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Did You Know?</span>
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${getCategoryColor(dailyFact.category)}`}>
            {dailyFact.category}
          </span>
        </div>
        
        {/* Fact */}
        <div className="relative">
          <Sparkles className="absolute -top-1 -left-1 h-5 w-5 text-emerald-300 dark:text-emerald-700 opacity-50" />
          <div className="pl-5 pr-2">
            <p className="text-base lg:text-lg font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
              {dailyFact.fact}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
