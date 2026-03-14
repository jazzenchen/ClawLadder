// InstalledView — "installed" phase: OpenClaw installed but not configured
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { CheckCircle2, LayoutDashboard } from "lucide-react";
import type { StatusInfo } from "@/lib/api";

interface InstalledViewProps {
  statusInfo: StatusInfo | null;
  onConfigure: () => void;
  onSkipToDashboard: () => void;
}

export function InstalledView({ statusInfo, onConfigure, onSkipToDashboard }: InstalledViewProps) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center min-h-screen p-8 bg-background page-transition">
      <div className="flex flex-col items-center gap-6 max-w-lg text-center">
        {/* Success animation */}
        <div className="relative">
          <div className="absolute inset-0 blur-3xl bg-emerald-500/10 rounded-full scale-150" />
          <div className="relative z-10">
            <span className="text-6xl block">🦞</span>
            <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center shadow-md">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            OpenClaw 已安装
          </h1>
          {statusInfo?.version && (
            <p className="text-sm text-muted-foreground font-mono">
              版本 {statusInfo.version}
            </p>
          )}
        </div>

        {/* Status message */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border/40 max-w-sm">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {statusInfo?.configured ? (
              <>
                检测到已有配置文件，重新配置将覆盖现有的所有配置。
              </>
            ) : (
              <>
                检测到 OpenClaw 已安装但尚未完成配置。
                <br />
                需要配置 <span className="text-foreground font-medium">AI 模型</span> 和 <span className="text-foreground font-medium">通讯工具</span> 才能正常使用。
              </>
            )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-4">
          <Button
            size="sm"
            onClick={onConfigure}
            className="install-btn gap-2 px-5 h-9 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            继续配置
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onSkipToDashboard}
            className="gap-2 px-5 h-9 border-border/50 hover:bg-muted/50"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            跳过，进入控制面板
          </Button>
        </div>
      </div>
    </div>
  );
}
