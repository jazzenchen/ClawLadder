// WelcomeView — "idle" phase: Quick Install + Advanced Install
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowRight,
  Terminal as TerminalIcon,
  Package,
  Globe,
  Zap,
  Settings2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type InstallMode = "quick" | "advanced";

export interface InstallSettings {
  mode: InstallMode;
  verbose: boolean;
  useHomebrew: boolean;
  useChinaMirror: boolean;
}

interface WelcomeViewProps {
  onInstall: (settings: InstallSettings) => void;
}

export function WelcomeView({ onInstall }: WelcomeViewProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [verbose, setVerbose] = useState(false);
  const [useHomebrew, setUseHomebrew] = useState(false);
  const [useChinaMirror, setUseChinaMirror] = useState(true);

  const handleQuickInstall = () => {
    onInstall({
      mode: "quick",
      verbose: false,
      useHomebrew: false,
      useChinaMirror: true,
    });
  };

  const handleAdvancedInstall = () => {
    onInstall({
      mode: "advanced",
      verbose,
      useHomebrew,
      useChinaMirror,
    });
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center min-h-screen p-8 bg-background page-transition">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        {/* Logo with subtle glow effect */}
        <div className="relative">
          <div className="absolute inset-0 blur-3xl bg-primary/20 rounded-full scale-150" />
          <span className="relative z-10 text-6xl block">🦞</span>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            ClawLadder
          </h1>
          <p className="text-muted-foreground">
            一键安装 OpenClaw AI 助手
          </p>
        </div>

        {/* Quick Install — primary action */}
        <Button
          size="lg"
          onClick={handleQuickInstall}
          variant={showAdvanced ? "outline" : "default"}
          className={cn(
            "install-btn mt-4 gap-2 px-8 h-12 text-base  transition-all",
            !showAdvanced && "bg-primary hover:bg-primary/90 text-primary-foreground"
          )}
        >
          <Zap className="w-4 h-4" />
          快速安装
          <ArrowRight className="w-4 h-4" />
        </Button>
        <p className="text-xs text-muted-foreground/70 -mt-3">
          使用国内镜像，自动完成全部安装
        </p>

        {/* Divider */}
        <div className="w-full flex items-center gap-3 mt-2">
          <div className="flex-1 h-px bg-border/50" />
          <span className="text-xs text-muted-foreground/50">或</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>

        {/* Advanced Install toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer group"
        >
          <Settings2 className="w-4 h-4" />
          <span>高级安装</span>
          {showAdvanced ? (
            <ChevronUp className="w-3.5 h-3.5 transition-transform" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 transition-transform" />
          )}
        </button>

        {/* Advanced options panel */}
        <div
          className={cn(
            "w-full max-w-sm overflow-hidden transition-all duration-300 ease-in-out",
            showAdvanced
              ? "max-h-[400px] opacity-100"
              : "max-h-0 opacity-0"
          )}
        >
          <div className="flex flex-col gap-3 p-4 rounded-xl bg-muted/20 border border-border/40">
            {/* Option: Verbose logs */}
            <label className="flex items-center gap-3 p-3 rounded-lg bg-background/60 hover:bg-background/80 border border-border/30 hover:border-border/50 transition-colors cursor-pointer group">
              <Checkbox
                checked={verbose}
                onCheckedChange={(checked) => setVerbose(checked === true)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                <TerminalIcon className="w-4 h-4 shrink-0" />
                <span>显示详细日志</span>
              </div>
            </label>

            {/* Option: Homebrew */}
            <label className="flex items-center gap-3 p-3 rounded-lg bg-background/60 hover:bg-background/80 border border-border/30 hover:border-border/50 transition-colors cursor-pointer group">
              <Checkbox
                checked={useHomebrew}
                onCheckedChange={(checked) => setUseHomebrew(checked === true)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                <Package className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">通过 Homebrew 安装</span>
                <span className="text-xs text-muted-foreground/60 whitespace-nowrap">
                  (需要管理员密码)
                </span>
              </div>
            </label>

            {/* Option: China mirror */}
            <label className="flex items-center gap-3 p-3 rounded-lg bg-background/60 hover:bg-background/80 border border-border/30 hover:border-border/50 transition-colors cursor-pointer group">
              <Checkbox
                checked={useChinaMirror}
                onCheckedChange={(checked) =>
                  setUseChinaMirror(checked === true)
                }
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                <Globe className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">使用国内镜像加速</span>
                <span className="text-xs text-muted-foreground/60 whitespace-nowrap">
                  (npmmirror.com)
                </span>
              </div>
            </label>

            {/* Advanced install button */}
            <Button
              size="default"
              onClick={handleAdvancedInstall}
              className="mt-1 gap-2  bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Settings2 className="w-4 h-4" />
              使用以上配置安装
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Version info */}
        <p className="text-xs text-muted-foreground/50 mt-8">
          v2026.3.11 • ClawLadder Installer
        </p>
      </div>
    </div>
  );
}
