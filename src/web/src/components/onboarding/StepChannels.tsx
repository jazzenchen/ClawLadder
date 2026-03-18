// Step 2: IM Channel configuration (Feishu + DingTalk + WeCom + Telegram)
import { useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { ScrollArea } from "../ui/scroll-area";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

import { useOnboardingStore } from "../../stores/onboarding";
import { pluginsInstall } from "../../lib/api";

// ── Exported state shape ───────────────────────────────────────────────────

export interface FeishuConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  connectionMode: "websocket" | "webhook";
  domain: "feishu" | "lark";
}

export interface DingtalkConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
}

export interface WecomConfig {
  enabled: boolean;
  botId: string;
  secret: string;
}

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
}

export interface ChannelsConfig {
  feishu: FeishuConfig;
  dingtalk: DingtalkConfig;
  wecom: WecomConfig;
  telegram: TelegramConfig;
}

export const defaultChannelsConfig: ChannelsConfig = {
  feishu: {
    enabled: false,
    appId: "",
    appSecret: "",
    connectionMode: "websocket",
    domain: "feishu",
  },
  dingtalk: {
    enabled: false,
    clientId: "",
    clientSecret: "",
  },
  wecom: {
    enabled: false,
    botId: "",
    secret: "",
  },
  telegram: {
    enabled: false,
    botToken: "",
  },
};

// ── Plugin package names ────────────────────────────────────────────────────

const PLUGIN_PACKAGES: Record<string, string> = {
  dingtalk: "@dingtalk-real-ai/dingtalk-connector",
  wecom: "@wecom/wecom-openclaw-plugin",
};

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onNext: () => void;
  onBack: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function StepChannels({ onNext, onBack }: Props) {
  const value = useOnboardingStore((s) => s.channelsConfig);
  const onChange = useOnboardingStore((s) => s.setChannelsConfig);
  const useChinaMirror = useOnboardingStore((s) => s.useChinaMirror);
  const { feishu, dingtalk, wecom, telegram } = value;

  // Track plugin install status per channel
  const [installing, setInstalling] = useState<Record<string, boolean>>({});
  const [installError, setInstallError] = useState<Record<string, string>>({});

  /** Install plugin when user enables a channel that needs one */
  const handlePluginInstall = async (channel: string) => {
    const pkg = PLUGIN_PACKAGES[channel];
    if (!pkg) return;
    setInstalling((s) => ({ ...s, [channel]: true }));
    setInstallError((s) => ({ ...s, [channel]: "" }));
    try {
      await pluginsInstall(pkg);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setInstallError((s) => ({ ...s, [channel]: msg }));
    } finally {
      setInstalling((s) => ({ ...s, [channel]: false }));
    }
  };

  const toggleChannel = (
    channel: "feishu" | "dingtalk" | "wecom" | "telegram",
    enabled: boolean,
  ) => {
    onChange({ ...value, [channel]: { ...value[channel], enabled } });
    // Auto-install plugin when enabling
    if (enabled && PLUGIN_PACKAGES[channel]) {
      handlePluginInstall(channel);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ScrollArea className="flex-1 min-h-0 px-4">
        <div className="max-w-xl mx-auto py-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">通讯软件</h2>
            <p className="text-sm text-muted-foreground mt-1">
              配置 IM 通道，让 AI 助手接入你的聊天工具。可以先跳过，稍后在设置中配置。
            </p>
          </div>

          {/* ── 飞书 / Lark ─────────────────────────────────────── */}
          <div className="space-y-4">
            <Card className={feishu.enabled ? "border-primary/40" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    飞书 / Lark
                    {feishu.enabled && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        已启用
                      </Badge>
                    )}
                  </CardTitle>
                  <Switch
                    checked={feishu.enabled}
                    onCheckedChange={(v) => toggleChannel("feishu", v)}
                  />
                </div>
              </CardHeader>
              {feishu.enabled && (
                <CardContent className="space-y-3 pt-0">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">App ID</Label>
                      <Input
                        placeholder="cli_xxxx"
                        value={feishu.appId}
                        onChange={(e) =>
                          onChange({
                            ...value,
                            feishu: { ...feishu, appId: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">App Secret</Label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={feishu.appSecret}
                        onChange={(e) =>
                          onChange({
                            ...value,
                            feishu: { ...feishu, appSecret: e.target.value },
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">连接方式</Label>
                      <Select
                        value={feishu.connectionMode}
                        onValueChange={(v) =>
                          onChange({
                            ...value,
                            feishu: {
                              ...feishu,
                              connectionMode: v as "websocket" | "webhook",
                            },
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="websocket">WebSocket（推荐）</SelectItem>
                          <SelectItem value="webhook">Webhook</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">域名</Label>
                      <Select
                        value={feishu.domain}
                        onValueChange={(v) =>
                          onChange({
                            ...value,
                            feishu: {
                              ...feishu,
                              domain: v as "feishu" | "lark",
                            },
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="feishu">feishu.cn（国内）</SelectItem>
                          <SelectItem value="lark">lark.com（海外）</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    在{" "}
                    <a
                      href="https://open.feishu.cn/app"
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      飞书开放平台
                    </a>{" "}
                    创建应用并获取凭证。保存后将自动启用配对模式，新用户需发送 <code>/pair</code> 验证。
                  </p>
                </CardContent>
              )}
            </Card>

            {/* ── 钉钉 ─────────────────────────────────────────── */}
            <Card className={dingtalk.enabled ? "border-primary/40" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    钉钉
                    {dingtalk.enabled && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        已启用
                      </Badge>
                    )}
                    {installing.dingtalk && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        安装插件中…
                      </Badge>
                    )}
                  </CardTitle>
                  <Switch
                    checked={dingtalk.enabled}
                    onCheckedChange={(v) => toggleChannel("dingtalk", v)}
                  />
                </div>
              </CardHeader>
              {dingtalk.enabled && (
                <CardContent className="space-y-3 pt-0">
                  {installError.dingtalk && (
                    <p className="text-[11px] text-destructive">{installError.dingtalk}</p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Client ID (AppKey)</Label>
                      <Input
                        placeholder="dingxxxxxxxxx"
                        value={dingtalk.clientId}
                        onChange={(e) =>
                          onChange({
                            ...value,
                            dingtalk: { ...dingtalk, clientId: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Client Secret (AppSecret)</Label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={dingtalk.clientSecret}
                        onChange={(e) =>
                          onChange({
                            ...value,
                            dingtalk: { ...dingtalk, clientSecret: e.target.value },
                          })
                        }
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    在{" "}
                    <a
                      href="https://open-dev.dingtalk.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      钉钉开放平台
                    </a>{" "}
                    创建企业内部应用，获取 AppKey 和 AppSecret。机器人需配置为 Stream 模式。
                  </p>
                </CardContent>
              )}
            </Card>

            {/* ── 企业微信 ─────────────────────────────────────── */}
            <Card className={wecom.enabled ? "border-primary/40" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    企业微信
                    {wecom.enabled && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        已启用
                      </Badge>
                    )}
                    {installing.wecom && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        安装插件中…
                      </Badge>
                    )}
                  </CardTitle>
                  <Switch
                    checked={wecom.enabled}
                    onCheckedChange={(v) => toggleChannel("wecom", v)}
                  />
                </div>
              </CardHeader>
              {wecom.enabled && (
                <CardContent className="space-y-3 pt-0">
                  {installError.wecom && (
                    <p className="text-[11px] text-destructive">{installError.wecom}</p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Bot ID</Label>
                      <Input
                        placeholder="bot_id"
                        value={wecom.botId}
                        onChange={(e) =>
                          onChange({
                            ...value,
                            wecom: { ...wecom, botId: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Secret</Label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={wecom.secret}
                        onChange={(e) =>
                          onChange({
                            ...value,
                            wecom: { ...wecom, secret: e.target.value },
                          })
                        }
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    在{" "}
                    <a
                      href="https://developer.work.weixin.qq.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      企业微信开发者平台
                    </a>{" "}
                    创建 AI 机器人，获取 Bot ID 和 Secret。支持 WebSocket 长连接、单聊和群聊。
                  </p>
                </CardContent>
              )}
            </Card>

            {/* ── Telegram (hidden when useChinaMirror) ────────── */}
            {!useChinaMirror && (
              <Card className={telegram.enabled ? "border-primary/40" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      Telegram
                      {telegram.enabled && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          已启用
                        </Badge>
                      )}
                    </CardTitle>
                    <Switch
                      checked={telegram.enabled}
                      onCheckedChange={(v) => toggleChannel("telegram", v)}
                    />
                  </div>
                </CardHeader>
                {telegram.enabled && (
                  <CardContent className="space-y-3 pt-0">
                    <div>
                      <Label className="text-xs">Bot Token</Label>
                      <Input
                        placeholder="123456:ABC-DEF..."
                        value={telegram.botToken}
                        onChange={(e) =>
                          onChange({
                            ...value,
                            telegram: { ...telegram, botToken: e.target.value },
                          })
                        }
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      通过{" "}
                      <a
                        href="https://t.me/BotFather"
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        @BotFather
                      </a>{" "}
                      创建机器人并获取 Token。保存后将自动启用配对模式，新用户需发送 <code>/pair</code> 验证。
                    </p>
                  </CardContent>
                )}
              </Card>
            )}
          </div>
        </div>
      </ScrollArea>

      <div className="shrink-0 flex justify-between pt-4 px-4 border-t border-border">
        <Button variant="outline" onClick={onBack}>
          ← 上一步
        </Button>
        <Button onClick={onNext}>
          下一步 →
        </Button>
      </div>
    </div>
  );
}
