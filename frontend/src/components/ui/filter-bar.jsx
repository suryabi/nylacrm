import React from 'react';
import { Card } from './card';
import { Button } from './button';
import { Badge } from './badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';
import { Filter, X, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// Contemporary Filter Container
export function FilterContainer({ 
  children, 
  title = "Filters",
  className,
  collapsible = false,
  defaultExpanded = true,
  activeFiltersCount = 0,
  onReset,
  showReset = true,
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  return (
    <Card className={cn(
      "border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl",
      "shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50",
      "rounded-2xl overflow-hidden",
      className
    )}>
      {/* Header */}
      <div 
        className={cn(
          "flex items-center justify-between px-5 py-4",
          "border-b border-slate-100 dark:border-slate-800/50",
          "bg-gradient-to-r from-slate-50/80 to-transparent dark:from-slate-800/30 dark:to-transparent",
          collapsible && "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
        )}
        onClick={collapsible ? () => setExpanded(!expanded) : undefined}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200/50 dark:from-slate-700 dark:to-slate-800">
            <Filter className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          </div>
          <span className="font-semibold text-slate-700 dark:text-slate-300">{title}</span>
          {activeFiltersCount > 0 && (
            <Badge className="bg-primary/10 text-primary border-0 px-2 py-0.5">
              {activeFiltersCount} active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showReset && activeFiltersCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => { e.stopPropagation(); onReset?.(); }}
              className="h-8 px-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset
            </Button>
          )}
          {collapsible && (
            expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* Filter Content */}
      {(!collapsible || expanded) && (
        <div className="p-5">
          {children}
        </div>
      )}
    </Card>
  );
}

// Filter Item Wrapper
export function FilterItem({ 
  label, 
  children, 
  className,
  icon: Icon,
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </label>
      {children}
    </div>
  );
}

// Contemporary Select Filter
export function FilterSelect({
  value,
  onValueChange,
  options = [],
  placeholder = "Select...",
  className,
  disabled = false,
  "data-testid": testId,
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger 
        className={cn(
          "h-10 bg-white dark:bg-slate-900",
          "border-slate-200 dark:border-slate-700",
          "hover:border-slate-300 dark:hover:border-slate-600",
          "focus:ring-2 focus:ring-primary/20 focus:border-primary",
          "rounded-xl transition-all duration-200",
          "text-sm font-medium",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        data-testid={testId}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="rounded-xl border-slate-200 dark:border-slate-700 shadow-xl">
        {options.map((option) => (
          <SelectItem 
            key={option.value} 
            value={option.value}
            className="rounded-lg focus:bg-primary/10 focus:text-primary"
          >
            {option.icon && <option.icon className="h-4 w-4 mr-2 inline" />}
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Active Filter Tags
export function ActiveFilterTags({ filters = [], onRemove, onClearAll }) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Active:</span>
      {filters.map((filter, idx) => (
        <Badge 
          key={idx}
          variant="secondary"
          className="bg-gradient-to-r from-primary/10 to-primary/5 text-primary border-0 pl-2.5 pr-1.5 py-1 rounded-full"
        >
          <span className="text-xs font-medium">{filter.label}: {filter.value}</span>
          <button 
            onClick={() => onRemove?.(filter.key)}
            className="ml-1.5 p-0.5 rounded-full hover:bg-primary/20 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {filters.length > 1 && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onClearAll}
          className="h-6 px-2 text-xs text-slate-500 hover:text-red-500"
        >
          Clear all
        </Button>
      )}
    </div>
  );
}

// Filter Grid Layout
export function FilterGrid({ children, columns = 7, className }) {
  return (
    <div className={cn(
      "grid gap-4",
      columns === 2 && "grid-cols-1 sm:grid-cols-2",
      columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      columns === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
      columns === 5 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5",
      columns === 6 && "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
      columns === 7 && "grid-cols-2 md:grid-cols-4 lg:grid-cols-7",
      columns === 8 && "grid-cols-2 md:grid-cols-4 lg:grid-cols-8",
      className
    )}>
      {children}
    </div>
  );
}

// Search Filter with Icon
export function FilterSearch({ 
  value, 
  onChange, 
  placeholder = "Search...",
  className,
  icon: Icon,
}) {
  return (
    <div className="relative">
      {Icon && (
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full h-10 rounded-xl",
          "bg-white dark:bg-slate-900",
          "border border-slate-200 dark:border-slate-700",
          "hover:border-slate-300 dark:hover:border-slate-600",
          "focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none",
          "text-sm placeholder:text-slate-400",
          "transition-all duration-200",
          Icon ? "pl-10 pr-4" : "px-4",
          className
        )}
      />
      {value && (
        <button 
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="h-3.5 w-3.5 text-slate-400" />
        </button>
      )}
    </div>
  );
}
