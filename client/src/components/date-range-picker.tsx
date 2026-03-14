import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  subWeeks, subMonths, format, isEqual, startOfDay
} from "date-fns";
import type { DateRange } from "react-day-picker";

interface DatePreset {
  label: string;
  getValue: () => DateRange;
}

const presets: DatePreset[] = [
  { label: "Today", getValue: () => ({ from: startOfDay(new Date()), to: startOfDay(new Date()) }) },
  { label: "Yesterday", getValue: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
  { label: "Today and yesterday", getValue: () => ({ from: subDays(new Date(), 1), to: new Date() }) },
  { label: "Last 7 days", getValue: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: "Last 14 days", getValue: () => ({ from: subDays(new Date(), 13), to: new Date() }) },
  { label: "Last 28 days", getValue: () => ({ from: subDays(new Date(), 27), to: new Date() }) },
  { label: "Last 30 days", getValue: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: "This week", getValue: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 0 }), to: new Date() }) },
  { label: "Last week", getValue: () => ({ from: startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 0 }), to: endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 0 }) }) },
  { label: "This month", getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: "Last month", getValue: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
  { label: "Maximum", getValue: () => ({ from: undefined, to: undefined }) },
];

interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
}

export function DateRangePicker({ dateRange, onDateRangeChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(dateRange);
  const [activePreset, setActivePreset] = useState<string | null>("Maximum");

  const handlePresetClick = (preset: DatePreset) => {
    const range = preset.getValue();
    setActivePreset(preset.label);
    if (preset.label === "Maximum") {
      setPendingRange(undefined);
    } else {
      setPendingRange(range);
    }
  };

  const handleUpdate = () => {
    if (activePreset === "Maximum" || !pendingRange?.from) {
      onDateRangeChange(undefined);
    } else {
      onDateRangeChange(pendingRange);
    }
    setOpen(false);
  };

  const handleCancel = () => {
    setPendingRange(dateRange);
    setOpen(false);
  };

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setPendingRange(dateRange);
      if (!dateRange?.from) {
        setActivePreset("Maximum");
      } else {
        setActivePreset(null);
      }
    }
    setOpen(isOpen);
  };

  const formatLabel = () => {
    if (!dateRange?.from) return "All time";
    const from = format(dateRange.from, "d MMM yyyy");
    const to = dateRange.to ? format(dateRange.to, "d MMM yyyy") : from;
    return `${from} - ${to}`;
  };

  const isPresetActive = (preset: DatePreset) => {
    if (activePreset === preset.label) return true;
    if (!pendingRange?.from && preset.label === "Maximum") return true;
    if (!pendingRange?.from) return false;
    const pv = preset.getValue();
    if (!pv.from) return !pendingRange.from;
    return (
      pendingRange.from && pv.from &&
      isEqual(startOfDay(pendingRange.from), startOfDay(pv.from)) &&
      pendingRange.to && pv.to &&
      isEqual(startOfDay(pendingRange.to), startOfDay(pv.to))
    );
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-9 font-normal" data-testid="button-date-range">
          <CalendarIcon className="w-4 h-4" />
          <span className="text-sm">{formatLabel()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" side="bottom">
        <div className="flex" data-testid="date-range-picker">
          <div className="w-48 border-r max-h-[400px] overflow-y-auto py-2">
            {presets.map(preset => (
              <button
                key={preset.label}
                className={`w-full text-left px-4 py-1.5 text-sm hover:bg-muted transition-colors flex items-center gap-2 ${
                  isPresetActive(preset)
                    ? "text-primary font-medium"
                    : "text-foreground"
                }`}
                onClick={() => handlePresetClick(preset)}
                data-testid={`preset-${preset.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div className={`w-2.5 h-2.5 rounded-full border-2 flex-shrink-0 ${
                  isPresetActive(preset) 
                    ? "border-primary bg-primary" 
                    : "border-muted-foreground/40"
                }`} />
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col">
            <div className="p-3 pb-0">
              <Calendar
                mode="range"
                selected={pendingRange}
                onSelect={(range) => {
                  setPendingRange(range);
                  setActivePreset(null);
                }}
                numberOfMonths={2}
                defaultMonth={pendingRange?.from || subMonths(new Date(), 1)}
                disabled={{ after: new Date() }}
              />
            </div>
            <div className="flex items-center justify-end gap-2 p-3 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={handleCancel} data-testid="button-date-cancel">
                Cancel
              </Button>
              <Button size="sm" onClick={handleUpdate} data-testid="button-date-update">
                Update
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
