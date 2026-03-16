import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Loader2,
  Server,
  Radio,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fetchHealth } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gwStatus?: {
    installed: boolean;
    running: boolean;
    pid?: number;
    port?: number;
    version?: string;
    rpc_ok?: boolean;
  } | null;
  gwUrl?: {
    httpUrl: string;
    wsUrl: string;
    port: number;
    token: string;
  } | null;
  /** OpenClaw RPC gateway status (from `openclaw status`, may have scope issues) */
  rpcGateway?: {
    mode: string;
    url: string;
    reachable: boolean;
    connectLatencyMs: number;
    error?: string;
    self?: { host: string; version: string; platform: string };
  } | null;
  /** Channel summary lines from ocStatus */
  channelSummary?: string[];
}

interface ChannelProbe {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  botUsername?: string;
}

interface ChannelHealth {
  name: string;
  configured: boolean;
  probe?: ChannelProbe;
}

interface HealthResponse {
  ok: boolean;
  durationMs?: number;
  channels?: unknown; // API may return array or object keyed by name
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize the `channels` field from the health API.
 * It may be an array, an object keyed by channel name, or missing entirely.
 */
function normalizeChannels(raw: unknown): ChannelHealth[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    // Object keyed by channel name, e.g. { telegram: { configured: true, probe: {...} } }
    return Object.entries(raw).map(([name, val]) => {
      const v = val as Record<string, unknown> | undefined;
      return {
        name,
        configured: !!(v?.configured),
        probe: v?.probe as ChannelProbe | undefined,
      };
    });
  }
  return [];
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full shrink-0",
        ok ? "bg-green-500" : "bg-red-500",
      )}
    />
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Token copy button
// ---------------------------------------------------------------------------

function CopyToken({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [token]);

  const truncated = token.length > 12 ? token.slice(0, 6) + "…" + token.slice(-4) : token;

  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="text-xs bg-muted/60 px-1.5 py-0.5 rounded">{truncated}</code>
      <button
        type="button"
        onClick={copy}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="复制 Token"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section: Gateway
// ---------------------------------------------------------------------------

function GatewaySection({
  gwStatus,
  gwUrl,
}: Pick<HealthDialogProps, "gwStatus" | "gwUrl">) {
  const running = gwStatus?.running ?? false;

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2 ">
        <Server className="h-4 w-4 text-muted-foreground" />
        网关状态
        <Badge variant={running ? "default" : "destructive"} className="ml-auto text-xs">
          {running ? "运行中" : "已停止"}
        </Badge>
      </div>

      <div className="divide-y divide-border">
        <InfoRow label="状态">
          <span className="flex items-center gap-1.5">
            <StatusDot ok={running} />
            {running ? "运行中" : "已停止"}
          </span>
        </InfoRow>

        {gwStatus?.pid != null && <InfoRow label="PID">{gwStatus.pid}</InfoRow>}

        <InfoRow label="端口">{gwUrl?.port ?? gwStatus?.port ?? "—"}</InfoRow>

        <InfoRow label="地址">{gwUrl?.httpUrl ?? "—"}</InfoRow>

        {gwStatus?.version && <InfoRow label="版本">{gwStatus.version}</InfoRow>}

        {gwUrl?.token && (
          <InfoRow label="Token">
            <CopyToken token={gwUrl.token} />
          </InfoRow>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Channels
// ---------------------------------------------------------------------------

function ChannelsSection({ channels }: { channels: ChannelHealth[] }) {
  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2 ">
        <Radio className="h-4 w-4 text-muted-foreground" />
        通道连接
        <Badge variant="outline" className="ml-auto text-xs">
          {channels.length} 个通道
        </Badge>
      </div>

      {channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无通道配置</p>
      ) : (
        <div className="divide-y divide-border">
          {channels.map((ch) => (
            <div key={ch.name} className="flex items-center justify-between py-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="">{ch.name}</span>
                {ch.probe?.botUsername && (
                  <span className="text-xs text-muted-foreground">@{ch.probe.botUsername}</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {ch.configured ? "已配置" : "未配置"}
                </span>
                {ch.probe ? (
                  ch.probe.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )
                ) : (
                  <span className="h-4 w-4 text-muted-foreground">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: RPC Gateway
// ---------------------------------------------------------------------------

function RpcSection({
  rpcGateway,
  rpcOk,
}: {
  rpcGateway?: HealthDialogProps["rpcGateway"];
  rpcOk?: boolean;
}) {
  if (!rpcGateway) return null;

  // rpcOk (from gateway status --json) is the reliable probe;
  // rpcGateway.reachable (from openclaw status) may fail due to token scope issues
  const effectiveReachable = rpcOk || rpcGateway.reachable;
  const hasWarning = rpcOk && !rpcGateway.reachable && !!rpcGateway.error;

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2 ">
        <Zap className="h-4 w-4 text-muted-foreground" />
        RPC 连接
        <Badge
          variant={effectiveReachable ? "default" : "destructive"}
          className="ml-auto text-xs"
        >
          {effectiveReachable ? "可达" : "不可达"}
        </Badge>
      </div>

      <div className="divide-y divide-border">
        <InfoRow label="状态">
          <span className="flex items-center gap-1.5">
            <StatusDot ok={effectiveReachable} />
            {effectiveReachable ? "正常" : "异常"}
          </span>
        </InfoRow>

        <InfoRow label="地址">{rpcGateway.url || "—"}</InfoRow>

        <InfoRow label="模式">{rpcGateway.mode || "—"}</InfoRow>

        {rpcGateway.connectLatencyMs != null && (
          <InfoRow label="延迟">{rpcGateway.connectLatencyMs} ms</InfoRow>
        )}

        {hasWarning && (
          <div className="py-1.5">
            <span className="text-xs text-muted-foreground">警告</span>
            <div className="mt-1 rounded-md bg-yellow-500/10 px-2.5 py-1.5 text-xs text-yellow-600 dark:text-yellow-400 font-mono break-all">
              {rpcGateway.error}（RPC 探测正常，此错误来自 CLI status 命令的 scope 检查）
            </div>
          </div>
        )}

        {!effectiveReachable && rpcGateway.error && (
          <div className="py-1.5">
            <span className="text-xs text-muted-foreground">错误</span>
            <div className="mt-1 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive font-mono break-all">
              {rpcGateway.error}
            </div>
          </div>
        )}

        {rpcGateway.self && (
          <>
            <InfoRow label="主机">{rpcGateway.self.host}</InfoRow>
            <InfoRow label="远端版本">{rpcGateway.self.version}</InfoRow>
            <InfoRow label="平台">{rpcGateway.self.platform}</InfoRow>
          </>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Health Summary (pass/total)
// ---------------------------------------------------------------------------

interface HealthCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

function HealthSummarySection({ checks }: { checks: HealthCheck[] }) {
  const pass = checks.filter((c) => c.ok).length;
  const total = checks.length;

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2 ">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        健康检查
        <Badge
          variant={pass === total ? "default" : "destructive"}
          className="ml-auto text-xs"
        >
          {pass}/{total} 通过
        </Badge>
      </div>

      <div className="divide-y divide-border">
        {checks.map((c) => (
          <div key={c.label} className="flex items-start justify-between py-1.5 text-sm">
            <div className="flex items-center gap-2">
              {c.ok ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500 shrink-0" />
              )}
              <span>{c.label}</span>
            </div>
            {c.detail && (
              <span className="text-xs text-muted-foreground max-w-[50%] text-right break-all">
                {c.detail}
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Overall
// ---------------------------------------------------------------------------

function OverallSection({ ok, durationMs }: { ok: boolean; durationMs?: number }) {
  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2 ">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        总体状态
      </div>

      <div className="divide-y divide-border">
        <InfoRow label="健康">
          <span className="flex items-center gap-1.5">
            <StatusDot ok={ok} />
            {ok ? "正常" : "异常"}
          </span>
        </InfoRow>

        {durationMs != null && (
          <InfoRow label="检查耗时">{durationMs} ms</InfoRow>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Dialog
// ---------------------------------------------------------------------------

export function HealthDialog({ open, onOpenChange, gwStatus, gwUrl, rpcGateway, channelSummary }: HealthDialogProps) {
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchHealth()
      .then((data) => {
        if (!cancelled) setHealth(data as HealthResponse);
      })
      .catch((err) => {
        console.error("[HealthDialog] fetchHealth failed:", err);
        if (!cancelled) {
          // Distinguish network errors from backend errors
          const msg =
            err instanceof TypeError
              ? "无法连接到服务，请检查网关是否正在运行"
              : err?.message || "获取健康状态时发生未知错误";
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Build health checks matching the Dashboard card logic
  const healthChecks = useMemo<HealthCheck[]>(() => {
    const checks: HealthCheck[] = [];
    const running = gwStatus?.running ?? false;
    checks.push({
      label: "网关运行",
      ok: running,
      detail: running ? `PID ${gwStatus?.pid ?? "—"}` : "已停止",
    });

    const chCount = channelSummary?.filter((l) => !l.startsWith("  ")).length ?? 0;
    if (chCount > 0) {
      checks.push({
        label: "通道配置",
        ok: true,
        detail: `${chCount} 个通道`,
      });
    }

    // Prefer gwStatus.rpc_ok (reliable probe) over rpcGateway.reachable (may lack scope)
    const rpcOk = gwStatus?.rpc_ok || rpcGateway?.reachable;
    checks.push({
      label: "RPC 可达",
      ok: rpcOk ?? false,
      detail: rpcOk
        ? `${rpcGateway?.connectLatencyMs ?? "—"} ms`
        : rpcGateway?.error || "不可达",
    });

    return checks;
  }, [gwStatus, rpcGateway, channelSummary]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="min-w-2xl max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            系统健康
          </DialogTitle>
          <DialogDescription>网关、通道和模型的运行状态</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">正在检查…</span>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            获取健康状态失败：{error}
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-4">
            <HealthSummarySection checks={healthChecks} />

            <GatewaySection gwStatus={gwStatus} gwUrl={gwUrl} />

            <RpcSection rpcGateway={rpcGateway} rpcOk={gwStatus?.rpc_ok} />

            <ChannelsSection channels={normalizeChannels(health?.channels)} />

            <OverallSection ok={health?.ok ?? false} durationMs={health?.durationMs} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
