import { useState, useEffect } from "react";
import { Database, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { fetchMemoryStatus } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KNOWN_LABELS: Record<string, string> = {
  files: "文件数",
  chunks: "Chunks",
  backend: "后端",
  provider: "提供者",
  status: "状态",
  index: "索引",
  model: "模型",
  dimension: "维度",
  version: "版本",
};

function labelFor(key: string): string {
  return KNOWN_LABELS[key] ?? key;
}

function isPrimitive(v: unknown): v is string | number | boolean {
  return v !== null && v !== undefined && typeof v !== "object";
}

function InfoRow({ label, value }: { label: string; value: string | number | boolean }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{String(value)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dialog
// ---------------------------------------------------------------------------

export function MemoryDialog({ open, onOpenChange }: MemoryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchMemoryStatus()
      .then((res) => {
        if (!cancelled) setData(res as Record<string, unknown>);
      })
      .catch((err) => {
        console.error("[MemoryDialog] fetchMemoryStatus failed:", err);
        if (!cancelled) setError("获取记忆状态失败，请检查服务是否正常运行");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-2xl max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            记忆管理
          </DialogTitle>
          <DialogDescription>AI 助手的记忆搜索索引状态</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">正在获取…</span>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            获取记忆状态失败：{error}
          </div>
        )}

        {!loading && !error && data && (
          <Card className="p-4 space-y-1">
            <div className="divide-y divide-border">
              {Object.entries(data)
                .filter(([, v]) => isPrimitive(v))
                .map(([key, value]) => (
                  <InfoRow
                    key={key}
                    label={labelFor(key)}
                    value={value as string | number | boolean}
                  />
                ))}
            </div>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
}
