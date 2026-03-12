import { useState, useEffect, useCallback } from "react";
import { Terminal } from "./components/Terminal";
import { Dashboard } from "./components/Dashboard";
import { OnboardingWizard } from "./components/OnboardingWizard";
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
import {
  fetchStatus,
  validateSudo,
  startInstall,
  deleteSession,
  gatewayInstall,
  runOnboard,
  setClawLadderStatus,
  type StatusInfo,
} from "@/lib/api";

type Phase =
  | "loading"
  | "idle"           // no openclaw.json → show installer
  | "installed"      // ClawLadder.status = "configured" → Dashboard
  | "needs-config"   // ClawLadder.status = "installed" → prompt user to configure
  | "no-clawladder"  // openclaw.json exists but no ClawLadder key → ask re-configure
  | "password"
  | "installing"
  | "post-install"
  | "onboarding"
  | "error";

export default function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [validating, setValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [verbose, setVerbose] = useState(false);
  const [useHomebrew, setUseHomebrew] = useState(false);
  const [statusInfo, setStatusInfo] = useState<StatusInfo | null>(null);
  const [postInstallMsg, setPostInstallMsg] = useState("");

  const checkStatus = useCallback(async () => {
    try {
      const data = await fetchStatus();
      setStatusInfo(data);

      if (!data.installed) {
        // OpenClaw binary not found → show installer
        setPhase("idle");
      } else {
        // OpenClaw is installed — check ClawLadder status
        const cls = data.clawladder_status;
        if (cls === null || cls === undefined) {
          // No openclaw.json at all → show installer (shouldn't happen if installed, but safe)
          setPhase("idle");
        } else if (cls === "configured") {
          // Fully configured → Dashboard
          setPhase("installed");
        } else if (cls === "installed") {
          // Installed + onboarded but not configured → prompt user
          setPhase("needs-config");
        } else if (cls === "none") {
          // openclaw.json exists but no ClawLadder key → ask re-configure
          setPhase("no-clawladder");
        } else {
          // Unknown status → treat as needs-config
          setPhase("needs-config");
        }
      }
      return data;
    } catch {
      setPhase("idle");
      return null;
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleInstallClick = async () => {
    if (useHomebrew) {
      // Homebrew path: need sudo password
      setPassword("");
      setPasswordError("");
      setPhase("password");
    } else {
      // nvm path: no password needed, start directly
      try {
        const sid = await startInstall("", verbose, false);
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

      const sid = await startInstall(password, verbose, true);
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
    setPhase("idle");
  };

  // Post-install: run onboard, register gateway, write ClawLadder status
  const runPostInstall = useCallback(async () => {
    setPhase("post-install");
    try {
      // 1. Run openclaw onboard (base config + daemon install)
      setPostInstallMsg("正在执行初始化配置…");
      await runOnboard({
        auth_choice: "skip",
        install_daemon: true,
        skip_channels: true,
        skip_skills: true,
        skip_search: true,
        skip_health: true,
        skip_ui: true,
      });

      // 2. Register gateway as system service
      setPostInstallMsg("正在注册 Gateway 服务…");
      try {
        await gatewayInstall();
      } catch {
        // Gateway install failed — not fatal, user can do it later
      }

      // 3. Write ClawLadder.status = "installed" to openclaw.json
      setPostInstallMsg("正在写入安装状态…");
      await setClawLadderStatus("installed");

      // 4. Refresh status and go to needs-config (the "已安装" prompt screen)
      await new Promise((r) => setTimeout(r, 500));
      await checkStatus();
    } catch (e) {
      // If onboard or status write fails, still try to show needs-config
      setPostInstallMsg(
        `初始化部分失败 (${e instanceof Error ? e.message : String(e)})，尝试继续…`
      );
      await new Promise((r) => setTimeout(r, 2000));
      // Try to write status anyway
      try { await setClawLadderStatus("installed"); } catch { /* ignore */ }
      await checkStatus();
    }
  }, [checkStatus]);

  const handleExit = useCallback(
    (code: number) => {
      if (code === 0) {
        // Installation succeeded — run post-install steps
        runPostInstall();
      } else {
        setErrorMsg(`安装进程退出，退出码: ${code}`);
        setPhase("error");
      }
    },
    [runPostInstall]
  );

  // =========================================================================
  // Main page — phase-based rendering
  // =========================================================================

  // Loading
  if (phase === "loading") {
    return (
      <div className="dark h-full w-full flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">检查中…</p>
      </div>
    );
  }

  // Already installed + configured → Dashboard
  if (phase === "installed") {
    return (
      <div className="dark h-full w-full bg-background text-foreground overflow-y-auto">
        <Dashboard
          installed={true}
          version={statusInfo?.version}
          onResetConfig={() => setPhase("onboarding")}
        />
      </div>
    );
  }

  // Idle: install button
  if (phase === "idle") {
    return (
      <div className="dark h-full w-full flex flex-col items-center justify-center gap-6 bg-background">
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl">🦞</span>
          <h1 className="text-2xl font-medium text-foreground">ClawLadder Installer</h1>
          <p className="text-sm text-muted-foreground">一键安装 OpenClaw</p>
        </div>
        <Button size="lg" onClick={handleInstallClick}>
          安装 OpenClaw
        </Button>
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="verbose"
              checked={verbose}
              onCheckedChange={(checked) => setVerbose(checked as boolean)}
            />
            <Label
              htmlFor="verbose"
              className="text-sm text-muted-foreground cursor-pointer select-none"
            >
              详细日志
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="useHomebrew"
              checked={useHomebrew}
              onCheckedChange={(checked) => setUseHomebrew(checked as boolean)}
            />
            <Label
              htmlFor="useHomebrew"
              className="text-sm text-muted-foreground cursor-pointer select-none"
            >
              通过 Homebrew 安装（需要管理员密码）
            </Label>
          </div>
        </div>
      </div>
    );
  }

  // Password dialog
  if (phase === "password") {
    return (
      <div className="dark h-full w-full flex items-center justify-center bg-background">
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

  // Installing: xterm with cancel
  if (phase === "installing" && sessionId) {
    return (
      <div className="dark h-full w-full flex flex-col bg-background">
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
          <Terminal sessionId={sessionId} disableStdin onExit={handleExit} />
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
              <Button variant="destructive" onClick={handleCancel}>
                确认取消
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Post-install: registering gateway
  if (phase === "post-install") {
    return (
      <div className="dark h-full w-full flex flex-col items-center justify-center gap-4 bg-background">
        <span className="text-4xl">⚙️</span>
        <p className="text-sm text-muted-foreground">{postInstallMsg}</p>
      </div>
    );
  }

  // No ClawLadder key in openclaw.json — ask user if they want to re-configure
  if (phase === "no-clawladder") {
    return (
      <div className="dark h-full w-full flex flex-col items-center justify-center gap-6 bg-background">
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl">🦞</span>
          <h1 className="text-xl font-medium text-foreground">OpenClaw 已安装</h1>
          {statusInfo?.version && (
            <p className="text-xs text-muted-foreground">版本 {statusInfo.version}</p>
          )}
        </div>
        <div className="flex flex-col items-center gap-2 max-w-sm text-center">
          <p className="text-sm text-muted-foreground">
            检测到已有配置文件，但缺少 ClawLadder 配置项。是否需要重新配置？这将覆盖现有的所有配置。
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            size="lg"
            onClick={() => setPhase("onboarding")}
          >
            重新配置
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => setPhase("installed")}
          >
            跳过，进入控制面板
          </Button>
        </div>
      </div>
    );
  }

  // Needs config: installed but not configured — prompt user
  if (phase === "needs-config") {
    return (
      <div className="dark h-full w-full flex flex-col items-center justify-center gap-6 bg-background">
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl">🦞</span>
          <h1 className="text-xl font-medium text-foreground">OpenClaw 已安装</h1>
          {statusInfo?.version && (
            <p className="text-xs text-muted-foreground">版本 {statusInfo.version}</p>
          )}
        </div>
        <div className="flex flex-col items-center gap-2 max-w-sm text-center">
          <p className="text-sm text-muted-foreground">
            检测到 OpenClaw 已安装但尚未完成配置。需要配置 AI 模型和频道才能正常使用。
          </p>
        </div>
        <div className="flex gap-3">
          <Button size="lg" onClick={() => setPhase("onboarding")}>
            继续配置 →
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => setPhase("installed")}
          >
            跳过，进入控制面板
          </Button>
        </div>
      </div>
    );
  }

  // Onboarding wizard — 固定高度，内部由 OnboardingWizard 的 Card 区域滚动
  if (phase === "onboarding") {
    return (
      <div className="dark h-full w-full min-h-0 flex flex-col bg-background text-foreground">
        <OnboardingWizard
          onComplete={async () => {
            // Write ClawLadder.status = "configured" then go to Dashboard
            try {
              await setClawLadderStatus("configured");
            } catch {
              // non-fatal — still go to dashboard
            }
            checkStatus();
          }}
        />
      </div>
    );
  }

  // Error
  if (phase === "error") {
    return (
      <div className="dark h-full w-full flex flex-col items-center justify-center gap-4 bg-background">
        <p className="text-sm text-destructive">{errorMsg}</p>
        <Button
          variant="outline"
          onClick={() => {
            setPhase("idle");
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
