import React, { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Checkbox } from './checkbox';
import { cn } from '../../lib/utils';

export function MultiSelect({
  options = [],
  selected = [],
  onChange,
  placeholder = 'Select...',
  className,
  'data-testid': testId
}) {
  const [open, setOpen] = useState(false);

  const handleToggle = (value) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleSelectAll = () => {
    if (selected.length === options.length) {
      onChange([]);
    } else {
      onChange(options.map(o => o.value));
    }
  };

  const getDisplayText = () => {
    if (selected.length === 0) return placeholder;
    if (selected.length === options.length) return 'All Selected';
    if (selected.length === 1) {
      const item = options.find(o => o.value === selected[0]);
      return item?.label || selected[0];
    }
    return `${selected.length} selected`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full h-9 justify-between font-normal border-slate-200 dark:border-slate-700",
            selected.length > 0 && "text-foreground",
            className
          )}
          data-testid={testId}
        >
          <span className="truncate">{getDisplayText()}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <div className="max-h-[300px] overflow-auto">
          {/* Select/Deselect All */}
          <div 
            className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
            onClick={handleSelectAll}
          >
            <Checkbox 
              checked={selected.length === options.length && options.length > 0}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium">
              {selected.length === options.length ? 'Deselect All' : 'Select All'}
            </span>
          </div>
          
          {/* Options */}
          {options.map((option) => (
            <div
              key={option.value}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
              onClick={() => handleToggle(option.value)}
            >
              <Checkbox 
                checked={selected.includes(option.value)}
                className="h-4 w-4"
              />
              <span className="text-sm truncate">{option.label}</span>
            </div>
          ))}
          
          {options.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              No options available
            </div>
          )}
        </div>
        
        {/* Clear Selection */}
        {selected.length > 0 && (
          <div className="border-t border-slate-100 dark:border-slate-800 p-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full h-8 text-xs"
              onClick={() => { onChange([]); }}
            >
              <X className="h-3 w-3 mr-1" /> Clear Selection
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
