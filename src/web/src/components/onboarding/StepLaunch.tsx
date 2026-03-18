// Step 6: 唤醒龙虾 — animated launch button + model check
import { useState, useCallback } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

import {
  runOnboard,
  fetchConfig,
  saveConfig,
  gatewayRestart,
  fetchGatewayStatus,
  devicesAutoApprove,
} from "../../lib/api";

import type { ProviderEntry } from "./StepModels";
import { useOnboardingStore } from "../../stores/onboarding";
import { getProviderMeta } from "./providerMeta";

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  onComplete: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function providerKey(p: ProviderEntry): string {
  if (p.customKey) return p.customKey;
  if (p.id.startsWith("custom-") && p.baseUrl) {
    try {
      const host = new URL(p.baseUrl).hostname.replace(/\./g, "-");
      return `custom-${host}`;
    } catch {
      /* fall through */
    }
  }
  return p.id;
}

// ── Component ──────────────────────────────────────────────────────────────

export function StepLaunch({ onBack, onComplete }: Props) {
  const models = useOnboardingStore((s) => s.modelsConfig);
  const channels = useOnboardingStore((s) => s.channelsConfig);
  const done = useOnboardingStore((s) => s.launchDone);
  const setLaunchDone = useOnboardingStore((s) => s.setLaunchDone);
  const [status, setStatus] = useState("");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");

  const defaultProvider = models.providers.find(
    (p) => p.id === models.defaultProvider && p.enabled,
  );
  const { feishu, dingtalk, wecom, telegram } = channels;
  const hasModel = !!defaultProvider?.selectedModel;

  const handleLaunch = useCallback(async () => {
    setLaunching(true);
    setError("");
    try {
      // 1. Run openclaw onboard
      setStatus("正在初始化 OpenClaw…");
      await runOnboard({
        auth_choice: "skip",
        install_daemon: true,
        skip_channels: true,
        skip_skills: true,
        skip_search: true,
        skip_health: true,
        skip_ui: true,
      });

      // 2. Read back config
      setStatus("正在配置模型和通讯软件…");
      const existingConfig =
        ((await fetchConfig()) as Record<string, unknown>) ?? {};

      // 3. Merge models.providers
      const modelsSection =
        (existingConfig.models as Record<string, unknown>) ?? {};
      const providersObj: Record<string, unknown> =
        (modelsSection.providers as Record<string, unknown>) ?? {};

      const BUILTIN_NO_ENTRY = new Set([
        "anthropic", "openai", "openai-codex", "google", "groq", "mistral",
        "xai", "openrouter", "opencode", "cerebras", "huggingface", "zai",
        "together", "kilocode", "venice", "kimi-coding", "volcengine", "byteplus",
      ]);

      const envObj: Record<string, string> =
        (existingConfig.env as Record<string, string>) ?? {};

      let defaultPrimary = "";

      if (defaultProvider) {
        const p = defaultProvider;
        const key = providerKey(p);
        const meta = getProviderMeta(p.id);

        const isOAuth =
          p.authMode === "oauth" ||
          p.authMode === "plugin-oauth" ||
          p.authMode === "setup-token";

        if (p.apiKey && meta?.envKey && p.authMode === "apiKey") {
          envObj[meta.envKey] = p.apiKey;
        }

        if ((BUILTIN_NO_ENTRY.has(p.id) && !p.baseUrl) || isOAuth) {
          // no entry needed
        } else {
          const entry: Record<string, unknown> = {};
          if (p.apiKey) entry.apiKey = p.apiKey;
          if (p.baseUrl) entry.baseUrl = p.baseUrl;
          if (meta?.api) entry.api = meta.api;
          if (p.api && p.id.startsWith("custom-")) entry.api = p.api;
          if (p.id === "amazon-bedrock") entry.auth = "aws-sdk";
          if (p.selectedModel) {
            entry.models = [{
              id: p.selectedModel,
              name: p.customModelName || `${p.selectedModel} (${p.label || key})`,
              reasoning: false,
              input: ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 16000,
              maxTokens: 4096,
            }];
          }
          providersObj[key] = entry;
        }

        if (p.selectedModel) {
          defaultPrimary = `${key}/${p.selectedModel}`;
        }
      }

      if (Object.keys(envObj).length > 0) existingConfig.env = envObj;

      existingConfig.models = {
        ...modelsSection,
        mode: "merge",
        providers: providersObj,
      };

      const agents = (existingConfig.agents as Record<string, unknown>) ?? {};
      const defaults = (agents.defaults as Record<string, unknown>) ?? {};
      const modelDefaults = (defaults.model as Record<string, unknown>) ?? {};
      existingConfig.agents = {
        ...agents,
        defaults: {
          ...defaults,
          model: { ...modelDefaults, primary: defaultPrimary },
        },
      };

      // 4. Merge channels
      const channelsObj: Record<string, unknown> =
        (existingConfig.channels as Record<string, unknown>) ?? {};

      if (feishu.enabled && feishu.appId && feishu.appSecret) {
        channelsObj.feishu = {
          enabled: true,
          appId: feishu.appId,
          appSecret: feishu.appSecret,
          connectionMode: feishu.connectionMode,
          domain: feishu.domain,
          dmPolicy: "pairing",
          groups: { "*": { requireMention: true } },
        };
      }

      if (telegram.enabled && telegram.botToken) {
        channelsObj.telegram = {
          enabled: true,
          botToken: telegram.botToken,
          dmPolicy: "pairing",
          groups: { "*": { requireMention: true } },
        };
      }

      if (dingtalk.enabled && dingtalk.clientId && dingtalk.clientSecret) {
        // Read gateway auth token so dingtalk connector can authenticate
        const gwAuth = (
          (existingConfig.gateway as Record<string, unknown>)?.auth as Record<string, unknown>
        ) ?? {};
        channelsObj["dingtalk-connector"] = {
          enabled: true,
          clientId: dingtalk.clientId,
          clientSecret: dingtalk.clientSecret,
          separateSessionByConversation: true,
          ...(gwAuth.token ? { gatewayToken: gwAuth.token } : {}),
        };
      }

      if (wecom.enabled && wecom.botId && wecom.secret) {
        channelsObj.wecom = {
          enabled: true,
          botId: wecom.botId,
          secret: wecom.secret,
          dmPolicy: "open",
          groupPolicy: "open",
        };
      }

      existingConfig.channels = channelsObj;

      // 4.5 Ensure gateway defaults are set
      const gwSection = (existingConfig.gateway as Record<string, unknown>) ?? {};
      if (!gwSection.trustedProxies) {
        gwSection.trustedProxies = ["127.0.0.1"];
      }
      // Ensure controlUi.allowedOrigins so the web dashboard can reach the gateway
      if (!gwSection.controlUi) {
        gwSection.controlUi = {
          allowedOrigins: ["http://127.0.0.1:18789"],
        };
      }
      // Enable HTTP chatCompletions endpoint when dingtalk is enabled
      // (dingtalk connector calls /v1/chat/completions via HTTP)
      if (dingtalk.enabled) {
        const http = (gwSection.http as Record<string, unknown>) ?? {};
        const endpoints = (http.endpoints as Record<string, unknown>) ?? {};
        const cc = (endpoints.chatCompletions as Record<string, unknown>) ?? {};
        cc.enabled = true;
        endpoints.chatCompletions = cc;
        http.endpoints = endpoints;
        gwSection.http = http;
      }
      existingConfig.gateway = gwSection;

      // 5. Save
      setStatus("正在保存配置…");
      await saveConfig(existingConfig);

      // 6. Restart gateway
      setStatus("正在唤醒龙虾…");
      await gatewayRestart();

      // 7. Poll until running, then auto-approve device pairing
      setStatus("龙虾正在苏醒…");
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const gs = await fetchGatewayStatus();
          if (gs.running) {
            // Gateway is up — auto-approve pending device pairing requests
            setStatus("正在完成设备配对…");
            try {
              await devicesAutoApprove();
            } catch { /* non-fatal */ }
            setStatus("龙虾已苏醒 🦞");
            setLaunchDone(true);
            return;
          }
        } catch { /* keep polling */ }
      }

      setStatus("唤醒超时，请稍后在 Dashboard 中检查状态。");
      setLaunchDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "唤醒失败");
    } finally {
      setLaunching(false);
    }
  }, [defaultProvider, models.defaultProvider, feishu, dingtalk, wecom, telegram]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Content area */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 py-8">
        {/* Model warning */}
        {!hasModel && !done && (
          <div className="mb-6 w-full max-w-sm flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="text-xs leading-relaxed">
              你还没有配置 AI 模型。唤醒后龙虾将无法处理消息。
              <br />
              建议先返回第 1 步配置至少一个模型。
            </div>
          </div>
        )}

        {/* Lobster + button area */}
        {!done ? (
          <div className="flex flex-col items-center gap-6">
            {/* Sleeping lobster */}
            <div className="relative">
              <div
                className={cn(
                  "absolute inset-0 rounded-full scale-150 transition-all duration-1000",
                  launching
                    ? "blur-3xl bg-orange-500/30 animate-pulse"
                    : "blur-3xl bg-muted-foreground/5",
                )}
              />
              <span
                className={cn(
                  "relative z-10 block text-7xl transition-transform duration-500",
                  launching && "animate-bounce",
                )}
              >
                🦞
              </span>
              {!launching && (
                <span className="absolute -top-2 -right-2 text-2xl animate-pulse">
                  💤
                </span>
              )}
            </div>

            <div className="text-center">
              <h2 className="text-xl font-bold tracking-tight mb-1">
                {launching ? "龙虾正在苏醒…" : "龙虾还在沉睡"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {launching
                  ? status || "请稍候…"
                  : "一切就绪，点击下方按钮唤醒你的 AI 龙虾助手。"}
              </p>
            </div>

            {/* The cool launch button */}
            <button
              onClick={handleLaunch}
              disabled={launching}
              className={cn(
                "install-btn relative px-10 py-4 rounded-2xl font-bold text-lg",
                "transition-all duration-300 ease-out",
                "bg-gradient-to-r from-orange-500 via-red-500 to-orange-600",
                "text-white",
                "hover:scale-105",
                "active:scale-95",
                "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              <span className="relative z-10 flex items-center gap-2">
                {launching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    唤醒中…
                  </>
                ) : (
                  <>
                    🔥 唤醒龙虾
                  </>
                )}
              </span>
            </button>

            {error && (
              <p className="text-sm text-destructive mt-2">{error}</p>
            )}
          </div>
        ) : (
          /* Success state */
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 blur-3xl bg-emerald-500/20 rounded-full scale-150 animate-pulse" />
              <span className="relative z-10 block text-7xl">🦞</span>
              <span className="absolute -top-1 -right-1 text-2xl">✨</span>
            </div>

            <div className="text-center">
              <h2 className="text-xl font-bold tracking-tight text-emerald-500 mb-1">
                龙虾已苏醒！
              </h2>
              <p className="text-sm text-muted-foreground">
                OpenClaw Gateway 已启动，你的 AI 助手已准备就绪。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 flex justify-between pt-4 px-4 border-t border-border">
        <Button variant="outline" onClick={onBack} disabled={launching}>
          ← 上一步
        </Button>
        <Button onClick={onComplete} disabled={launching}>
          下一步 →
        </Button>
      </div>
    </div>
  );
}
