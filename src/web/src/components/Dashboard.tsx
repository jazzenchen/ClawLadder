import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  RotateCcw,
  Square,
  Zap,
  MessageSquare,
  Cpu,
  Radio,
  Shield,
  Database,
  ArrowUpRight,
  ArrowDownRight,
  Wrench,
  Power,
  Play,
  Download,
  Trash2,
  CheckCircle2,
  Info,
  PieChart,
  Activity,
  Puzzle,
  Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import {
  fetchGatewayStatus,
  fetchGatewayUrl,
  fetchOpenClawStatus,
  fetchUsageStats,
  fetchSkills,
  fetchHooks,
  fetchUserModels,
  gatewayInstall,
  gatewayStart,
  gatewayRestart,
  gatewayStop,
  gatewayUninstall,
  gatewayOpenDashboard,
  runDoctor,
  type GatewayStatus,
  type GatewayUrl,
  type OpenClawStatus,
  type DeviceInfo,
  type UsageStats,
  type UserModelsInfo,
} from "@/lib/api";
import { UsageDialog } from "@/components/UsageDialog";
import { SessionsDialog } from "@/components/SessionsDialog";
import { AuditDialog, type AuditFinding } from "@/components/AuditDialog";
import { HealthDialog } from "@/components/HealthDialog";
import { ModelsDialog } from "@/components/ModelsDialog";
import { ChannelsDialog } from "@/components/ChannelsDialog";
import { ExtensionsDialog } from "@/components/ExtensionsDialog";
import { MemoryDialog } from "@/components/MemoryDialog";
import { DeviceDialog } from "@/components/DeviceDialog";

interface DashboardProps {
  installed: boolean;
  version?: string;
  onResetConfig: () => void;
  deviceInfo?: DeviceInfo | null;
}

async function openExternal(url: string) {
  try {
    const w = window as unknown as Record<string, unknown>;
    if (w.__TAURI_INTERNALS__) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_url", { url });
      return;
    }
  } catch {
    // Not in Tauri — fallback
  }
  window.open(url, "_blank");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { formatTokens, formatAge } from "../lib/format";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  icon,
  label,
  value,
  valueLabel,
  subtext,
  accent,
  className,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueLabel?: string;
  subtext?: React.ReactNode;
  accent?: "primary" | "success" | "destructive" | "warning";
  className?: string;
  detail?: React.ReactNode;
  onClick?: () => void;
}) {
  const accentColors = {
    primary: "text-primary",
    success: "text-success",
    destructive: "text-destructive",
    warning: "text-yellow-500",
  };

  return (
    <Card
      className={cn(
        "relative p-3 bg-card/50 border-border/30 hover:bg-card/80 transition-colors",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        {detail && (
          <HoverCard>
            <HoverCardTrigger className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60 transition-colors cursor-pointer">
              <Info className="w-3 h-3" />
            </HoverCardTrigger>
            <HoverCardContent side="bottom" align="end" className="w-64 p-3 text-xs">
              {detail}
            </HoverCardContent>
          </HoverCard>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-xl font-bold",
            accent ? accentColors[accent] : "text-foreground"
          )}
        >
          {value}
        </span>
        {valueLabel && (
          <span
            className={cn(
              "text-sm",
              accent ? accentColors[accent] : "text-foreground"
            )}
          >
            {valueLabel}
          </span>
        )}
      </div>
      {subtext && <div className="text-muted-foreground mt-1">{subtext}</div>}
    </Card>
  );
}


// (InfoRow and DetailRow removed — details now shown in dedicated Dialogs)

function ActionButton({
  icon,
  label,
  onClick,
  variant,
  disabled,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  variant?: "destructive";
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "flex-col h-auto py-3 px-4 gap-1.5 min-w-[80px] border-border/30",
        variant === "destructive" &&
          "border-destructive/30 text-destructive hover:bg-destructive/10",
        (disabled || loading) && "opacity-40 cursor-not-allowed"
      )}
    >
      {icon}
      <span className="text-xs">{loading ? "执行中…" : label}</span>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function Dashboard({ installed, version, onResetConfig, deviceInfo }: DashboardProps) {
  const [gwStatus, setGwStatus] = useState<GatewayStatus | null>(null);
  const [gwUrl, setGwUrl] = useState<GatewayUrl | null>(null);
  const [ocStatus, setOcStatus] = useState<OpenClawStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingDashboard, setOpeningDashboard] = useState(false);
  const [doctorOutput, setDoctorOutput] = useState<string | null>(null);
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [sessionsDialogOpen, setSessionsDialogOpen] = useState(false);
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [healthDialogOpen, setHealthDialogOpen] = useState(false);
  const [modelsDialogOpen, setModelsDialogOpen] = useState(false);
  const [channelsDialogOpen, setChannelsDialogOpen] = useState(false);
  const [extensionsDialogOpen, setExtensionsDialogOpen] = useState(false);
  const [memoryDialogOpen, setMemoryDialogOpen] = useState(false);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [usageTotals, setUsageTotals] = useState<UsageStats["totals"] | null>(null);
  const [extensionCounts, setExtensionCounts] = useState<{ skills: number; hooks: number }>({ skills: 0, hooks: 0 });
  const [userModels, setUserModels] = useState<UserModelsInfo | null>(null);

  const [pendingAction, setPendingAction] = useState<{
    key: string;
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
    fn: () => Promise<unknown>;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [gw, url, oc] = await Promise.all([
        fetchGatewayStatus(),
        fetchGatewayUrl(),
        fetchOpenClawStatus().catch(() => null),
      ]);
      setGwStatus(gw);
      setGwUrl(url);
      setOcStatus(oc);
      // Fetch usage totals (non-blocking)
      fetchUsageStats(30).then((u) => setUsageTotals(u.totals)).catch(() => {});
      // Fetch user-configured models (non-blocking)
      fetchUserModels().then((m) => {
        setUserModels(m);
        // Auto-open models dialog if no providers configured at all
        const hasProviders = (m.providers.length > 0) || (m.envKeys.length > 0);
        if (!hasProviders) setModelsDialogOpen(true);
      }).catch(() => {});
      // Fetch extension counts (non-blocking)
      Promise.all([
        fetchSkills().then((r) => r.skills?.length ?? 0).catch(() => 0),
        fetchHooks().then((r) => r.hooks?.length ?? 0).catch(() => 0),
      ]).then(([s, h]) => setExtensionCounts({ skills: s, hooks: h }));
    } catch (e) {
      console.error("[Dashboard] refresh failed:", e);
      setError("加载状态失败，请检查服务是否正常运行");
    } finally {
      setLoading(false);
    }
  }, []);

  const isRunning = gwStatus?.running ?? false;

  useEffect(() => {
    refresh();
    const interval = setInterval(() => {
      if (!document.hidden) refresh();
    }, isRunning ? 15_000 : 5_000);
    return () => {
      clearInterval(interval);
    };
  }, [refresh, isRunning]);

  const tokenStats = useMemo(() => {
    if (!ocStatus?.sessions?.recent) return { input: 0, output: 0, total: 0 };
    const input = ocStatus.sessions.recent.reduce((s, r) => s + (r.inputTokens ?? 0), 0);
    const output = ocStatus.sessions.recent.reduce((s, r) => s + (r.outputTokens ?? 0), 0);
    return { input, output, total: input + output };
  }, [ocStatus]);

  if (loading && !gwStatus) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">加载中…</p>
      </div>
    );
  }

  const audit = ocStatus?.securityAudit?.summary;

  // Commit hash from version string (e.g. "0.1.0 (abc1234)")
  const commitMatch = version?.match(/\(([^)]+)\)/);
  const commitHash = commitMatch?.[1] ?? "";
  const versionNum = version?.replace(/\s*\([^)]*\)/, "") ?? "";

  return (
    <div className="min-h-screen bg-background page-transition">
      {/* Compact Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/30">
        <div className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🦞</span>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-bold text-foreground">OpenClaw</h1>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      isRunning
                        ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]"
                        : "bg-destructive shadow-[0_0_6px_rgba(239,68,68,0.5)]"
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs ",
                      isRunning ? "text-green-500" : "text-destructive"
                    )}
                  >
                    {isRunning ? "运行中" : "已停止"}
                  </span>
                </div>
              </div>
              {version && (
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {versionNum}{commitHash ? ` (${commitHash})` : ""}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={refresh}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              disabled={!gwUrl?.httpUrl || !isRunning || openingDashboard}
              onClick={async () => {
                setOpeningDashboard(true);
                try {
                  await gatewayOpenDashboard();
                } catch {
                  if (gwUrl?.httpUrl) openExternal(gwUrl.httpUrl);
                } finally {
                  setOpeningDashboard(false);
                }
              }}
              className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground h-8 px-3"
            >
              <span className="hidden sm:inline">打开 OpenClaw 面板</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="px-6 py-6 max-w-6xl mx-auto">
        {error && (
          <div className="mb-4 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {/* Row 1: Core metrics — 2 large cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <StatCard
            icon={<PieChart className="w-4 h-4" />}
            label="Token 用量"
            value={formatTokens(usageTotals?.total_tokens ?? tokenStats.total)}
            onClick={() => setUsageDialogOpen(true)}
            subtext={
              <span className="flex items-center gap-3 text-xs">
                <span className="flex items-center text-primary">
                  <ArrowUpRight className="w-3 h-3" />
                  {formatTokens(usageTotals?.input_tokens ?? tokenStats.input)}
                </span>
                <span className="flex items-center text-secondary">
                  <ArrowDownRight className="w-3 h-3" />
                  {formatTokens(usageTotals?.output_tokens ?? tokenStats.output)}
                </span>
                <span className="text-muted-foreground">
                  {usageTotals?.sessions_scanned ?? ocStatus?.sessions?.count ?? 0} 会话
                </span>
              </span>
            }
            accent="primary"
          />
          <StatCard
            icon={<Activity className="w-4 h-4" />}
            label="系统健康"
            value={(() => {
              let total = 0;
              let pass = 0;
              // Gateway running
              total++;
              if (isRunning) pass++;
              // Channels configured
              const chCount = ocStatus?.channelSummary?.filter(l => !l.startsWith("  ")).length ?? 0;
              if (chCount > 0) { total++; pass++; }
              // RPC reachable — prefer gwStatus.rpc_ok (gateway status --json probe)
              // over ocStatus.gateway.reachable (status --usage --json, may lack scope)
              total++;
              const rpcOk = gwStatus?.rpc_ok || ocStatus?.gateway?.reachable;
              if (rpcOk) pass++;
              return `${pass}/${total}`;
            })()}
            onClick={() => setHealthDialogOpen(true)}
            subtext={
              <span className="flex items-center gap-2 text-xs">
                <span className={cn("flex items-center gap-1", isRunning ? "text-green-500" : "text-destructive")}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", isRunning ? "bg-green-500" : "bg-destructive")} />
                  网关{isRunning ? "运行中" : "已停止"}
                </span>
                {isRunning && !gwStatus?.rpc_ok && ocStatus?.gateway && !ocStatus.gateway.reachable && (
                  <span className="text-destructive">
                    RPC: {ocStatus.gateway.error || "不可达"}
                  </span>
                )}
                {(gwStatus?.rpc_ok || !ocStatus?.gateway || ocStatus.gateway.reachable) && (
                  <span className="text-muted-foreground">
                    端口 {gwStatus?.port ?? "—"} · PID {gwStatus?.pid ?? "—"}
                  </span>
                )}
              </span>
            }
            accent={isRunning && (gwStatus?.rpc_ok || ocStatus?.gateway?.reachable) ? "success" : "destructive"}
          />
        </div>

        {/* Row 2: 模型、通讯工具、会话 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <StatCard
            icon={<Cpu className="w-4 h-4" />}
            label="模型"
            value={(() => {
              const dp = userModels?.defaultPrimary ?? ocStatus?.sessions?.defaults?.model ?? "";
              if (!dp) return "—";
              // defaultPrimary is like "anthropic/claude-sonnet-4-20250514"
              const parts = dp.split("/");
              return parts.length > 1 ? parts.slice(1).join("/").split("-").slice(0, 2).join("-") : dp.split("-").slice(0, 2).join("-");
            })()}
            onClick={() => setModelsDialogOpen(true)}
            subtext={
              (() => {
                const dp = userModels?.defaultPrimary ?? "";
                const providerKey = dp.split("/")[0];
                const modelId = dp.split("/").slice(1).join("/");
                return dp ? (
                  <span className="flex items-center gap-2">
                    {providerKey && (
                      <span className="text-xs text-primary">{providerKey}</span>
                    )}
                    <span className="font-mono text-[10px] opacity-70 truncate">
                      {modelId || ocStatus?.sessions?.defaults?.model}
                    </span>
                  </span>
                ) : ocStatus?.sessions?.defaults?.model ? (
                  <span className="font-mono text-[10px] opacity-70">
                    {ocStatus.sessions.defaults.model}
                  </span>
                ) : undefined;
              })()
            }
          />
          <StatCard
            icon={<Radio className="w-4 h-4" />}
            label="通讯工具"
            value={String(ocStatus?.channelSummary?.filter(l => !l.startsWith("  ")).length ?? 0)}
            valueLabel="个"
            onClick={() => setChannelsDialogOpen(true)}
            subtext={
              ocStatus?.channelSummary?.[0] ? (
                <span className="text-xs">{ocStatus.channelSummary.filter(l => !l.startsWith("  ")).map(l => l.split(":")[0]).join(" · ")}</span>
              ) : undefined
            }
          />
          <StatCard
            icon={<MessageSquare className="w-4 h-4" />}
            label="会话/请求"
            value={String(ocStatus?.sessions?.count ?? 0)}
            valueLabel="会话"
            onClick={() => setSessionsDialogOpen(true)}
            subtext={
              ocStatus?.sessions?.defaults?.model ? (
                <span className="font-mono text-[10px] opacity-70">
                  {ocStatus.sessions.defaults.model.slice(0, 24)}
                </span>
              ) : undefined
            }
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {/* Row 3: 设备、扩展、记忆、审计 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard
            icon={<Monitor className="w-4 h-4" />}
            label="设备"
            value={deviceInfo?.model || "—"}
            onClick={() => setDeviceDialogOpen(true)}
            subtext={
              deviceInfo?.osVersion ? (
                <span className="text-xs truncate block max-w-full">
                  {deviceInfo.osVersion}
                </span>
              ) : (
                <span className="text-xs">暂无数据</span>
              )
            }
          />
          <StatCard
            icon={<Puzzle className="w-4 h-4" />}
            label="扩展"
            value={String(extensionCounts.skills)}
            valueLabel="技能"
            onClick={() => setExtensionsDialogOpen(true)}
            subtext={
              <span className="text-xs">{extensionCounts.hooks} 钩子</span>
            }
          />
          <StatCard
            icon={<Database className="w-4 h-4" />}
            label="记忆"
            value={String(ocStatus?.memory?.files ?? 0)}
            valueLabel="文件"
            onClick={() => setMemoryDialogOpen(true)}
            subtext={
              ocStatus?.memory ? (
                <span className="text-xs">
                  {ocStatus.memory.chunks} chunks · {ocStatus.memory.backend}
                </span>
              ) : (
                <span>暂无数据</span>
              )
            }
          />
          {audit ? (
            <StatCard
              icon={<Shield className="w-4 h-4" />}
              label="安全审计"
              value={audit.critical > 0 ? String(audit.critical) : "0"}
              valueLabel={audit.critical > 0 ? "严重" : "安全"}
              onClick={() => setAuditDialogOpen(true)}
              subtext={
                <span className="text-xs">
                  <span className={cn(audit.warn > 0 && "text-yellow-500")}>{audit.warn} 警告</span>
                  {" · "}
                  {audit.info} 信息
                </span>
              }
              accent={audit.critical > 0 ? "destructive" : audit.warn > 0 ? "warning" : "success"}
            />
          ) : (
            <StatCard
              icon={<Shield className="w-4 h-4" />}
              label="安全审计"
              value="—"
              subtext={<span>暂无数据</span>}
            />
          )}
        </div>

        {/* Doctor output */}
        {doctorOutput && (
          <Card className="mb-4 bg-card/50 border-border/30">
            <div className="p-4">
              <div className="bg-muted/50 rounded-md p-3 max-h-48 overflow-y-auto font-mono text-xs whitespace-pre-wrap">
                {doctorOutput}
              </div>
            </div>
          </Card>
        )}

        {/* Bottom Action Bar */}
        <div className="mt-6 pt-6 border-t border-border/30">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <ActionButton
              icon={<RotateCcw className="w-4 h-4" />}
              label="重启网关"
              disabled={!isRunning || !!actionLoading}
              loading={actionLoading === "gw-restart"}
              onClick={() =>
                setPendingAction({
                  key: "gw-restart",
                  title: "重启网关服务",
                  description:
                    "将重启 OpenClaw Gateway 进程。重启期间消息处理会短暂中断，通常几秒内恢复。",
                  confirmLabel: "确认重启",
                  fn: () => gatewayRestart(),
                })
              }
            />
            <ActionButton
              icon={<RefreshCw className="w-4 h-4" />}
              label="配置助手"
              disabled={!!actionLoading}
              onClick={() => onResetConfig()}
            />
            <ActionButton
              icon={<Wrench className="w-4 h-4" />}
              label="自动修复"
              disabled={!installed || !!actionLoading}
              loading={actionLoading === "doctor"}
              onClick={() =>
                setPendingAction({
                  key: "doctor",
                  title: "运行修复检查",
                  description:
                    "将运行 openclaw doctor 对系统进行全面检查，自动修复配置迁移、状态完整性、权限、网关服务等常见问题。",
                  confirmLabel: "开始检查",
                  fn: async () => {
                    setDoctorOutput(null);
                    const res = await runDoctor();
                    setDoctorOutput(
                      res.output ||
                        (res.ok ? "检查通过，无需修复。" : "修复完成，请查看输出。")
                    );
                  },
                })
              }
            />
            {!gwStatus?.installed && (
              <ActionButton
                icon={<Download className="w-4 h-4" />}
                label="注册服务"
                disabled={!installed || !!actionLoading}
                loading={actionLoading === "gw-install"}
                onClick={() =>
                  setPendingAction({
                    key: "gw-install",
                    title: "注册网关服务",
                    description:
                      "将 OpenClaw Gateway 注册为系统服务（macOS launchd / Linux systemd），注册后网关会随系统自动启动。",
                    confirmLabel: "注册",
                    fn: () => gatewayInstall(),
                  })
                }
              />
            )}
            {!isRunning && gwStatus?.installed && (
              <ActionButton
                icon={<Play className="w-4 h-4" />}
                label="启动网关"
                disabled={!!actionLoading}
                loading={actionLoading === "gw-start"}
                onClick={() =>
                  setPendingAction({
                    key: "gw-start",
                    title: "启动网关服务",
                    description:
                      "启动 OpenClaw Gateway 进程，开始处理消息和 Agent 请求。",
                    confirmLabel: "启动",
                    fn: () => gatewayStart(),
                  })
                }
              />
            )}
            {!isRunning && gwStatus?.installed && (
              <ActionButton
                icon={<Trash2 className="w-4 h-4" />}
                label="卸载服务"
                variant="destructive"
                disabled={!!actionLoading}
                loading={actionLoading === "gw-uninstall"}
                onClick={() =>
                  setPendingAction({
                    key: "gw-uninstall",
                    title: "卸载网关服务",
                    description:
                      "从系统服务中移除 OpenClaw Gateway 注册。卸载后网关不会随系统自动启动，需要手动启动。",
                    confirmLabel: "确认卸载",
                    destructive: true,
                    fn: () => gatewayUninstall(),
                  })
                }
              />
            )}
            <ActionButton
              icon={<Power className="w-4 h-4" />}
              label="停止网关"
              variant="destructive"
              disabled={!isRunning || !!actionLoading}
              loading={actionLoading === "gw-stop"}
              onClick={() =>
                setPendingAction({
                  key: "gw-stop",
                  title: "停止网关服务",
                  description:
                    "将停止 OpenClaw Gateway 进程。停止后所有消息处理、频道连接和 Agent 调用都会中断，直到重新启动。",
                  confirmLabel: "确认停止",
                  destructive: true,
                  fn: () => gatewayStop(),
                })
              }
            />
          </div>
        </div>
      </main>

      {/* Action confirmation dialog */}
      <Dialog
        open={!!pendingAction}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <DialogContent className="min-w-2xl max-w-4xl">
          <DialogHeader>
            <DialogTitle>{pendingAction?.title}</DialogTitle>
            <DialogDescription>{pendingAction?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 bg-transparent border-t-0">
            <Button
              variant="outline"
              onClick={() => setPendingAction(null)}
              disabled={!!actionLoading}
            >
              取消
            </Button>
            <Button
              variant={pendingAction?.destructive ? "destructive" : "default"}
              disabled={!!actionLoading}
              onClick={async () => {
                if (!pendingAction) return;
                const { key, fn } = pendingAction;
                setPendingAction(null);
                setActionLoading(key);
                setError(null);
                try {
                  await fn();
                  if (key !== "reset") {
                    await new Promise((r) => setTimeout(r, 1000));
                  }
                  await refresh();
                } catch (e) {
                  console.error("[Dashboard] action failed:", e);
                  setError("操作执行失败，请稍后重试");
                } finally {
                  setActionLoading(null);
                }
              }}
            >
              {actionLoading ? "执行中…" : pendingAction?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Usage stats dialog */}
      <UsageDialog open={usageDialogOpen} onOpenChange={setUsageDialogOpen} />

      {/* Sessions dialog */}
      <SessionsDialog
        open={sessionsDialogOpen}
        onOpenChange={setSessionsDialogOpen}
        sessions={ocStatus?.sessions?.recent ?? []}
        totalCount={ocStatus?.sessions?.count ?? 0}
        totalRequests={usageTotals?.requests ?? 0}
        defaults={ocStatus?.sessions?.defaults}
      />

      {/* Audit dialog */}
      <AuditDialog
        open={auditDialogOpen}
        onOpenChange={setAuditDialogOpen}
        summary={audit ?? { critical: 0, warn: 0, info: 0 }}
        findings={(ocStatus?.securityAudit as Record<string, unknown>)?.findings as AuditFinding[] ?? []}
      />

      {/* Health dialog */}
      <HealthDialog
        open={healthDialogOpen}
        onOpenChange={setHealthDialogOpen}
        gwStatus={gwStatus}
        gwUrl={gwUrl}
        rpcGateway={ocStatus?.gateway}
        channelSummary={ocStatus?.channelSummary}
      />

      {/* Models dialog */}
      <ModelsDialog
        open={modelsDialogOpen}
        onOpenChange={setModelsDialogOpen}
        defaultModel={ocStatus?.sessions?.defaults?.model}
        onRefresh={refresh}
      />

      {/* Channels dialog */}
      <ChannelsDialog open={channelsDialogOpen} onOpenChange={setChannelsDialogOpen} />

      {/* Extensions dialog */}
      <ExtensionsDialog open={extensionsDialogOpen} onOpenChange={setExtensionsDialogOpen} />

      {/* Memory dialog */}
      <MemoryDialog open={memoryDialogOpen} onOpenChange={setMemoryDialogOpen} />

      {/* Device dialog */}
      <DeviceDialog open={deviceDialogOpen} onOpenChange={setDeviceDialogOpen} deviceInfo={deviceInfo} />
    </div>
  );
}
