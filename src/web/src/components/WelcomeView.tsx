// WelcomeView — "idle" phase: install button + options
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, Terminal as TerminalIcon, Package, Globe } from "lucide-react";

interface WelcomeViewProps {
  verbose: boolean;
  setVerbose: (v: boolean) => void;
  useHomebrew: boolean;
  setUseHomebrew: (v: boolean) => void;
  useChinaMirror: boolean;
  setUseChinaMirror: (v: boolean) => void;
  onInstall: () => void;
}

export function WelcomeView({
  verbose,
  setVerbose,
  useHomebrew,
  setUseHomebrew,
  useChinaMirror,
  setUseChinaMirror,
  onInstall,
}: WelcomeViewProps) {
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

        {/* Install button with glow on hover */}
        <Button
          size="lg"
          onClick={onInstall}
          className="install-btn mt-4 gap-2 px-8 h-12 text-base font-medium bg-primary hover:bg-primary/90 text-primary-foreground transition-all"
        >
          开始安装
          <ArrowRight className="w-4 h-4" />
        </Button>

        {/* Options */}
        <div className="flex flex-col gap-3 mt-6 w-full max-w-sm">
          <label className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 border border-border/40 hover:border-border/60 transition-colors cursor-pointer group">
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

          <label className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 border border-border/40 hover:border-border/60 transition-colors cursor-pointer group">
            <Checkbox
              checked={useHomebrew}
              onCheckedChange={(checked) => setUseHomebrew(checked === true)}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
            <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
              <Package className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">通过 Homebrew 安装</span>
              <span className="text-xs text-muted-foreground/60 whitespace-nowrap">(需要管理员密码)</span>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 border border-border/40 hover:border-border/60 transition-colors cursor-pointer group">
            <Checkbox
              checked={useChinaMirror}
              onCheckedChange={(checked) => setUseChinaMirror(checked === true)}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
            <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
              <Globe className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">使用国内镜像加速</span>
              <span className="text-xs text-muted-foreground/60 whitespace-nowrap">(npmmirror.com)</span>
            </div>
          </label>
        </div>

        {/* Version info */}
        <p className="text-xs text-muted-foreground/50 mt-8">
          v2026.3.11 • ClawLadder Installer
        </p>
      </div>
    </div>
  );
}
