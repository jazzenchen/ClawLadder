import {
  MessageSquare,
  ArrowUpRight,
  ArrowDownRight,
  Database,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatTokens } from "@/lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Session {
  agentId: string;
  key: string;
  kind: string;
  sessionId: string;
  updatedAt: number;
  age: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  model: string;
  contextTokens: number;
  flags: string[];
}

interface SessionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: Session[];
  totalCount: number;
  totalRequests: number;
  defaults?: { model: string; contextTokens: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function displayKey(key: string): string {
  const cleaned = key.replace(/^agent:main:/, "");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleaned)) {
    return cleaned.slice(0, 8) + "…";
  }
  if (cleaned.length > 20) return cleaned.slice(0, 20) + "…";
  return cleaned;
}

function truncModel(model: string): string {
  return model.length > 16 ? model.slice(0, 16) + "…" : model;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SessionsDialog({
  open,
  onOpenChange,
  sessions,
  totalCount,
  totalRequests,
  defaults,
}: SessionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-2xl max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            会话详情
          </DialogTitle>
          <DialogDescription>所有活跃会话的详细信息</DialogDescription>
        </DialogHeader>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 bg-card/50 border-border/30">
            <p className="text-[10px] text-muted-foreground mb-1">总会话数</p>
            <p className="text-lg font-bold text-foreground">{totalCount}</p>
          </Card>
          <Card className="p-3 bg-card/50 border-border/30">
            <p className="text-[10px] text-muted-foreground mb-1">总请求数</p>
            <p className="text-lg font-bold text-foreground">{totalRequests}</p>
          </Card>
          <Card className="p-3 bg-card/50 border-border/30">
            <p className="text-[10px] text-muted-foreground mb-1">默认模型</p>
            <p className="text-sm  text-foreground truncate" title={defaults?.model}>
              {defaults?.model ?? "—"}
            </p>
            {defaults?.contextTokens != null && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                ctx {formatTokens(defaults.contextTokens)}
              </p>
            )}
          </Card>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto space-y-2 px-1 custom-scrollbar">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">暂无会话</p>
          ) : (
            sessions.map((s) => (
              <Card
                key={s.sessionId}
                className="p-3 bg-card/50 border-border/30 space-y-1.5"
              >
                {/* Row 1: key + model + age */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-mono text-foreground truncate"
                    title={s.key}
                  >
                    {displayKey(s.key)}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[10px] text-muted-foreground truncate max-w-[120px]"
                      title={s.model}
                    >
                      {truncModel(s.model)}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {formatAge(s.age)}
                    </span>
                  </div>
                </div>

                {/* Row 2: tokens */}
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-0.5 text-primary">
                    <ArrowUpRight className="w-3 h-3 shrink-0" />
                    {formatTokens(s.inputTokens)}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-secondary">
                    <ArrowDownRight className="w-3 h-3 shrink-0" />
                    {formatTokens(s.outputTokens)}
                  </span>

                  {s.cacheRead > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                      <Database className="w-3 h-3 shrink-0" />
                      R {formatTokens(s.cacheRead)}
                    </span>
                  )}
                  {s.cacheWrite > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                      <Database className="w-3 h-3 shrink-0" />
                      W {formatTokens(s.cacheWrite)}
                    </span>
                  )}

                  <span className="ml-auto text-[10px] text-muted-foreground">
                    ctx {formatTokens(s.contextTokens)}
                  </span>
                </div>
              </Card>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
