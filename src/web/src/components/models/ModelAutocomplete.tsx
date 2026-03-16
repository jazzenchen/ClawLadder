// Reusable searchable model selector with autocomplete dropdown
import { useState, useRef, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useClickOutside } from "@/hooks/useClickOutside";

export interface ModelOption {
  id: string;
  name?: string;
}

export interface ModelAutocompleteProps {
  models: ModelOption[];
  value: string;
  placeholder: string;
  onChange: (val: string) => void;
  label?: string;
  /** text size class, defaults to "text-xs" */
  textSize?: string;
}

export function ModelAutocomplete({
  models,
  value,
  placeholder,
  onChange,
  label = "Model ID",
  textSize = "text-xs",
}: ModelAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);

  const filtered = models.filter(
    (m) =>
      !value ||
      (m.name || m.id).toLowerCase().includes(value.toLowerCase()) ||
      m.id.toLowerCase().includes(value.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label className="text-xs">{label}</Label>}
      <div className="relative" ref={ref}>
        <div className="flex items-center border border-input rounded-lg bg-transparent dark:bg-input/30">
          <input
            ref={inputRef}
            className={`flex-1 h-8 px-2.5 ${textSize} bg-transparent outline-none placeholder:text-muted-foreground`}
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              if (!open && models.length > 0) setOpen(true);
            }}
            onFocus={() => {
              if (models.length > 0) setOpen(true);
            }}
          />
          {models.length > 0 && (
            <span
              className="pr-3 text-muted-foreground cursor-pointer select-none"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen((v) => !v);
                inputRef.current?.focus();
              }}
            >
              <ChevronDown className="w-3 h-3" />
            </span>
          )}
        </div>
        {open && filtered.length > 0 && (
          <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-md">
            {filtered.map((m) => (
              <div
                key={m.id}
                className={`px-3 py-1.5 ${textSize} cursor-pointer hover:bg-accent ${m.id === value ? "bg-accent/50" : ""}`}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                {m.name || m.id}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
