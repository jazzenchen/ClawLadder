import { useState, useEffect, useCallback } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Zap,
  Hash,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import {
  fetchUsageStats,
  type UsageStats,
  type GroupedUsage,
  type UsageRecord,
} from "@/lib/api";
import { formatTokens, localShortDate } from "@/lib/format";

// ---------------------------------------------------------------------------
// Color palette for model breakdown bars
// ---------------------------------------------------------------------------

const MODEL_COLORS = [
  "#f97316", // orange
  "#3b82f6", // blue
  "#22c55e", // green
  "#a855f7", // purple
  "#ec4899", // pink
  "#eab308", // yellow
  "#06b6d4", // cyan
  "#ef4444", // red
];

// ---------------------------------------------------------------------------
// Recharts AreaChart config
// ---------------------------------------------------------------------------

const chartConfig = {
  input_tokens: {
    label: "Input",
    color: "#f97316",
  },
  output_tokens: {
    label: "Output",
    color: "#3b82f6",
  },
} satisfies ChartConfig;

// ---------------------------------------------------------------------------
// Model Breakdown bar chart
// ---------------------------------------------------------------------------

function ModelBreakdown({ models }: { models: GroupedUsage[] }) {
  if (models.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">暂无模型数据</p>;
  }

  const total = models.reduce((s, m) => s + m.total_tokens, 0) || 1;
  const sorted = [...models].sort((a, b) => b.total_tokens - a.total_tokens);

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      {sorted.map((m, i) => {
        const pct = Math.round((m.total_tokens / total) * 100);
        const color = MODEL_COLORS[i % MODEL_COLORS.length];
        return (
          <div key={m.key} className="min-w-[140px] flex-1 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground truncate max-w-[140px]" title={m.key}>
                {m.key}
              </span>
              <span className="font-semibold ml-2 shrink-0" style={{ color }}>
                {pct}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">{formatTokens(m.total_tokens)} tokens</p>
          </div>
        );
      })}
    </div>
  );
}

// DailyTable removed — bottom section shows per-request records

// ---------------------------------------------------------------------------
// Per-request records table
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

function RecordsTable({ records }: { records: UsageRecord[] }) {
  const [page, setPage] = useState(0);

  if (records.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-8">暂无请求数据</p>;
  }

  const totalPages = Math.ceil(records.length / PAGE_SIZE);
  const slice = records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const fmtTime = (ts: string) => {
    // epoch ms (pure digits) → Date; otherwise ISO string
    const d = /^\d+$/.test(ts) ? new Date(Number(ts)) : new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="min-w-0">
      <div className="overflow-auto max-h-[320px]">
        <table className="w-full table-fixed text-xs">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border/30 text-muted-foreground">
              <th className="text-left py-2 px-2  w-[15%]">时间</th>
              <th className="text-left py-2 px-2  w-[14%]">会话</th>
              <th className="text-left py-2 px-2  w-[20%]">模型</th>
              <th className="text-left py-2 px-2  w-[12%]">Provider</th>
              <th className="text-right py-2 px-2  w-[10%]">Input</th>
              <th className="text-right py-2 px-2  w-[10%]">Output</th>
              <th className="text-right py-2 px-2  w-[9%]">Cache</th>
              <th className="text-right py-2 px-2  w-[10%]">合计</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={`${r.session_id}-${i}`} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                <td className="py-2 px-2 text-muted-foreground truncate" title={fmtTime(r.timestamp)}>{fmtTime(r.timestamp)}</td>
                <td className="py-2 px-2 font-mono truncate" title={r.session_id}>
                  {r.session_id.length > 12 ? r.session_id.slice(0, 12) + "…" : r.session_id}
                </td>
                <td className="py-2 px-2 truncate" title={r.model}>{r.model}</td>
                <td className="py-2 px-2 truncate" title={r.provider}>{r.provider}</td>
                <td className="py-2 px-2 text-right" style={{ color: "#f97316" }}>{formatTokens(r.input_tokens)}</td>
                <td className="py-2 px-2 text-right" style={{ color: "#3b82f6" }}>{formatTokens(r.output_tokens)}</td>
                <td className="py-2 px-2 text-right text-muted-foreground">{formatTokens(r.cache_read + r.cache_write)}</td>
                <td className="py-2 px-2 text-right ">{formatTokens(r.input_tokens + r.output_tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 px-1">
          <span className="text-xs text-muted-foreground">
            共 {records.length} 条 · 第 {page + 1}/{totalPages} 页
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>
      )}
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
  const [days, setDays] = useState(1);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const usage = await fetchUsageStats(d);
      setStats(usage);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load(days);
  }, [open, days, load]);

  const dayOptions = [
    { label: "24h", value: 1 },
    { label: "3d", value: 3 },
    { label: "7d", value: 7 },
    { label: "30d", value: 30 },
    { label: "全部", value: 365 },
  ];

  const totals = stats?.totals;
  const modelCount = stats?.by_model?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-2xl max-w-4xl max-h-[85vh] overflow-y-auto overflow-x-hidden p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div>
            <h2 className="text-lg font-bold text-foreground">Token 用量总览</h2>
            <p className="text-xs text-muted-foreground mt-0.5">按日期和会话查看 Token 使用详情</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Day range pills */}
            <div className="flex items-center bg-muted/30 rounded-lg p-0.5">
              {dayOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={cn(
                    "px-3 py-1 text-xs rounded-md transition-colors",
                    days === opt.value
                      ? "bg-primary text-primary-foreground "
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setDays(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => load(days)}
              disabled={loading}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Row 1: Stat cards */}
          <div className="grid grid-cols-3 gap-3">
            {/* Tokens */}
            <Card className="p-4 bg-card/50 border-border/30">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Zap className="w-4 h-4 text-orange-500" />
                <span className="text-xs uppercase tracking-wide ">Tokens</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {formatTokens(totals?.total_tokens ?? 0)}
              </p>
              <div className="flex items-center gap-3 mt-1.5 text-xs">
                <span className="flex items-center gap-0.5" style={{ color: "#f97316" }}>
                  <ArrowUpRight className="w-3 h-3" />
                  {formatTokens(totals?.input_tokens ?? 0)} in
                </span>
                <span className="flex items-center gap-0.5" style={{ color: "#3b82f6" }}>
                  <ArrowDownRight className="w-3 h-3" />
                  {formatTokens(totals?.output_tokens ?? 0)} out
                </span>
              </div>
            </Card>

            {/* Requests */}
            <Card className="p-4 bg-card/50 border-border/30">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Hash className="w-4 h-4 text-green-500" />
                <span className="text-xs uppercase tracking-wide ">请求数</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {totals?.requests ?? 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1.5">
                {totals?.sessions_scanned ?? 0} 个会话 · {totals?.days ?? 0} 天
              </p>
            </Card>

            {/* Models */}
            <Card className="p-4 bg-card/50 border-border/30">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Layers className="w-4 h-4 text-purple-500" />
                <span className="text-xs uppercase tracking-wide ">模型</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {modelCount}
              </p>
              <p className="text-xs text-muted-foreground mt-1.5">
                {stats?.by_provider?.length ?? 0} 个 Provider
              </p>
            </Card>
          </div>

          {/* Row 2: Token trend chart (full width, recharts) */}
          <Card className="p-4 bg-card/50 border-border/30">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-foreground">Token 趋势</span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">加载中…</div>
            ) : days === 1 ? (
              // Hourly chart for 24h view
              (stats?.hourly?.length ?? 0) === 0 ? (
                <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">暂无数据</div>
              ) : (
                <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
                  <AreaChart data={stats?.hourly ?? []}>
                    <defs>
                      <linearGradient id="fillInput" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-input_tokens)" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="var(--color-input_tokens)" stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="fillOutput" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-output_tokens)" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="var(--color-output_tokens)" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="hour"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      ticks={Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`)}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={4}
                      width={45}
                      tickFormatter={(v: number) => formatTokens(v)}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(value) => `${value}`}
                          indicator="dot"
                        />
                      }
                    />
                    <Area
                      dataKey="input_tokens"
                      type="monotone"
                      fill="url(#fillInput)"
                      stroke="var(--color-input_tokens)"
                    />
                    <Area
                      dataKey="output_tokens"
                      type="monotone"
                      fill="url(#fillOutput)"
                      stroke="var(--color-output_tokens)"
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                  </AreaChart>
                </ChartContainer>
              )
            ) : (stats?.daily?.length ?? 0) === 0 ? (
              <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">暂无数据</div>
            ) : (
              <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
                <AreaChart data={[...(stats?.daily ?? [])].sort((a, b) => a.date.localeCompare(b.date))}>
                  <defs>
                    <linearGradient id="fillInput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-input_tokens)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--color-input_tokens)" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="fillOutput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-output_tokens)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--color-output_tokens)" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={32}
                    tickFormatter={(value) => localShortDate(value)}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={4}
                    width={45}
                    tickFormatter={(v: number) => formatTokens(v)}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value) => localShortDate(value)}
                        indicator="dot"
                      />
                    }
                  />
                  <Area
                    dataKey="input_tokens"
                    type="monotone"
                    fill="url(#fillInput)"
                    stroke="var(--color-input_tokens)"
                  />
                  <Area
                    dataKey="output_tokens"
                    type="monotone"
                    fill="url(#fillOutput)"
                    stroke="var(--color-output_tokens)"
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>
            )}
          </Card>

          {/* Row 3: Model Breakdown (responsive wrap) */}
          <Card className="p-4 bg-card/50 border-border/30">
            <span className="text-sm font-semibold text-foreground">模型分布</span>
            <div className="mt-3">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-4">加载中…</p>
              ) : (
                <ModelBreakdown models={stats?.by_model ?? []} />
              )}
            </div>
          </Card>

          {/* Row 4: Per-request records table */}
          <Card className="bg-card/50 border-border/30 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <span className="text-sm font-semibold text-foreground">请求明细</span>
              <span className="text-xs text-muted-foreground">{stats?.records?.length ?? 0} 条记录</span>
            </div>
            <div className="px-4 pb-4">
              {loading ? (
                <p className="text-center text-sm text-muted-foreground py-8">加载中…</p>
              ) : (
                <RecordsTable records={stats?.records ?? []} />
              )}
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
