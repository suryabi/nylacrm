import React from 'react';
import { cn } from '../lib/utils';
import { Star, TrendingUp, Target, Clock, Search } from 'lucide-react';

// Lead rank configuration with colors and descriptions
export const LEAD_RANKS = {
  'A+': {
    label: 'A+',
    description: 'Strategic Account',
    color: 'bg-violet-500',
    bgLight: 'bg-violet-50',
    border: 'border-violet-500',
    text: 'text-violet-700',
    textDark: 'text-violet-600',
    icon: Star,
    ringColor: 'ring-violet-500',
  },
  'A': {
    label: 'A',
    description: 'High Probability',
    color: 'bg-emerald-500',
    bgLight: 'bg-emerald-50',
    border: 'border-emerald-500',
    text: 'text-emerald-700',
    textDark: 'text-emerald-600',
    icon: TrendingUp,
    ringColor: 'ring-emerald-500',
  },
  'B': {
    label: 'B',
    description: 'Good Opportunity',
    color: 'bg-blue-500',
    bgLight: 'bg-blue-50',
    border: 'border-blue-500',
    text: 'text-blue-700',
    textDark: 'text-blue-600',
    icon: Target,
    ringColor: 'ring-blue-500',
  },
  'C': {
    label: 'C',
    description: 'Low Probability',
    color: 'bg-amber-500',
    bgLight: 'bg-amber-50',
    border: 'border-amber-500',
    text: 'text-amber-700',
    textDark: 'text-amber-600',
    icon: Clock,
    ringColor: 'ring-amber-500',
  },
  'D': {
    label: 'D',
    description: 'Research / Long Term',
    color: 'bg-slate-400',
    bgLight: 'bg-slate-50',
    border: 'border-slate-400',
    text: 'text-slate-600',
    textDark: 'text-slate-500',
    icon: Search,
    ringColor: 'ring-slate-400',
  },
};

// Helper function to get rank config
export const getRankConfig = (rank) => {
  return LEAD_RANKS[rank] || null;
};

// Compact badge for lists and kanban
export function LeadRankBadge({ rank, size = 'sm', showDescription = false }) {
  const config = getRankConfig(rank);
  if (!config) return null;
  
  const Icon = config.icon;
  
  if (size === 'xs') {
    return (
      <span 
        className={cn(
          "inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-white",
          config.color
        )}
        title={`${config.label}: ${config.description}`}
      >
        {config.label}
      </span>
    );
  }
  
  return (
    <span 
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
        config.bgLight,
        config.text
      )}
      title={config.description}
    >
      <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white", config.color)}>
        {config.label}
      </span>
      {showDescription && <span className="ml-1">{config.description}</span>}
    </span>
  );
}

// Full tile selector for lead detail page
export default function LeadRankingTiles({ currentRank, onRankChange, disabled = false, saving = false }) {
  const ranks = ['A+', 'A', 'B', 'C', 'D'];
  
  return (
    <div className="flex items-center gap-4">
      <h3 className="text-sm font-medium text-muted-foreground whitespace-nowrap">Lead Ranking</h3>
      {saving && <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>}
      <div className="flex gap-2 flex-1" data-testid="lead-ranking-tiles">
        {ranks.map((rank) => {
          const config = LEAD_RANKS[rank];
          const Icon = config.icon;
          const isSelected = currentRank === rank;
          
          return (
            <button
              key={rank}
              onClick={() => !disabled && onRankChange(rank)}
              disabled={disabled}
              className={cn(
                "relative flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200",
                "hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1",
                config.ringColor,
                isSelected 
                  ? `${config.border} ${config.bgLight} border-2` 
                  : "border-gray-200 bg-gray-50/50 hover:bg-gray-100/50",
                disabled && "opacity-50 cursor-not-allowed"
              )}
              data-testid={`rank-tile-${rank}`}
            >
              {/* Rank Badge */}
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0",
                config.color
              )}>
                {rank}
              </div>
              
              {/* Description */}
              <div className="text-left min-w-0">
                <span className={cn(
                  "text-xs font-medium block leading-tight",
                  isSelected ? config.textDark : "text-gray-600"
                )}>
                  {config.description}
                </span>
              </div>
              
              {/* Selected indicator */}
              {isSelected && (
                <div className={cn(
                  "absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center",
                  config.color
                )}>
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
