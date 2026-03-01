import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const DatePicker = React.forwardRef(({ 
  value, 
  onChange, 
  placeholder = "Select date",
  className,
  disabled = false,
  clearable = true,
  minDate,
  maxDate,
  ...props 
}, ref) => {
  const [open, setOpen] = React.useState(false)
  
  const handleSelect = (date) => {
    onChange?.(date)
    setOpen(false)
  }
  
  const handleClear = (e) => {
    e.stopPropagation()
    onChange?.(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal h-10",
            "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700",
            "hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600",
            "focus:ring-2 focus:ring-primary/20 focus:border-primary",
            "transition-all duration-200",
            !value && "text-muted-foreground",
            className
          )}
          {...props}
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
          <span className="flex-1">
            {value ? format(value, "PPP") : placeholder}
          </span>
          {clearable && value && (
            <X 
              className="h-4 w-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 ml-2" 
              onClick={handleClear}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-xl" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleSelect}
          disabled={(date) => {
            if (minDate && date < minDate) return true
            if (maxDate && date > maxDate) return true
            return false
          }}
          initialFocus
          className="rounded-lg"
        />
      </PopoverContent>
    </Popover>
  )
})

DatePicker.displayName = "DatePicker"

// Date Range Picker Component
const DateRangePicker = React.forwardRef(({ 
  value, 
  onChange, 
  placeholder = "Select date range",
  className,
  disabled = false,
  ...props 
}, ref) => {
  const [open, setOpen] = React.useState(false)
  
  const handleSelect = (range) => {
    onChange?.(range)
    if (range?.from && range?.to) {
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal h-10",
            "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700",
            "hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600",
            "focus:ring-2 focus:ring-primary/20 focus:border-primary",
            "transition-all duration-200",
            !value?.from && "text-muted-foreground",
            className
          )}
          {...props}
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
          {value?.from ? (
            value.to ? (
              <>
                {format(value.from, "LLL dd, y")} - {format(value.to, "LLL dd, y")}
              </>
            ) : (
              format(value.from, "LLL dd, y")
            )
          ) : (
            placeholder
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-xl" align="start">
        <Calendar
          mode="range"
          selected={value}
          onSelect={handleSelect}
          numberOfMonths={2}
          initialFocus
          className="rounded-lg"
        />
      </PopoverContent>
    </Popover>
  )
})

DateRangePicker.displayName = "DateRangePicker"

export { DatePicker, DateRangePicker }
