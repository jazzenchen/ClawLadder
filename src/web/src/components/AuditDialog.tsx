import { Shield, AlertTriangle, AlertCircle, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface AuditFinding {
  checkId: string;
  severity: "critical" | "warn" | "info";
  title: string;
  detail: string;
  remediation?: string;
}

export interface AuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: { critical: number; warn: number; info: number };
  findings: AuditFinding[];
}

const severityOrder: AuditFinding["severity"][] = ["critical", "warn", "info"];

const severityConfig = {
  critical: {
    label: "严重",
    border: "border-l-red-500",
    badgeClass: "bg-red-500/15 text-red-500",
    icon: AlertCircle,
  },
  warn: {
    label: "警告",
    border: "border-l-yellow-500",
    badgeClass: "bg-yellow-500/15 text-yellow-500",
    icon: AlertTriangle,
  },
  info: {
    label: "信息",
    border: "border-l-muted-foreground",
    badgeClass: "bg-muted text-muted-foreground",
    icon: Info,
  },
} as const;

export function AuditDialog({
  open,
  onOpenChange,
  summary,
  findings,
}: AuditDialogProps) {
  const sorted = [...findings].sort(
    (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-2xl max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-5" />
            安全审计
          </DialogTitle>
          <DialogDescription>系统安全检查结果与修复建议</DialogDescription>
        </DialogHeader>

        {/* Summary badges */}
        <div className="flex items-center gap-2">
          <Badge className="bg-red-500/15 text-red-500 border-transparent">
            {summary.critical} 严重
          </Badge>
          <Badge className="bg-yellow-500/15 text-yellow-500 border-transparent">
            {summary.warn} 警告
          </Badge>
          <Badge className="bg-muted text-muted-foreground border-transparent">
            {summary.info} 信息
          </Badge>
        </div>

        {/* Findings list */}
        <div className="flex-1 overflow-y-auto space-y-3 px-1">
          {sorted.map((finding) => {
            const config = severityConfig[finding.severity];
            const Icon = config.icon;

            return (
              <div
                key={finding.checkId}
                className={cn(
                  "rounded-md border border-border bg-card p-4 border-l-2",
                  config.border
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="size-4 shrink-0" />
                  <span className="font-semibold text-sm">{finding.title}</span>
                  <Badge className={cn("ml-auto border-transparent", config.badgeClass)}>
                    {config.label}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {finding.detail}
                </p>

                {finding.remediation && (
                  <div className="mt-2 rounded bg-primary/5 px-3 py-2">
                    <span className="text-xs ">修复建议：</span>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5">
                      {finding.remediation}
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {sorted.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              暂无审计发现
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
