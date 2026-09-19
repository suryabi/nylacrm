import React, { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';

// Type-to-search select. options: [{ id, name, sub }]. Matches anywhere in name/sub (partial, case-insensitive).
export const SearchCombobox = ({ options, value, onChange, placeholder = 'All', allLabel, icon: Icon, disabled = false, className = '', testId }) => {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => String(o.id) === String(value));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} disabled={disabled}
          className={`h-[42px] w-full justify-between rounded-xl border-slate-200/80 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm hover:border-violet-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 ${className}`}
          data-testid={`${testId}-trigger`}>
          <span className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" />}
            <span className={`truncate ${current ? '' : 'text-slate-500'}`}>{current ? current.name : placeholder}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {current && <span role="button" aria-label="Clear" className="inline-flex" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onChange('all'); }} data-testid={`${testId}-clear`}><X className="h-3.5 w-3.5 text-slate-400 hover:text-rose-600" /></span>}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[16rem] p-0" align="start">
        <Command filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase().trim()) ? 1 : 0)}>
          <CommandInput placeholder="Type to search…" data-testid={`${testId}-input`} autoFocus />
          <CommandList className="max-h-72">
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {allLabel && (
                <CommandItem value="__all__" onSelect={() => { onChange('all'); setOpen(false); }} data-testid={`${testId}-option-all`}>
                  <Check className={`mr-2 h-4 w-4 ${!current ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="text-slate-500">{allLabel}</span>
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem key={o.id} value={`${o.name} ${o.sub || ''} ${o.id}`} onSelect={() => { onChange(String(o.id) === String(value) ? 'all' : o.id); setOpen(false); }} data-testid={`${testId}-option-${o.id}`}>
                  <Check className={`mr-2 h-4 w-4 shrink-0 ${String(o.id) === String(value) ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="truncate">{o.name}</span>
                  {o.sub && <span className="ml-auto shrink-0 pl-2 text-[11px] text-slate-400">{o.sub}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
