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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Lead Ranking</h3>
        {saving && <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>}
      </div>
      <div className="grid grid-cols-5 gap-2" data-testid="lead-ranking-tiles">
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
                "relative flex flex-col items-center p-3 rounded-lg border-2 transition-all duration-200",
                "hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2",
                config.ringColor,
                isSelected 
                  ? `${config.border} ${config.bgLight} shadow-md` 
                  : "border-transparent bg-muted/30 hover:bg-muted/50",
                disabled && "opacity-50 cursor-not-allowed"
              )}
              data-testid={`rank-tile-${rank}`}
            >
              {/* Rank Badge */}
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg mb-2 transition-transform",
                config.color,
                isSelected && "scale-110"
              )}>
                {rank}
              </div>
              
              {/* Icon */}
              <Icon className={cn(
                "h-4 w-4 mb-1",
                isSelected ? config.textDark : "text-muted-foreground"
              )} />
              
              {/* Description */}
              <span className={cn(
                "text-[10px] text-center leading-tight font-medium",
                isSelected ? config.textDark : "text-muted-foreground"
              )}>
                {config.description}
              </span>
              
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
