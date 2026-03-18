import { useState, useEffect, useCallback, useRef } from "react";
import { Terminal } from "./components/Terminal";
import { Dashboard } from "./components/Dashboard";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { InstallingView, useInstallLogs } from "./components/InstallingView";
import { InitializingView } from "./components/InitializingView";
import { WelcomeView, type InstallSettings } from "./components/WelcomeView";
import { PasswordDialog } from "./components/PasswordDialog";
import { InstalledView } from "./components/InstalledView";
import { ErrorView } from "./components/ErrorView";
import { useOnboardingStore } from "./stores/onboarding";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  const [installSettings, setInstallSettings] = useState<InstallSettings>({
    mode: "quick",
    verbose: false,
    useHomebrew: false,
    useChinaMirror: true,
  });
  const [statusInfo, setStatusInfo] = useState<StatusInfo | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [useStructuredUI, setUseStructuredUI] = useState(false);
  const installLogs = useInstallLogs();
  const rawOutputRef = useRef("");

  const checkStatus = useCallback(async () => {
    try {
      const data = await fetchStatus();
      setStatusInfo(data);
      if (!data.installed) setPhase("idle");
      else if (data.configured) setPhase("dashboard");
      else setPhase("installed");
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

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleInstallClick = async (settings: InstallSettings) => {
    setInstallSettings(settings);
    const { verbose, useHomebrew, useChinaMirror } = settings;

    if (useHomebrew) {
      setPassword("");
      setPasswordError("");
      setUseStructuredUI(false);
      setPhase("password");
    } else {
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
      const sid = await startInstall(password, installSettings.verbose, true, installSettings.useChinaMirror);
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
    if (sessionId) await deleteSession(sessionId).catch(() => {});
    setShowCancelConfirm(false);
    setSessionId(null);
    installLogs.reset();
    setPhase("idle");
  };

  const handleInstallOutput = useCallback((text: string) => {
    installLogs.handleOutput(text);
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
        const raw = rawOutputRef.current
          .replace(/\x1b\[[0-9;]*m/g, "")
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(l => l.length > 0);
        setErrorMsg(`安装进程退出，退出码: ${code}`);
        setErrorDetail(raw.slice(-8).join("\n"));
        setPhase("error");
      }
    },
    [checkStatus],
  );

  // ── Cancel confirmation dialog (shared by both install UIs) ─────────

  const cancelDialog = (
    <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认取消安装？</DialogTitle>
          <DialogDescription>
            安装正在进行中，取消可能导致安装不完整。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 bg-transparent border-t-0">
          <Button variant="outline" onClick={() => setShowCancelConfirm(false)}>
            继续安装
          </Button>
          <Button variant="default" onClick={handleCancel}>
            确认取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ── Phase-based rendering ───────────────────────────────────────────

  if (phase === "loading") {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">检查中…</p>
      </div>
    );
  }

  if (phase === "dashboard") {
    return (
      <div className="h-full w-full bg-background text-foreground overflow-y-auto">
        <Dashboard
          installed={true}
          version={statusInfo?.version}
          pinnedVersion={statusInfo?.pinnedVersion}
          onResetConfig={() => setPhase("installed")}
          deviceInfo={deviceInfo}
        />
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <WelcomeView
        onInstall={handleInstallClick}
      />
    );
  }

  if (phase === "password") {
    return (
      <PasswordDialog
        password={password}
        setPassword={setPassword}
        passwordError={passwordError}
        validating={validating}
        onSubmit={handlePasswordSubmit}
        onCancel={() => setPhase("idle")}
      />
    );
  }

  if (phase === "installing" && sessionId) {
    if (useStructuredUI) {
      return (
        <div className="h-full w-full bg-background text-foreground">
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
          {cancelDialog}
        </div>
      );
    }

    return (
      <div className="h-full w-full flex flex-col bg-background">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className="text-sm text-muted-foreground">🦞 正在安装 OpenClaw…</span>
          <Button variant="ghost" size="sm" onClick={() => setShowCancelConfirm(true)}>
            取消
          </Button>
        </div>
        <div className="flex-1 min-h-0">
          <Terminal sessionId={sessionId} disableStdin onOutput={handleInstallOutput} onExit={handleExit} />
        </div>
        {cancelDialog}
      </div>
    );
  }

  if (phase === "initializing") {
    return <InitializingView onComplete={() => {
      // Sync the install-time china-mirror preference into the onboarding store
      useOnboardingStore.getState().setUseChinaMirror(installSettings.useChinaMirror);
      setPhase("onboarding");
    }} />;
  }

  if (phase === "installed") {
    return (
      <InstalledView
        statusInfo={statusInfo}
        onConfigure={() => setPhase("initializing")}
        onBack={statusInfo?.configured ? () => setPhase("dashboard") : undefined}
      />
    );
  }

  if (phase === "onboarding") {
    return (
      <div className="h-full w-full min-h-0 flex flex-col bg-background text-foreground">
        <OnboardingWizard
          onComplete={async () => { checkStatus(); }}
          onExit={() => setPhase("installed")}
        />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <ErrorView
        message={errorMsg}
        detail={errorDetail}
        onBack={() => { setPhase("loading"); checkStatus(); }}
      />
    );
  }

  return null;
}