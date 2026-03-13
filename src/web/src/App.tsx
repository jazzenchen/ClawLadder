import { useState, useEffect, useCallback, useRef } from "react";
import { Terminal } from "./components/Terminal";
import { Dashboard } from "./components/Dashboard";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { InstallingView, useInstallLogs } from "./components/InstallingView";
import { InitializingView } from "./components/InitializingView";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Terminal as TerminalIcon, Package, Globe } from "lucide-react";
import { CheckCircle2, LayoutDashboard } from "lucide-react";
import {
  fetchStatus,
  validateSudo,
  startInstall,
  deleteSession,
  fetchDeviceSerial,
  type StatusInfo,
  type DeviceInfo,
} from "@/lib/api";

type Phase =
  | "loading"
  | "idle"           // openclaw binary not found → show installer
  | "installed"      // openclaw binary found but no openclaw.json → prompt to configure
  | "initializing"   // running onboard + gateway registration
  | "dashboard"      // openclaw.json exists → Dashboard
  | "password"
  | "installing"
  | "onboarding"
  | "error";

export default function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [validating, setValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [verbose, setVerbose] = useState(false);
  const [useHomebrew, setUseHomebrew] = useState(false);
  const [useChinaMirror, setUseChinaMirror] = useState(true);
  const [statusInfo, setStatusInfo] = useState<StatusInfo | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  // Whether to use the structured install UI (nvm + non-verbose)
  const [useStructuredUI, setUseStructuredUI] = useState(false);
  const installLogs = useInstallLogs();
  // Keep last N chars of raw PTY output for error diagnostics
  const rawOutputRef = useRef("");

  const checkStatus = useCallback(async () => {
    try {
      const data = await fetchStatus();
      setStatusInfo(data);

      if (!data.installed) {
        setPhase("idle");
      } else if (data.configured) {
        setPhase("dashboard");
      } else {
        setPhase("installed");
      }
      return data;
    } catch {
      setPhase("idle");
      return null;
    }
  }, []);

  useEffect(() => {
    checkStatus();
    fetchDeviceSerial().then(setDeviceInfo).catch(() => {});
  }, [checkStatus]);

  const handleInstallClick = async () => {
    if (useHomebrew) {
      // Homebrew path: need sudo password
      setPassword("");
      setPasswordError("");
      setUseStructuredUI(false);
      setPhase("password");
    } else {
      // nvm path: no password needed, start directly
      const structured = !verbose;
      setUseStructuredUI(structured);
      if (structured) installLogs.reset();
      rawOutputRef.current = "";
      try {
        const sid = await startInstall("", verbose, false, useChinaMirror);
        setSessionId(sid);
        setPhase("installing");
      } catch (e) {
        setErrorMsg(`安装启动失败: ${e instanceof Error ? e.message : String(e)}`);
        setPhase("error");
      }
    }
  };

  const handlePasswordSubmit = async () => {
    if (!password.trim()) {
      setPasswordError("请输入密码");
      return;
    }
    setValidating(true);
    setPasswordError("");

    try {
      const valid = await validateSudo(password);
      if (!valid) {
        setPasswordError("密码错误，请重试");
        setValidating(false);
        return;
      }

      const sid = await startInstall(password, verbose, true, useChinaMirror);
      setSessionId(sid);
      setPhase("installing");
    } catch (e) {
      setErrorMsg(`安装启动失败: ${e instanceof Error ? e.message : String(e)}`);
      setPhase("error");
    } finally {
      setValidating(false);
    }
  };

  const handleCancel = async () => {
    if (sessionId) {
      await deleteSession(sessionId).catch(() => {});
    }
    setShowCancelConfirm(false);
    setSessionId(null);
    installLogs.reset();
    setPhase("idle");
  };

  const handleInstallOutput = useCallback((text: string) => {
    installLogs.handleOutput(text);
    // Keep last 2KB of raw output for error diagnostics
    rawOutputRef.current += text;
    if (rawOutputRef.current.length > 2048) {
      rawOutputRef.current = rawOutputRef.current.slice(-2048);
    }
  }, [installLogs]);

  const handleExit = useCallback(
    (code: number) => {
      if (code === 0) {
        checkStatus();
      } else {
        // Extract last meaningful lines from raw PTY output
        const raw = rawOutputRef.current
          .replace(/\x1b\[[0-9;]*m/g, "")  // strip ANSI
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(l => l.length > 0);
        const lastLines = raw.slice(-8).join("\n");
        setErrorMsg(`安装进程退出，退出码: ${code}`);
        setErrorDetail(lastLines);
        setPhase("error");
      }
    },
    [checkStatus]
  );

  // =========================================================================
  // Main page — phase-based rendering
  // =========================================================================

  // Loading
  if (phase === "loading") {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">检查中…</p>
      </div>
    );
  }

  // Already installed + configured → Dashboard
  if (phase === "dashboard") {
    return (
      <div className="h-full w-full bg-background text-foreground overflow-y-auto">
        <Dashboard
          installed={true}
          version={statusInfo?.version}
          onResetConfig={() => setPhase("installed")}
        />
      </div>
    );
  }

  // Idle: install button
  if (phase === "idle") {
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
            onClick={handleInstallClick}
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
          {/* {deviceInfo?.serial && (
            <p className="text-[10px] text-muted-foreground/40 font-mono">
              SN: {deviceInfo.serial}
              {deviceInfo.hardwareUUID ? ` • UUID: ${deviceInfo.hardwareUUID}` : ""}
            </p>
          )} */}
        </div>
      </div>
    );
  }

  // Password dialog
  if (phase === "password") {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !validating) setPhase("idle");
          }}
        >
          <DialogContent showCloseButton={!validating}>
            <DialogHeader>
              <DialogTitle>输入管理员密码</DialogTitle>
              <DialogDescription>安装过程需要管理员权限（sudo）</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handlePasswordSubmit();
              }}
              className="flex flex-col gap-3"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={validating}
                  aria-invalid={!!passwordError}
                />
                {passwordError && (
                  <p className="text-sm text-destructive">{passwordError}</p>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={validating}>
                  {validating ? "验证中…" : "确认"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Installing: structured UI for nvm+non-verbose, xterm for others
  if (phase === "installing" && sessionId) {
    if (useStructuredUI) {
      return (
        <div className="h-full w-full bg-background text-foreground">
          {/* Hidden terminal to capture PTY output */}
          <div className="hidden">
            <Terminal
              sessionId={sessionId}
              disableStdin
              onOutput={handleInstallOutput}
              onExit={handleExit}
            />
          </div>
          <InstallingView
            progress={installLogs.progress}
            logs={installLogs.logs}
            onCancel={() => setShowCancelConfirm(true)}
          />

          <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>确认取消安装？</DialogTitle>
                <DialogDescription>
                  安装正在进行中，取消可能导致安装不完整。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowCancelConfirm(false)}
                >
                  继续安装
                </Button>
                <Button variant="default" onClick={handleCancel}>
                  确认取消
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      );
    }

    // Fallback: xterm terminal UI
    return (
      <div className="h-full w-full flex flex-col bg-background">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className="text-sm text-muted-foreground">🦞 正在安装 OpenClaw…</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCancelConfirm(true)}
          >
            取消
          </Button>
        </div>
        <div className="flex-1 min-h-0">
          <Terminal sessionId={sessionId} disableStdin onOutput={handleInstallOutput} onExit={handleExit} />
        </div>

        <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认取消安装？</DialogTitle>
              <DialogDescription>
                安装正在进行中，取消可能导致安装不完整。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setShowCancelConfirm(false)}
              >
                继续安装
              </Button>
              <Button variant="default" onClick={handleCancel}>
                确认取消
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Initializing: run onboard + gateway registration
  if (phase === "initializing") {
    return (
      <InitializingView
        onComplete={() => {
          // After initialization, openclaw.json exists → go to onboarding wizard
          setPhase("onboarding");
        }}
      />
    );
  }

  // Installed but not configured — prompt user
  if (phase === "installed") {
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
              onClick={() => setPhase("initializing")}
              className="install-btn gap-2 px-5 h-9 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              继续配置
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPhase("dashboard")}
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

  // Onboarding wizard — 固定高度，内部由 OnboardingWizard 的 Card 区域滚动
  if (phase === "onboarding") {
    return (
      <div className="h-full w-full min-h-0 flex flex-col bg-background text-foreground">
        <OnboardingWizard
          onComplete={async () => {
            // After onboarding, openclaw.json is fully configured → go to Dashboard
            checkStatus();
          }}
          onExit={() => setPhase("installed")}
        />
      </div>
    );
  }

  // Error
  if (phase === "error") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 bg-background p-8">
        <p className="text-sm text-destructive">{errorMsg}</p>
        {errorDetail && (
          <div className="w-full max-w-lg">
            <pre className="text-xs font-mono text-muted-foreground bg-muted/30 border border-border/40 rounded-lg p-4 max-h-48 overflow-auto whitespace-pre-wrap">
              {errorDetail}
            </pre>
          </div>
        )}
        <Button
          variant="outline"
          onClick={() => {
            setPhase("loading");
            checkStatus();
          }}
        >
          返回
        </Button>
      </div>
    );
  }

  return null;
}
