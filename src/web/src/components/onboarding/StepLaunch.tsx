// Step 5: Confirm & Launch — runs onboard, merges config, starts gateway
import { useState, useCallback } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";

import {
  runOnboard,
  fetchConfig,
  saveConfig,
  gatewayRestart,
  fetchGatewayStatus,
  fetchGatewayUrl,
} from "../../lib/api";

import type { ProviderEntry } from "./StepModels";
import { useOnboardingStore } from "../../stores/onboarding";

// Re-export the metadata lookup so we can use it here
import { getProviderMeta } from "./StepModels";

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  onComplete: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Generate a provider key for the openclaw config */
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
  const [status, setStatus] = useState("");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [dashboardUrl, setDashboardUrl] = useState("");
  const [showDialog, setShowDialog] = useState(false);

  const defaultProvider = models.providers.find(
    (p) => p.id === models.defaultProvider && p.enabled,
  );
  const { feishu, telegram } = channels;

  const handleLaunch = useCallback(async () => {
    setShowDialog(true);
    setLaunching(true);
    setError("");
    try {
      // ── 1. Run openclaw onboard (base config + daemon install) ──────
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

      // ── 2. Read back the generated config ──────────────────────────
      setStatus("正在配置模型和通讯软件…");
      const existingConfig =
        ((await fetchConfig()) as Record<string, unknown>) ?? {};

      // ── 3. Merge models.providers ──────────────────────────────────
      const modelsSection =
        (existingConfig.models as Record<string, unknown>) ?? {};
      const providersObj: Record<string, unknown> =
        (modelsSection.providers as Record<string, unknown>) ?? {};

      // Built-in providers that are in the pi-ai catalog don't need a
      // models.providers entry — they only need env + model ref.
      // Providers that need baseUrl or custom config DO need an entry.
      const BUILTIN_NO_ENTRY = new Set([
        "anthropic",
        "openai",
        "openai-codex",
        "google",
        "groq",
        "mistral",
        "xai",
        "openrouter",
        "opencode",
        "cerebras",
        "huggingface",
        "zai",
        "together",
        "kilocode",
        "venice",
        "kimi-coding",
        "volcengine",
        "byteplus",
      ]);

      // Collect env vars to set
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

        // Set env var for API key
        if (p.apiKey && meta?.envKey && p.authMode === "apiKey") {
          envObj[meta.envKey] = p.apiKey;
        }

        if ((BUILTIN_NO_ENTRY.has(p.id) && !p.baseUrl) || isOAuth) {
          // Built-in or OAuth: no models.providers entry needed
        } else {
          const entry: Record<string, unknown> = {};

          if (p.apiKey) entry.apiKey = p.apiKey;
          if (p.baseUrl) entry.baseUrl = p.baseUrl;

          if (meta?.api) entry.api = meta.api;
          if (p.api && p.id.startsWith("custom-")) entry.api = p.api;

          if (p.id === "amazon-bedrock") {
            entry.auth = "aws-sdk";
          }

          if (p.selectedModel) {
            entry.models = [
              {
                id: p.selectedModel,
                name: p.customModelName || `${p.selectedModel} (${p.label || key})`,
                reasoning: false,
                input: ["text"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 16000,
                maxTokens: 4096,
              },
            ];
          }

          providersObj[key] = entry;
        }

        if (p.selectedModel) {
          defaultPrimary = `${key}/${p.selectedModel}`;
        }
      }

      if (Object.keys(envObj).length > 0) {
        existingConfig.env = envObj;
      }

      existingConfig.models = {
        ...modelsSection,
        mode: "merge",
        providers: providersObj,
      };

      // agents.defaults.model.primary
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

      // ── 4. Merge channels (通讯软件) ──────────────────────────────────
      const channelsObj: Record<string, unknown> =
        (existingConfig.channels as Record<string, unknown>) ?? {};

      if (feishu.enabled && feishu.appId && feishu.appSecret) {
        channelsObj.feishu = {
          enabled: true,
          appId: feishu.appId,
          appSecret: feishu.appSecret,
          connectionMode: feishu.connectionMode,
          domain: feishu.domain,
          groupPolicy: feishu.groupPolicy,
          dmPolicy: feishu.dmPolicy,
          allowFrom: ["*"],
        };
      }

      if (telegram.enabled && telegram.botToken) {
        channelsObj.telegram = {
          enabled: true,
          botToken: telegram.botToken,
          groupPolicy: telegram.groupPolicy,
          dmPolicy: telegram.dmPolicy,
          allowFrom: ["*"],
        };
      }

      existingConfig.channels = channelsObj;

      // ── 5. Save merged config ──────────────────────────────────────
      setStatus("正在保存配置…");
      await saveConfig(existingConfig);

      // ── 6. Restart gateway ─────────────────────────────────────────
      setStatus("正在重启 Gateway…");
      await gatewayRestart();

      // ── 7. Poll gateway until reachable ────────────────────────────
      setStatus("等待 Gateway 启动…");
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const gs = await fetchGatewayStatus();
          if (gs.running) {
            // Get dashboard URL
            try {
              const url = await fetchGatewayUrl();
              setDashboardUrl(url.httpUrl);
            } catch {
              /* ok */
            }
            setStatus("Gateway 已启动 ✓");
            setDone(true);
            return;
          }
        } catch {
          /* keep polling */
        }
      }

      setStatus("Gateway 启动超时，请稍后在 Dashboard 中检查状态。");
      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "启动失败");
    } finally {
      setLaunching(false);
    }
  }, [defaultProvider, models.defaultProvider, feishu, telegram]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 pb-4">
        <h2 className="text-lg font-semibold">确认并启动</h2>
        <p className="text-sm text-muted-foreground mt-1">
          检查配置摘要，然后启动 OpenClaw Gateway。
        </p>
      </div>

      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div>
          <div className="flex flex-col gap-4 pb-4 px-4">
            {/* Models summary */}
            <Card className="border border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">AI 模型</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {!defaultProvider ? (
                  <p className="text-xs text-muted-foreground">未配置</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="secondary" className="text-[10px]">
                        {defaultProvider.label || defaultProvider.id}
                      </Badge>
                      <span className="text-muted-foreground">
                        {defaultProvider.selectedModel || "(未选模型)"}
                      </span>
                      {defaultProvider.authMode === "oauth" ||
                      defaultProvider.authMode === "plugin-oauth" ? (
                        <Badge
                          variant={
                            defaultProvider.authenticated
                              ? "secondary"
                              : "outline"
                          }
                          className="text-[10px]"
                        >
                          {defaultProvider.authenticated
                            ? "OAuth ✓"
                            : "OAuth ✗"}
                        </Badge>
                      ) : null}
                      <Badge className="text-[10px]">默认</Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Channels summary — only show enabled ones */}
            <Card className="border border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">通讯软件</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {!feishu.enabled && !telegram.enabled ? (
                  <p className="text-xs text-muted-foreground">未配置</p>
                ) : (
                  <div className="flex gap-2">
                    {feishu.enabled && (
                      <Badge variant="secondary">飞书 ✓</Badge>
                    )}
                    {telegram.enabled && (
                      <Badge variant="secondary">Telegram ✓</Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Skills summary */}
            <Card className="border border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Skills</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">
                  自动检测，无需手动配置
                </p>
              </CardContent>
            </Card>

            {/* Hooks summary */}
            <Card className="border border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Hooks</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">
                  自动检测，无需手动配置
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </ScrollArea>

      {/* Status area */}
      {(status || error) && (
        <Card
          className={`mx-4 mb-4 shrink-0 ${error ? "border border-destructive" : "border border-border"}`}
        >
          <CardContent>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{status}</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="shrink-0 flex justify-between pt-4 px-4 border-t border-border">
        <Button variant="outline" onClick={onBack} disabled={launching}>
          ← 上一步
        </Button>
        {done ? (
          <Button onClick={onComplete}>完成配置 →</Button>
        ) : (
          <Button onClick={handleLaunch} disabled={launching}>
            {launching ? "启动中…" : "🚀 启动 OpenClaw"}
          </Button>
        )}
      </div>
    </div>
  );
}
