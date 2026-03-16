// Searchable provider dropdown with category grouping
import { useState, useRef, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useClickOutside } from "@/hooks/useClickOutside";
import {
  PROVIDER_GROUPS,
  type ProviderGroup,
} from "@/components/onboarding/providerMeta";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderSearchDropdownProps {
  value: string;
  displayLabel: string;
  onSelect: (providerId: string) => void;
  onSelectCustom: () => void;
  label?: string;
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const CUSTOM_GROUP: ProviderGroup = {
  groupId: "__custom__",
  label: "+ 自定义 Provider",
  category: "other",
  variants: [],
};

const DROPDOWN_CATEGORIES = [
  { label: "热门", items: PROVIDER_GROUPS.filter((g) => g.category === "popular") },
  { label: "云服务", items: PROVIDER_GROUPS.filter((g) => g.category === "cloud") },
  { label: "本地", items: PROVIDER_GROUPS.filter((g) => g.category === "local") },
  { label: "其他", items: [...PROVIDER_GROUPS.filter((g) => g.category === "other"), CUSTOM_GROUP] },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProviderSearchDropdown({
  value,
  displayLabel,
  onSelect,
  onSelectCustom,
  label = "服务商",
}: ProviderSearchDropdownProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);

  const filtered = DROPDOWN_CATEGORIES
    .map((cat) => ({
      ...cat,
      items: cat.items.filter((g) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          g.label.toLowerCase().includes(q) ||
          g.groupId.toLowerCase().includes(q) ||
          g.variants.some(
            (v) => v.label.toLowerCase().includes(q) || v.id.toLowerCase().includes(q),
          )
        );
      }),
    }))
    .filter((cat) => cat.items.length > 0);

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="relative" ref={ref}>
        <div className="flex items-center border border-input rounded-lg bg-transparent dark:bg-input/30 cursor-pointer">
          <input
            ref={inputRef}
            className="flex-1 h-8 px-2.5 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder="搜索或选择服务商…"
            value={open ? searchQuery : displayLabel}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => {
              if (!open) {
                setSearchQuery("");
                setOpen(true);
              }
            }}
          />
          <span
            className="pr-3 text-muted-foreground cursor-pointer select-none"
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen((v) => !v);
              if (!open) {
                setSearchQuery("");
                inputRef.current?.focus();
              }
            }}
          >
            <ChevronDown className="w-3 h-3" />
          </span>
        </div>
        {open && (
          <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-md">
            {filtered.length === 0 ? (
              <div className="py-3 text-center text-xs text-muted-foreground">无匹配结果</div>
            ) : (
              filtered.map((cat) => (
                <div key={cat.label}>
                  <div className="px-3 py-1 text-xs text-muted-foreground sticky top-0 bg-popover">
                    {cat.label}
                  </div>
                  {cat.items.map((g) => {
                    const isSelected = g.variants.some((v) => v.id === value);
                    return (
                      <div
                        key={g.groupId}
                        className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground ${isSelected ? "bg-accent/50" : ""}`}
                        onClick={() => {
                          if (g.groupId === "__custom__") {
                            onSelectCustom();
                          } else {
                            onSelect(g.variants[0].id);
                          }
                          setOpen(false);
                          setSearchQuery("");
                        }}
                      >
                        <span className="flex-1">
                          {g.label}
                          {g.variants.length > 1 && (
                            <span className="text-xs text-muted-foreground ml-1.5">
                              ({g.variants.length} 种接入方式)
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
