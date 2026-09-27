import React, { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';

// Type-to-search MULTI select. options: [{ id, name, sub }]; values: array of ids.
export const MultiSearchCombobox = ({ options, values = [], onChange, placeholder = 'All', icon: Icon, className = '', testId, maxChips = 2 }) => {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => values.includes(o.id));
  const toggle = (id) => onChange(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);
  const label = selected.length === 0 ? placeholder
    : selected.slice(0, maxChips).map((o) => o.name).join(', ') + (selected.length > maxChips ? ` +${selected.length - maxChips}` : '');
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}
          className={`h-[42px] w-full justify-between rounded-xl border-slate-200/80 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm hover:border-violet-300 hover:bg-white ${className}`}
          data-testid={`${testId}-trigger`}>
          <span className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" />}
            <span className={`truncate ${selected.length ? '' : 'text-slate-500'}`} data-testid={`${testId}-label`}>{label}</span>
            {selected.length > 0 && <span className="shrink-0 rounded-full bg-[#002FA7]/10 px-1.5 py-px text-[10px] font-semibold text-[#002FA7]" data-testid={`${testId}-count`}>{selected.length}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {selected.length > 0 && <span role="button" aria-label="Clear" className="inline-flex" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onChange([]); }} data-testid={`${testId}-clear`}><X className="h-3.5 w-3.5 text-slate-400 hover:text-rose-600" /></span>}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[18rem] p-0" align="start">
        <Command filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase().trim()) ? 1 : 0)}>
          <CommandInput placeholder="Type to search…" data-testid={`${testId}-input`} autoFocus />
          <CommandList className="max-h-72">
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const on = values.includes(o.id);
                return (
                  <CommandItem key={o.id} value={`${o.name} ${o.sub || ''} ${o.id}`} onSelect={() => toggle(o.id)} data-testid={`${testId}-option-${o.id}`} data-selected={on ? 'true' : 'false'}>
                    <span className={`mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-[#002FA7] bg-[#002FA7] text-white' : 'border-slate-300'}`}>{on && <Check className="h-3 w-3" />}</span>
                    <span className="truncate">{o.name}</span>
                    {o.sub && <span className="ml-auto shrink-0 pl-2 text-[11px] text-slate-400">{o.sub}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {selected.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
              <span>{selected.length} selected</span>
              <button type="button" className="font-medium text-[#002FA7] hover:underline" onClick={() => onChange([])} data-testid={`${testId}-clear-all`}>Clear all</button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};
