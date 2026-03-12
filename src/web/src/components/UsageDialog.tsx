import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  BarChart3,
  Users,
  Cpu,
  Layers,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  fetchUsageStats,
  type UsageStats,
  type DailyUsage,
  type GroupedUsage,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function shortDate(d: string): string {
  // "2026-03-12" → "03/12"
  const parts = d.split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : d;
}

/** Shorten UUID-like keys: "d12cd4d5-65c1-434d-9f23-..." → "d12cd4d5…" */
function shortKey(key: string): string {
  // UUID pattern
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(key)) {
    return key.slice(0, 8) + "…";
  }
  if (key.length > 16) return key.slice(0, 16) + "…";
  return key;
}

// ---------------------------------------------------------------------------
// Bar chart (pure CSS, no deps)
// ---------------------------------------------------------------------------

function MiniBar({ items, maxVal }: { items: { label: string; value: number; color: string }[]; maxVal: number }) {
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-xs">
          <span className="w-28 truncate text-muted-foreground text-right shrink-0">{item.label}</span>
          <div className="flex-1 h-4 bg-muted/40 rounded overflow-hidden">
            <div
              className="h-full rounded transition-all"
              style={{
                width: maxVal > 0 ? `${Math.max((item.value / maxVal) * 100, 1)}%` : "0%",
                backgroundColor: item.color,
              }}
            />
          </div>
          <span className="w-14 text-right font-mono text-foreground shrink-0">{fmtTokens(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily table
// ---------------------------------------------------------------------------

function DailyTable({ daily }: { daily: DailyUsage[] }) {
  if (daily.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">暂无数据</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] text-muted-foreground border-b border-border/30">
          <th className="text-left font-normal py-1.5 pl-2">日期</th>
          <th className="text-right font-normal py-1.5 pr-1">Input</th>
          <th className="text-right font-normal py-1.5 pr-1">Output</th>
          <th className="text-right font-normal py-1.5 pr-1">Total</th>
          <th className="text-right font-normal py-1.5 pr-1">Cache R</th>
          <th className="text-right font-normal py-1.5 pr-2">请求</th>
        </tr>
      </thead>
      <tbody>
        {daily.slice(0, 14).map((d) => (
          <tr key={d.date} className="hover:bg-muted/30 transition-colors">
            <td className="py-1.5 pl-2 font-mono text-muted-foreground">{shortDate(d.date)}</td>
            <td className="py-1.5 pr-1 text-right font-mono">
              <span className="inline-flex items-center gap-0.5 text-primary">
                <ArrowUpRight className="w-3 h-3 shrink-0" />
                {fmtTokens(d.input_tokens)}
              </span>
            </td>
            <td className="py-1.5 pr-1 text-right font-mono">
              <span className="inline-flex items-center gap-0.5 text-secondary">
                <ArrowDownRight className="w-3 h-3 shrink-0" />
                {fmtTokens(d.output_tokens)}
              </span>
            </td>
            <td className="py-1.5 pr-1 text-right font-mono text-foreground font-medium">
              {fmtTokens(d.total_tokens)}
            </td>
            <td className="py-1.5 pr-1 text-right font-mono text-muted-foreground">
              {fmtTokens(d.cache_read)}
            </td>
            <td className="py-1.5 pr-2 text-right font-mono text-muted-foreground">
              {d.requests}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Grouped breakdown
// ---------------------------------------------------------------------------

const COLORS = [
  "oklch(0.72 0.13 50)",   // primary orange
  "oklch(0.59 0.04 196)",  // teal
  "oklch(0.65 0.15 280)",  // purple
  "oklch(0.75 0.12 140)",  // green
  "oklch(0.68 0.10 30)",   // warm
  "oklch(0.60 0.08 220)",  // blue
];

function GroupedBreakdown({ items, label }: { items: GroupedUsage[]; label: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">暂无 {label} 数据</p>;
  }
  const maxVal = Math.max(...items.map((i) => i.total_tokens), 1);
  const barItems = items.map((item, idx) => ({
    label: shortKey(item.key),
    value: item.total_tokens,
    color: COLORS[idx % COLORS.length],
  }));

  return (
    <div className="space-y-4">
      <MiniBar items={barItems} maxVal={maxVal} />
      <table className="w-full text-xs table-fixed">
        <thead>
          <tr className="text-[10px] text-muted-foreground border-b border-border/30">
            <th className="text-left font-normal py-1.5 pl-2 w-[35%]">{label}</th>
            <th className="text-right font-normal py-1.5 w-[16%]">Input</th>
            <th className="text-right font-normal py-1.5 w-[16%]">Output</th>
            <th className="text-right font-normal py-1.5 w-[16%]">Total</th>
            <th className="text-right font-normal py-1.5 pr-2 w-[12%]">请求</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.key} className="hover:bg-muted/30 transition-colors">
              <td className="py-1.5 pl-2 text-muted-foreground truncate overflow-hidden" title={item.key}>{shortKey(item.key)}</td>
              <td className="py-1.5 text-right font-mono text-primary">{fmtTokens(item.input_tokens)}</td>
              <td className="py-1.5 text-right font-mono text-secondary">{fmtTokens(item.output_tokens)}</td>
              <td className="py-1.5 text-right font-mono text-foreground font-medium">{fmtTokens(item.total_tokens)}</td>
              <td className="py-1.5 pr-2 text-right font-mono text-muted-foreground">{item.requests}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

interface UsageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UsageDialog({ open, onOpenChange }: UsageDialogProps) {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUsageStats(days);
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const t = stats?.totals;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[90vw] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Token 用量统计
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground -mr-2 -mt-1"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <DialogDescription>
            扫描 OpenClaw 会话日志，按天/Agent/Provider/Model 聚合
          </DialogDescription>
        </DialogHeader>

        {/* Period selector + refresh */}
        <div className="flex items-center gap-2 pb-2">
          {[7, 14, 30, 90].map((d) => (
            <Button
              key={d}
              variant={days === d ? "default" : "outline"}
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setDays(d)}
            >
              {d}天
            </Button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-auto text-muted-foreground"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </Button>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>
        )}

        {loading && !stats && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            扫描中…
          </div>
        )}

        {stats && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-3 bg-card/50 border-border/30">
                <p className="text-[10px] text-muted-foreground mb-1">总 Token</p>
                <p className="text-lg font-bold text-foreground">{fmtTokens(t?.total_tokens ?? 0)}</p>
                <div className="flex gap-2 text-[10px] mt-0.5">
                  <span className="text-primary flex items-center"><ArrowUpRight className="w-2.5 h-2.5" />{fmtTokens(t?.input_tokens ?? 0)}</span>
                  <span className="text-secondary flex items-center"><ArrowDownRight className="w-2.5 h-2.5" />{fmtTokens(t?.output_tokens ?? 0)}</span>
                </div>
              </Card>
              <Card className="p-3 bg-card/50 border-border/30">
                <p className="text-[10px] text-muted-foreground mb-1">请求数</p>
                <p className="text-lg font-bold text-foreground">{t?.requests ?? 0}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t?.sessions_scanned ?? 0} 会话</p>
              </Card>
              <Card className="p-3 bg-card/50 border-border/30">
                <p className="text-[10px] text-muted-foreground mb-1">费用</p>
                <p className="text-lg font-bold text-foreground">{fmtCost(t?.cost ?? 0)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t?.days ?? 0} 天</p>
              </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="daily" className="flex flex-col flex-1">
              <TabsList variant="line" className="w-full mb-3">
                <TabsTrigger value="daily" className="gap-1 text-xs">
                  <BarChart3 className="w-3 h-3" />每日
                </TabsTrigger>
                <TabsTrigger value="agent" className="gap-1 text-xs">
                  <Users className="w-3 h-3" />Agent
                </TabsTrigger>
                <TabsTrigger value="provider" className="gap-1 text-xs">
                  <Cpu className="w-3 h-3" />Provider
                </TabsTrigger>
                <TabsTrigger value="model" className="gap-1 text-xs">
                  <Layers className="w-3 h-3" />Model
                </TabsTrigger>
              </TabsList>

              <TabsContent value="daily">
                <DailyTable daily={stats.daily} />
              </TabsContent>
              <TabsContent value="agent">
                <GroupedBreakdown items={stats.by_agent} label="Agent" />
              </TabsContent>
              <TabsContent value="provider">
                <GroupedBreakdown items={stats.by_provider} label="Provider" />
              </TabsContent>
              <TabsContent value="model">
                <GroupedBreakdown items={stats.by_model} label="Model" />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
