import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  fetchGatewayStatus,
  fetchGatewayUrl,
  gatewayInstall,
  gatewayStart,
  gatewayRestart,
  gatewayStop,
  gatewayUninstall,
  setClawLadderStatus,
  type GatewayStatus,
  type GatewayUrl,
} from "@/lib/api";

interface DashboardProps {
  installed: boolean;
  version?: string;
  onResetConfig: () => void;
}

// ---------------------------------------------------------------------------
// WebSocket monitor hook
// ---------------------------------------------------------------------------

type WsState = "connecting" | "connected" | "disconnected" | "error";

interface WsMessage {
  ts: number;
  type: string;
  data: unknown;
}

function useGatewayWs(wsUrl: string | null) {
  const [state, setState] = useState<WsState>("disconnected");
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!wsUrl) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setState("connecting");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState("connected");
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setMessages((prev) => {
          const next = [
            ...prev,
            { ts: Date.now(), type: parsed.type || "message", data: parsed },
          ];
          return next.length > 100 ? next.slice(-100) : next;
        });
      } catch {
        setMessages((prev) => {
          const next = [
            ...prev,
            { ts: Date.now(), type: "raw", data: event.data },
          ];
          return next.length > 100 ? next.slice(-100) : next;
        });
      }
    };

    ws.onerror = () => {
      setState("error");
    };

    ws.onclose = () => {
      setState("disconnected");
      wsRef.current = null;
      // Auto-reconnect after 5s
      reconnectTimer.current = setTimeout(() => {
        connect();
      }, 5000);
    };
  }, [wsUrl]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState("disconnected");
  }, []);

  useEffect(() => {
    if (wsUrl) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [wsUrl, connect, disconnect]);

  return { state, messages, connect, disconnect };
}

// Open a URL in the system browser.
// In Tauri: calls the Rust open_url command (uses `open::that`).
// In browser: falls back to window.open.
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
// Dashboard component
// ---------------------------------------------------------------------------

export function Dashboard({ installed, version, onResetConfig }: DashboardProps) {
  const [gwStatus, setGwStatus] = useState<GatewayStatus | null>(null);
  const [gwUrl, setGwUrl] = useState<GatewayUrl | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMonitor, setShowMonitor] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [gw, url] = await Promise.all([
        fetchGatewayStatus(),
        fetchGatewayUrl(),
      ]);
      setGwStatus(gw);
      setGwUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleAction = async (
    action: string,
    fn: () => Promise<unknown>,
  ) => {
    setActionLoading(action);
    setError(null);
    try {
      await fn();
      await new Promise((r) => setTimeout(r, 1000));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(null);
    }
  };

  // WebSocket monitor
  const wsUrl = showMonitor && gwUrl?.wsUrl ? gwUrl.wsUrl : null;
  const ws = useGatewayWs(wsUrl);

  if (loading && !gwStatus) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">加载中…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🦞</span>
          <div>
            <h1 className="text-xl font-medium text-foreground">OpenClaw</h1>
            {version && (
              <p className="text-xs text-muted-foreground">{version}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? "刷新中…" : "刷新"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setShowResetConfirm(true)}
          >
            重置配置
          </Button>
          {gwUrl?.httpUrl && gwStatus?.running && (
            <Button
              size="sm"
              variant="default"
              onClick={() => openExternal(gwUrl.httpUrl)}
            >
              打开 Web UI ↗
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* Installation status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            安装状态
            <Badge variant={installed ? "default" : "destructive"}>
              {installed ? "已安装" : "未安装"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {installed
              ? `OpenClaw ${version || ""} 已安装在系统中。`
              : "OpenClaw 尚未安装，请先完成安装。"}
          </p>
        </CardContent>
      </Card>

      {/* Gateway status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Gateway 服务
            {gwStatus && (
              <Badge variant={gwStatus.running ? "default" : "secondary"}>
                {gwStatus.running ? "运行中" : "已停止"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {gwStatus && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">服务注册</span>
              <span>{gwStatus.installed ? "✅ 已注册" : "❌ 未注册"}</span>
              <span className="text-muted-foreground">运行状态</span>
              <span>{gwStatus.running ? "✅ 运行中" : "⏸ 已停止"}</span>
              {gwStatus.pid && (
                <>
                  <span className="text-muted-foreground">PID</span>
                  <span className="font-mono">{gwStatus.pid}</span>
                </>
              )}
              {gwStatus.port && (
                <>
                  <span className="text-muted-foreground">端口</span>
                  <span className="font-mono">{gwStatus.port}</span>
                </>
              )}
              {gwStatus.address && (
                <>
                  <span className="text-muted-foreground">监听地址</span>
                  <span className="font-mono text-xs">{gwStatus.address}</span>
                </>
              )}
              {gwStatus.rpc_ok !== undefined && (
                <>
                  <span className="text-muted-foreground">RPC 探测</span>
                  <span>{gwStatus.rpc_ok ? "✅ 正常" : "❌ 不可达"}</span>
                </>
              )}
            </div>
          )}

          <Separator />

          <div className="flex gap-2 flex-wrap">
            {!gwStatus?.installed && (
              <Button
                size="sm"
                onClick={() => handleAction("gw-install", gatewayInstall)}
                disabled={!!actionLoading || !installed}
              >
                {actionLoading === "gw-install" ? "注册中…" : "注册服务"}
              </Button>
            )}
            {gwStatus?.installed && !gwStatus?.running && (
              <Button
                size="sm"
                onClick={() => handleAction("gw-start", gatewayStart)}
                disabled={!!actionLoading}
              >
                {actionLoading === "gw-start" ? "启动中…" : "启动"}
              </Button>
            )}
            {gwStatus?.running && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction("gw-restart", gatewayRestart)}
                  disabled={!!actionLoading}
                >
                  {actionLoading === "gw-restart" ? "重启中…" : "重启"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleAction("gw-stop", gatewayStop)}
                  disabled={!!actionLoading}
                >
                  {actionLoading === "gw-stop" ? "停止中…" : "停止"}
                </Button>
              </>
            )}
            {gwStatus?.installed && !gwStatus?.running && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleAction("gw-uninstall", gatewayUninstall)}
                disabled={!!actionLoading}
              >
                {actionLoading === "gw-uninstall" ? "卸载中…" : "卸载服务"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Real-time WebSocket monitor */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>实时监控</span>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  ws.state === "connected"
                    ? "default"
                    : ws.state === "connecting"
                      ? "secondary"
                      : "outline"
                }
                className="text-xs"
              >
                {ws.state === "connected"
                  ? "已连接"
                  : ws.state === "connecting"
                    ? "连接中…"
                    : ws.state === "error"
                      ? "连接失败"
                      : "未连接"}
              </Badge>
              <Button
                size="sm"
                variant={showMonitor ? "default" : "outline"}
                onClick={() => setShowMonitor(!showMonitor)}
              >
                {showMonitor ? "关闭监控" : "开启监控"}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        {showMonitor && (
          <CardContent>
            <div className="bg-muted/50 rounded-md p-3 max-h-64 overflow-y-auto font-mono text-xs">
              {ws.messages.length === 0 ? (
                <p className="text-muted-foreground">
                  {ws.state === "connected"
                    ? "等待消息…"
                    : ws.state === "connecting"
                      ? "正在连接 Gateway WebSocket…"
                      : "未连接"}
                </p>
              ) : (
                ws.messages.map((msg, i) => (
                  <div
                    key={i}
                    className="flex gap-2 py-0.5 border-b border-border/30 last:border-0"
                  >
                    <span className="text-muted-foreground shrink-0">
                      {new Date(msg.ts).toLocaleTimeString()}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] shrink-0 h-4"
                    >
                      {msg.type}
                    </Badge>
                    <span className="truncate text-foreground">
                      {typeof msg.data === "string"
                        ? msg.data
                        : JSON.stringify(msg.data).slice(0, 200)}
                    </span>
                  </div>
                ))
              )}
            </div>
            {gwUrl?.wsUrl && (
              <p className="text-[10px] text-muted-foreground mt-2 font-mono truncate">
                {gwUrl.wsUrl.replace(/token=[^&]+/, "token=***")}
              </p>
            )}
          </CardContent>
        )}
      </Card>

      {/* Reset config confirmation dialog */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认重置配置？</DialogTitle>
            <DialogDescription>
              重新进入配置向导将覆盖现有的所有配置。确定要继续吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowResetConfirm(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                // Reset ClawLadder status to "installed" so wizard can run
                try {
                  await setClawLadderStatus("installed");
                } catch { /* ignore */ }
                setShowResetConfirm(false);
                onResetConfig();
              }}
            >
              确认重置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
