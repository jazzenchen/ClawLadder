// Step 4: Hooks — diff-based enable/disable on "下一步"
import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Switch } from "../ui/switch";
import { ScrollArea } from "../ui/scroll-area";

import {
  fetchHooks,
  enableHook,
  disableHook,
  type HookInfo,
} from "../../lib/api";

import { useOnboardingStore } from "../../stores/onboarding";

// ── Hook detailed descriptions ──────────────────────────────────────────────

const HOOK_DETAILS: Record<string, string> = {
  "boot-md":
    "Gateway 启动时自动执行 BOOTSTRAP.md，引导 Agent 建立人设（名字、性格、语气等），并初始化工作区上下文。",
  "bootstrap-extra-files":
    "Agent 启动时注入额外的工作区文件（通过 glob/path 模式匹配），让 Agent 自动获取项目规范、文档等上下文。",
  "command-logger":
    "将所有命令事件记录到统一的审计日志文件中，方便追踪操作历史和排查问题。",
  "session-memory":
    "在执行 /new 或 /reset 命令时，自动将当前会话上下文保存到记忆中，下次对话可以延续之前的上下文。",
};

// ── Persisted state (lifted to wizard) ──────────────────────────────────────

export interface HooksStepState {
  /** Hooks list from server (fetched once) */
  hooks: HookInfo[];
  /** Snapshot: which hooks were disabled when step first loaded */
  initialDisabled: Set<string>;
  /** Current local UI state: which hooks are disabled */
  localDisabled: Set<string>;
  /** Whether we've done the initial fetch */
  loaded: boolean;
}

export const defaultHooksStepState: HooksStepState = {
  hooks: [],
  initialDisabled: new Set(),
  localDisabled: new Set(),
  loaded: false,
};

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onNext: () => void;
  onBack: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function StepHooks({ onNext, onBack }: Props) {
  const state = useOnboardingStore((s) => s.hooksState);
  const patch = useOnboardingStore((s) => s.patchHooksState);
  const [loading, setLoading] = useState(!state.loaded);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const { hooks, initialDisabled, localDisabled, loaded } = state;

  // ── Fetch hooks (only if not already loaded) ────────────────────────────

  const load = useCallback(() => {
    if (loaded) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchHooks()
      .then((res) => {
        const list = res.hooks ?? [];
        const disabledSet = new Set(
          list.filter((h) => h.disabled).map((h) => h.name),
        );
        patch({
          hooks: list,
          initialDisabled: disabledSet,
          localDisabled: new Set(disabledSet),
          loaded: true,
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Toggle (local only) ─────────────────────────────────────────────────

  const handleToggle = (hookName: string) => {
    const next = new Set(localDisabled);
    if (next.has(hookName)) {
      next.delete(hookName);
    } else {
      next.add(hookName);
    }
    patch({ localDisabled: next });
  };

  // ── Handle next: diff → disable → enable ────────────────────────────────

  const handleNext = async () => {
    // Compute diff
    const toDisable = hooks.filter(
      (h) => localDisabled.has(h.name) && !initialDisabled.has(h.name),
    );
    const toEnable = hooks.filter(
      (h) => !localDisabled.has(h.name) && initialDisabled.has(h.name),
    );

    // No changes → skip
    if (toDisable.length === 0 && toEnable.length === 0) {
      onNext();
      return;
    }

    setProcessing(true);
    const total = toDisable.length + toEnable.length;
    let current = 0;
    let hasError = false;

    // Phase 1: Disable
    for (const hook of toDisable) {
      current++;
      setProgressLabel(`禁用 ${current}/${total}`);
      try {
        await disableHook(hook.name);
      } catch (e) {
        hasError = true;
        setError(e instanceof Error ? e.message : "禁用失败");
      }
    }

    // Phase 2: Enable
    if (!hasError) {
      for (const hook of toEnable) {
        current++;
        setProgressLabel(`启用 ${current}/${total}`);
        try {
          await enableHook(hook.name);
        } catch (e) {
          hasError = true;
          setError(e instanceof Error ? e.message : "启用失败");
        }
      }
    }

    // Update snapshot to reflect new reality
    if (!hasError) {
      patch({ initialDisabled: new Set(localDisabled) });
    }

    setProgressLabel(null);
    setProcessing(false);
    if (!hasError) onNext();
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 pb-4">
        <h2 className="text-lg font-semibold">Hooks</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Hooks 是 OpenClaw 的事件钩子，在特定事件（如收到消息、会话开始等）触发时自动执行。
          你可以根据需要启用或禁用它们，点击下一步后生效。
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {loading && (
          <Card className="border border-border shrink-0 mx-4">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              正在加载 Hooks…
            </CardContent>
          </Card>
        )}

        {error && !loading && (
          <Card className="border border-border shrink-0 mx-4">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              暂时无法加载 Hooks（OpenClaw CLI 未就绪），可直接跳过此步骤。
            </CardContent>
          </Card>
        )}

        {!loading && hooks.length === 0 && !error && (
          <Card className="border border-border shrink-0 mx-4">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              未检测到任何 Hooks
            </CardContent>
          </Card>
        )}

        {!loading && hooks.length > 0 && (
          <ScrollArea className="flex-1 min-h-0 overflow-hidden">
            <div>
              <div className="flex flex-col gap-4 pb-4 px-4">
                {hooks.map((hook) => {
                  const isDisabled = localDisabled.has(hook.name);
                  return (
                    <Card
                      key={hook.name}
                      className={`border border-border ${isDisabled ? "opacity-60" : ""}`}
                    >
                      <CardHeader>
                        <div className="flex items-center gap-4">
                          <div className="min-w-0 flex-1 flex items-center gap-4">
                            {hook.emoji && (
                              <span className="text-base shrink-0">
                                {hook.emoji}
                              </span>
                            )}
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <CardTitle className="text-sm truncate">
                                {hook.name}
                              </CardTitle>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {HOOK_DETAILS[hook.name] || hook.description}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0">
                            <Switch
                              checked={!isDisabled}
                              disabled={processing || !hook.eligible}
                              onCheckedChange={() => handleToggle(hook.name)}
                            />
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        )}
      </div>

      <div className="shrink-0 flex justify-between items-center pt-4 px-4 border-t border-border">
        <Button variant="outline" onClick={onBack} disabled={processing}>
          ← 上一步
        </Button>
        <div className="flex items-center gap-3">
          {progressLabel && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              {progressLabel}
            </span>
          )}
          <Button onClick={handleNext} disabled={processing}>
            下一步 →
          </Button>
        </div>
      </div>
    </div>
  );
}
