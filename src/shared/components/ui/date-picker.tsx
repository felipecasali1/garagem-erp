import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Calendar } from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";

function fmt(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function toISO(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function fromISO(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

export interface DatePickerProps {
  value?: string; // ISO yyyy-mm-dd
  onChange?: (iso: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  name?: string;
  id?: string;
  fromYear?: number;
  toYear?: number;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Selecionar data",
  disabled,
  className,
  required,
  name,
  id,
  fromYear = 1950,
  toYear = new Date().getFullYear() + 5,
}: DatePickerProps) {
  const [internal, setInternal] = React.useState<Date | undefined>(fromISO(value));
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setInternal(fromISO(value));
  }, [value]);

  const date = value !== undefined ? fromISO(value) : internal;

  const handleSelect = (d: Date | undefined) => {
    setInternal(d);
    onChange?.(d ? toISO(d) : undefined);
    if (d) setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "h-9 w-full justify-start text-left font-normal",
              !date && "text-muted-foreground",
              className,
            )}
          >
            <CalendarIcon className="h-4 w-4 opacity-60" />
            {date ? fmt(date) : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleSelect}
            captionLayout="dropdown"
            startMonth={new Date(fromYear, 0)}
            endMonth={new Date(toYear, 11)}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
      {name && <input type="hidden" name={name} value={date ? toISO(date) : ""} required={required} />}
    </>
  );
}
