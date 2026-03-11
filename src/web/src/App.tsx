import { useState, useEffect, useCallback } from "react";
import { Terminal } from "./components/Terminal";
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

type Phase = "loading" | "idle" | "installed" | "password" | "installing" | "done" | "error";

interface StatusInfo {
  installed: boolean;
  version?: string;
  running: boolean;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [validating, setValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [verbose, setVerbose] = useState(false);
  const [statusInfo, setStatusInfo] = useState<StatusInfo | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data: StatusInfo = await res.json();
        setStatusInfo(data);
        if (data.installed) {
          setPhase("installed");
        } else {
          setPhase("idle");
        }
        return;
      }
    } catch { /* ignore */ }
    setPhase("idle");
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const handleInstallClick = () => {
    setPassword("");
    setPasswordError("");
    setPhase("password");
  };

  const handlePasswordSubmit = async () => {
    if (!password.trim()) {
      setPasswordError("请输入密码");
      return;
    }
    setValidating(true);
    setPasswordError("");

    try {
      const res = await fetch("/api/sudo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        setPasswordError("密码错误，请重试");
        setValidating(false);
        return;
      }

      const installRes = await fetch("/api/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, verbose }),
      });
      if (!installRes.ok) {
        const text = await installRes.text();
        setErrorMsg(`安装启动失败: ${text}`);
        setPhase("error");
        setValidating(false);
        return;
      }

      const data = await installRes.json();
      setSessionId(data.session_id);
      setPhase("installing");
    } catch (e) {
      setErrorMsg(`网络错误: ${e instanceof Error ? e.message : String(e)}`);
      setPhase("error");
    } finally {
      setValidating(false);
    }
  };

  const handleCancel = async () => {
    if (sessionId) {
      await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" }).catch(() => {});
    }
    setShowCancelConfirm(false);
    setSessionId(null);
    setPhase("idle");
  };

  const handleExit = useCallback((code: number) => {
    if (code === 0) {
      setPhase("done");
    } else {
      setErrorMsg(`安装进程退出，退出码: ${code}`);
      setPhase("error");
    }
  }, []);

  // Loading
  if (phase === "loading") {
    return (
      <div className="dark h-full w-full flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">检查中…</p>
      </div>
    );
  }

  // Already installed
  if (phase === "installed") {
    return (
      <div className="dark h-full w-full flex flex-col items-center justify-center gap-6 bg-background">
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl">🦞</span>
          <h1 className="text-2xl font-medium text-foreground">ClawLadder 已安装</h1>
          {statusInfo?.version && (
            <p className="text-sm text-muted-foreground">版本: {statusInfo.version}</p>
          )}
          <p className="text-sm text-muted-foreground">
            状态: {statusInfo?.running ? "✅ 运行中" : "⏸ 未运行"}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleInstallClick}>
            重新安装
          </Button>
          <Button variant="outline" onClick={checkStatus}>
            刷新状态
          </Button>
        </div>
      </div>
    );
  }

  // Idle: install button + verbose checkbox
  if (phase === "idle") {
    return (
      <div className="dark h-full w-full flex flex-col items-center justify-center gap-6 bg-background">
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl">🦞</span>
          <h1 className="text-2xl font-medium text-foreground">ClawLadder Installer</h1>
          <p className="text-sm text-muted-foreground">一键安装 ClawLadder</p>
        </div>
        <Button size="lg" onClick={handleInstallClick}>
          安装 ClawLadder
        </Button>
        <div className="flex items-center gap-2">
          <Checkbox
            id="verbose"
            checked={verbose}
            onCheckedChange={(checked) => setVerbose(checked as boolean)}
          />
          <Label htmlFor="verbose" className="text-sm text-muted-foreground cursor-pointer select-none">
            详细日志
          </Label>
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
          onOpenChange={(open) => { if (!open && !validating) setPhase("idle"); }}
        >
          <DialogContent showCloseButton={!validating}>
            <DialogHeader>
              <DialogTitle>输入管理员密码</DialogTitle>
              <DialogDescription>
                安装过程需要管理员权限（sudo）
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); handlePasswordSubmit(); }}
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
          <span className="text-sm text-muted-foreground">🦞 正在安装 ClawLadder…</span>
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
              <Button variant="outline" onClick={() => setShowCancelConfirm(false)}>
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

  // Done: success dialog
  if (phase === "done") {
    return (
      <div className="dark h-full w-full flex items-center justify-center bg-background">
        <Dialog open onOpenChange={() => {}}>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>🎉 安装成功</DialogTitle>
              <DialogDescription>
                OpenClaw 已成功安装。建议前往配置模型以开始使用。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setPhase("idle"); checkStatus(); }}>
                返回首页
              </Button>
              <Button onClick={() => {
                window.open("https://docs.clawladder.ai/start/configuration", "_blank");
              }}>
                前往配置
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Error
  if (phase === "error") {
    return (
      <div className="dark h-full w-full flex flex-col items-center justify-center gap-4 bg-background">
        <p className="text-sm text-destructive">{errorMsg}</p>
        <Button variant="outline" onClick={() => { setPhase("idle"); checkStatus(); }}>
          返回
        </Button>
      </div>
    );
  }

  return null;
}
