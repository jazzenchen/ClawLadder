import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  RotateCcw,
  Square,
  Zap,
  MessageSquare,
  Bot,
  Clock,
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
} from "@/lib/api";
import { UsageDialog } from "@/components/UsageDialog";

interface DashboardProps {
  installed: boolean;
  version?: string;
  onResetConfig: () => void;
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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatAge(ms: number | null): string {
  if (ms == null) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

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
  accent?: "primary" | "success" | "destructive";
  className?: string;
  detail?: React.ReactNode;
  onClick?: () => void;
}) {
  const accentColors = {
    primary: "text-primary",
    success: "text-success",
    destructive: "text-destructive",
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

function InfoRow({
  label,
  value,
  status,
  mono,
}: {
  label: string;
  value: string;
  status?: "success" | "error" | "inactive";
  mono?: boolean;
}) {
  const statusTextColor =
    status === "success"
      ? "text-green-500"
      : status === "error"
        ? "text-destructive"
        : "";

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        {status &&
          (status === "success" ? (
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
          ) : status === "error" ? (
            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
          ))}
        <span className={cn(
          status ? statusTextColor : "text-foreground",
          mono && "font-mono text-xs"
        )}>
          {value}
        </span>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  className: valueClassName,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-foreground font-mono truncate text-right", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

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

export function Dashboard({ installed, version, onResetConfig }: DashboardProps) {
  const [gwStatus, setGwStatus] = useState<GatewayStatus | null>(null);
  const [gwUrl, setGwUrl] = useState<GatewayUrl | null>(null);
  const [ocStatus, setOcStatus] = useState<OpenClawStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [openingDashboard, setOpeningDashboard] = useState(false);
  const [doctorOutput, setDoctorOutput] = useState<string | null>(null);
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const isRunning = gwStatus?.running ?? false;

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
                      "text-xs font-medium",
                      isRunning ? "text-green-500" : "text-destructive"
                    )}
                  >
                    {isRunning ? "Running" : "Stopped"}
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
              <span className="hidden sm:inline">打开面板</span>
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

        {/* Stats Grid - 4 columns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard
            icon={<PieChart className="w-4 h-4" />}
            label="Token 用量"
            value={formatTokens(tokenStats.total)}
            onClick={() => setUsageDialogOpen(true)}
            subtext={
              <span className="flex items-center gap-2 text-xs">
                <span className="flex items-center text-primary">
                  <ArrowUpRight className="w-3 h-3" />
                  {formatTokens(tokenStats.input)}
                </span>
                <span className="flex items-center text-secondary">
                  <ArrowDownRight className="w-3 h-3" />
                  {formatTokens(tokenStats.output)}
                </span>
              </span>
            }
            accent="primary"
            detail={
              <div className="space-y-1.5">
                <p className="font-medium text-foreground mb-2">Token 用量详情</p>
                <DetailRow label="总计" value={tokenStats.total.toLocaleString()} />
                <DetailRow label="上行 (input)" value={tokenStats.input.toLocaleString()} />
                <DetailRow label="下行 (output)" value={tokenStats.output.toLocaleString()} />
                {ocStatus?.sessions?.recent && ocStatus.sessions.recent.length > 0 && (
                  <>
                    <div className="border-t border-border/30 my-1.5" />
                    <DetailRow label="Cache read" value={ocStatus.sessions.recent.reduce((s, r) => s + (r.cacheRead ?? 0), 0).toLocaleString()} />
                    <DetailRow label="Cache write" value={ocStatus.sessions.recent.reduce((s, r) => s + (r.cacheWrite ?? 0), 0).toLocaleString()} />
                  </>
                )}
              </div>
            }
          />
          <StatCard
            icon={<MessageSquare className="w-4 h-4" />}
            label="会话数"
            value={String(ocStatus?.sessions?.count ?? 0)}
            subtext={
              ocStatus?.sessions?.defaults?.model ? (
                <span className="font-mono text-[10px] opacity-70">
                  {ocStatus.sessions.defaults.model.slice(0, 24)}
                </span>
              ) : undefined
            }
            detail={ocStatus?.sessions ? (
              <div className="space-y-1.5">
                <p className="font-medium text-foreground mb-2">会话详情</p>
                <DetailRow label="总会话数" value={String(ocStatus.sessions.count)} />
                <DetailRow label="默认模型" value={ocStatus.sessions.defaults?.model ?? "—"} />
                <DetailRow label="默认 Context" value={`${formatTokens(ocStatus.sessions.defaults?.contextTokens ?? 0)} tokens`} />
              </div>
            ) : undefined}
          />
          <StatCard
            icon={<Bot className="w-4 h-4" />}
            label="Agent"
            value={String(ocStatus?.agents?.agents?.length ?? 0)}
            subtext={
              ocStatus?.agents?.agents?.[0] ? (
                <span>
                  {ocStatus.agents.agents[0].id} ·{" "}
                  {formatAge(ocStatus.agents.agents[0].lastActiveAgeMs)} ago
                </span>
              ) : undefined
            }
            detail={ocStatus?.agents?.agents && ocStatus.agents.agents.length > 0 ? (
              <div className="space-y-1.5">
                <p className="font-medium text-foreground mb-2">Agent 详情</p>
                <DetailRow label="总会话数" value={String(ocStatus.agents.totalSessions)} />
                <DetailRow label="默认 Agent" value={ocStatus.agents.defaultId} />
                {ocStatus.agents.agents.map((a) => (
                  <div key={a.id} className="border-t border-border/30 pt-1.5 mt-1.5 space-y-0.5">
                    <DetailRow label="ID" value={a.id} />
                    <DetailRow label="工作目录" value={a.workspaceDir.split("/").slice(-2).join("/")} />
                    <DetailRow label="会话数" value={String(a.sessionsCount)} />
                    <DetailRow label="最近活跃" value={a.lastActiveAgeMs != null ? `${formatAge(a.lastActiveAgeMs)} ago` : "—"} />
                  </div>
                ))}
              </div>
            ) : undefined}
          />
          <StatCard
            icon={<Clock className="w-4 h-4" />}
            label="网关延迟"
            value={
              ocStatus?.gateway?.reachable
                ? `${ocStatus.gateway.connectLatencyMs}ms`
                : "—"
            }
            subtext={
              <span>
                端口 {gwStatus?.port ?? "—"} · PID {gwStatus?.pid ?? "—"}
              </span>
            }
            accent="success"
            detail={ocStatus?.gateway ? (
              <div className="space-y-1.5">
                <p className="font-medium text-foreground mb-2">网关详情</p>
                <DetailRow label="模式" value={ocStatus.gateway.mode} />
                <DetailRow label="URL" value={ocStatus.gateway.url} />
                <DetailRow label="可达" value={ocStatus.gateway.reachable ? "是" : "否"} />
                <DetailRow label="延迟" value={`${ocStatus.gateway.connectLatencyMs}ms`} />
                {ocStatus.gateway.self && (
                  <>
                    <div className="border-t border-border/30 my-1.5" />
                    <DetailRow label="Host" value={ocStatus.gateway.self.host} />
                    <DetailRow label="版本" value={ocStatus.gateway.self.version} />
                    <DetailRow label="平台" value={ocStatus.gateway.self.platform} />
                  </>
                )}
              </div>
            ) : undefined}
          />
        </div>

        {/* Second row - 3 columns */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <StatCard
            icon={<Radio className="w-4 h-4" />}
            label="通讯工具"
            value={String(ocStatus?.channelSummary?.length ?? 0)}
            subtext={
              ocStatus?.channelSummary?.[0] ? (
                <span>{ocStatus.channelSummary[0]}</span>
              ) : undefined
            }
            detail={ocStatus?.channelSummary && ocStatus.channelSummary.length > 0 ? (
              <div className="space-y-1.5">
                <p className="font-medium text-foreground mb-2">通讯工具列表</p>
                {ocStatus.channelSummary.map((ch, i) => (
                  <DetailRow key={i} label={`#${i + 1}`} value={ch} />
                ))}
              </div>
            ) : undefined}
          />
          {audit ? (
            <StatCard
              icon={<Shield className="w-4 h-4" />}
              label="安全审计"
              value={String(audit.critical)}
              valueLabel="严重"
              subtext={
                <span>
                  {audit.warn} 警告 · {audit.info} 信息
                </span>
              }
              accent="destructive"
              detail={
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground mb-2">安全审计详情</p>
                  <DetailRow label="严重" value={String(audit.critical)} className="text-destructive" />
                  <DetailRow label="警告" value={String(audit.warn)} className="text-yellow-500" />
                  <DetailRow label="信息" value={String(audit.info)} />
                </div>
              }
            />
          ) : (
            <StatCard
              icon={<Shield className="w-4 h-4" />}
              label="安全审计"
              value="—"
              subtext={<span>暂无数据</span>}
            />
          )}
          <StatCard
            icon={<Database className="w-4 h-4" />}
            label="记忆"
            value={String(ocStatus?.memory?.files ?? 0)}
            valueLabel="文件"
            subtext={
              ocStatus?.memory ? (
                <span>
                  {ocStatus.memory.chunks} chunks · {ocStatus.memory.backend}
                </span>
              ) : (
                <span>暂无数据</span>
              )
            }
            className="col-span-2 sm:col-span-1"
            detail={ocStatus?.memory ? (
              <div className="space-y-1.5">
                <p className="font-medium text-foreground mb-2">记忆详情</p>
                <DetailRow label="文件数" value={String(ocStatus.memory.files)} />
                <DetailRow label="Chunks" value={String(ocStatus.memory.chunks)} />
                <DetailRow label="后端" value={ocStatus.memory.backend} />
              </div>
            ) : undefined}
          />
        </div>

        {/* Main content - two columns */}
        <div className="grid sm:grid-cols-5 gap-4">
          {/* Left: Recent Sessions */}
          <Card className="sm:col-span-3 bg-card/50 border-border/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/30">
              <h3 className="text-sm font-medium text-foreground">最近会话</h3>
            </div>
            <div className="divide-y divide-border/20">
              {ocStatus?.sessions?.recent && ocStatus.sessions.recent.length > 0 ? (
                ocStatus.sessions.recent.slice(0, 5).map((s) => (
                  <div
                    key={s.sessionId}
                    className="px-4 py-3 hover:bg-secondary/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-mono text-foreground truncate">
                          {s.key.replace(/^agent:main:/, "")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatAge(s.age * 1000)} ago · {s.model.slice(0, 16)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-primary flex items-center">
                            <ArrowUpRight className="w-3 h-3" />
                            {formatTokens(s.inputTokens)}
                          </span>
                          <span className="text-secondary flex items-center">
                            <ArrowDownRight className="w-3 h-3" />
                            {formatTokens(s.outputTokens)}
                          </span>
                        </div>
                        {s.contextTokens ? (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            ctx {formatTokens(s.contextTokens)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  暂无会话记录
                </div>
              )}
            </div>
          </Card>

          {/* Right: Gateway Info */}
          <Card className="sm:col-span-2 bg-card/50 border-border/30">
            <div className="px-4 py-3 border-b border-border/30">
              <h3 className="text-sm font-medium text-foreground">网关状态</h3>
            </div>
            <div className="p-4 space-y-3">
              <InfoRow
                label="状态"
                value={isRunning ? "运行中" : "已停止"}
                status={isRunning ? "success" : "inactive"}
              />
              <InfoRow
                label="PID"
                value={gwStatus?.pid?.toString() || "—"}
                mono
              />
              <InfoRow
                label="端口"
                value={gwStatus?.port?.toString() || "—"}
                mono
              />
              <InfoRow
                label="地址"
                value={gwUrl?.wsUrl || "—"}
                mono
              />
              <InfoRow
                label="RPC"
                value={
                  ocStatus?.gateway?.reachable ? "正常" : "异常"
                }
                status={ocStatus?.gateway?.reachable ? "success" : "error"}
              />

              {/* Token */}
              {gwUrl?.token && (
                <div className="pt-3 border-t border-border/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Token</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        navigator.clipboard.writeText(gwUrl.token).then(() => {
                          setTokenCopied(true);
                          setTimeout(() => setTokenCopied(false), 2000);
                        });
                      }}
                    >
                      {tokenCopied ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                  <code className="block text-xs font-mono text-muted-foreground bg-secondary/30 px-2 py-1.5 rounded truncate">
                    {gwUrl.token}
                  </code>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Doctor output */}
        {doctorOutput && (
          <Card className="mt-4 bg-card/50 border-border/30">
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
              icon={<ExternalLink className="w-4 h-4" />}
              label="打开面板"
              disabled={!gwUrl?.httpUrl || !isRunning || openingDashboard}
              loading={openingDashboard}
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
            />
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
              label="重置配置"
              disabled={!!actionLoading}
              onClick={() =>
                setPendingAction({
                  key: "reset",
                  title: "确认重置配置？",
                  description:
                    "将清除当前所有配置并重新进入配置向导。已配置的 API Key、模型选择、频道设置等都会被覆盖。",
                  confirmLabel: "确认重置",
                  fn: async () => {
                    onResetConfig();
                  },
                })
              }
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingAction?.title}</DialogTitle>
            <DialogDescription>{pendingAction?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
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
                  setError(e instanceof Error ? e.message : String(e));
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
    </div>
  );
}
