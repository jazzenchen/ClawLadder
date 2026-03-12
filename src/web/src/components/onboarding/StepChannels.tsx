// Step 2: IM Channel configuration (Feishu + Telegram)
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { ScrollArea } from "../ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

import { useOnboardingStore } from "../../stores/onboarding";

// ── Exported state shape ───────────────────────────────────────────────────

export interface FeishuConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  connectionMode: "websocket" | "webhook";
  domain: "feishu" | "lark";
  groupPolicy: "open" | "mention" | "off";
  dmPolicy: "open" | "off";
}

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  groupPolicy: "open" | "mention" | "off";
  dmPolicy: "open" | "off";
}

export interface ChannelsConfig {
  feishu: FeishuConfig;
  telegram: TelegramConfig;
}

export const defaultChannelsConfig: ChannelsConfig = {
  feishu: {
    enabled: false,
    appId: "",
    appSecret: "",
    connectionMode: "websocket",
    domain: "feishu",
    groupPolicy: "open",
    dmPolicy: "open",
  },
  telegram: {
    enabled: false,
    botToken: "",
    groupPolicy: "open",
    dmPolicy: "open",
  },
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
  const { feishu, telegram } = value;

  const updateFeishu = (patch: Partial<FeishuConfig>) =>
    onChange({ ...value, feishu: { ...feishu, ...patch } });

  const updateTelegram = (patch: Partial<TelegramConfig>) =>
    onChange({ ...value, telegram: { ...telegram, ...patch } });

  // At least one channel should be configured (or user can skip)
  const hasAnyChannel =
    (feishu.enabled && feishu.appId && feishu.appSecret) ||
    (telegram.enabled && telegram.botToken);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 pb-4">
        <h2 className="text-lg font-semibold">通讯软件配置</h2>
        <p className="text-sm text-muted-foreground mt-1">
          配置通讯软件，让 OpenClaw
          能接收和回复消息。可以跳过，稍后在设置中配置。
        </p>
      </div>

      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div>
          <div className="flex flex-col gap-4 pb-4 px-4">
            {/* ── Feishu ─────────────────────────────────────────────────────── */}
            <Card
              className={`border border-border ${!feishu.enabled ? "opacity-60" : ""}`}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <CardTitle className="text-sm truncate">
                      飞书 (Feishu / Lark)
                    </CardTitle>
                    {feishu.enabled && (
                      <Badge variant="secondary" className="shrink-0">
                        已启用
                      </Badge>
                    )}
                  </div>
                  <div className="shrink-0">
                    <Switch
                      checked={feishu.enabled}
                      onCheckedChange={(v) => updateFeishu({ enabled: v })}
                    />
                  </div>
                </div>
              </CardHeader>
              {feishu.enabled && (
                <CardContent className="flex flex-col gap-3 pt-0">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">App ID</Label>
                      <Input
                        placeholder="cli_xxxxxxxx"
                        value={feishu.appId}
                        onChange={(e) =>
                          updateFeishu({ appId: e.target.value })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">App Secret</Label>
                      <Input
                        type="password"
                        placeholder="xxxxxxxxxxxxxxxx"
                        value={feishu.appSecret}
                        onChange={(e) =>
                          updateFeishu({ appSecret: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">域名</Label>
                      <Select
                        value={feishu.domain}
                        onValueChange={(v) =>
                          updateFeishu({ domain: v as "feishu" | "lark" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="feishu">
                            feishu.cn (国内)
                          </SelectItem>
                          <SelectItem value="lark">lark.com (海外)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">连接方式</Label>
                      <Select
                        value={feishu.connectionMode}
                        onValueChange={(v) =>
                          updateFeishu({
                            connectionMode: v as "websocket" | "webhook",
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="websocket">
                            WebSocket (推荐)
                          </SelectItem>
                          <SelectItem value="webhook">Webhook</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">群聊策略</Label>
                      <Select
                        value={feishu.groupPolicy}
                        onValueChange={(v) =>
                          updateFeishu({
                            groupPolicy: v as "open" | "mention" | "off",
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">开放 (所有消息)</SelectItem>
                          <SelectItem value="mention">仅 @提及</SelectItem>
                          <SelectItem value="off">关闭</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">私聊策略</Label>
                      <Select
                        value={feishu.dmPolicy}
                        onValueChange={(v) =>
                          updateFeishu({ dmPolicy: v as "open" | "off" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">开放</SelectItem>
                          <SelectItem value="off">关闭</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    需要在飞书开放平台创建应用并开启{" "}
                    <code>contact:contact.base:readonly</code> 权限。
                  </p>
                </CardContent>
              )}
            </Card>

            {/* ── Telegram ───────────────────────────────────────────────────── */}
            <Card
              className={`border border-border ${!telegram.enabled ? "opacity-60" : ""}`}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <CardTitle className="text-sm truncate">Telegram</CardTitle>
                    {telegram.enabled && (
                      <Badge variant="secondary" className="shrink-0">
                        已启用
                      </Badge>
                    )}
                  </div>
                  <div className="shrink-0">
                    <Switch
                      checked={telegram.enabled}
                      onCheckedChange={(v) => updateTelegram({ enabled: v })}
                    />
                  </div>
                </div>
              </CardHeader>
              {telegram.enabled && (
                <CardContent className="flex flex-col gap-3 pt-0">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Bot Token</Label>
                    <Input
                      type="password"
                      placeholder="123456:ABC-DEF..."
                      value={telegram.botToken}
                      onChange={(e) =>
                        updateTelegram({ botToken: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">群聊策略</Label>
                      <Select
                        value={telegram.groupPolicy}
                        onValueChange={(v) =>
                          updateTelegram({
                            groupPolicy: v as "open" | "mention" | "off",
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">开放</SelectItem>
                          <SelectItem value="mention">仅 @提及</SelectItem>
                          <SelectItem value="off">关闭</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">私聊策略</Label>
                      <Select
                        value={telegram.dmPolicy}
                        onValueChange={(v) =>
                          updateTelegram({ dmPolicy: v as "open" | "off" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">开放</SelectItem>
                          <SelectItem value="off">关闭</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    通过 @BotFather 创建 Bot 并获取 Token。
                  </p>
                </CardContent>
              )}
            </Card>
          </div>
        </div>
      </ScrollArea>

      <div className="shrink-0 flex justify-between pt-4 px-4 border-t border-border">
        <Button variant="outline" onClick={onBack}>
          ← 上一步
        </Button>
        <div className="flex gap-2">
          {!hasAnyChannel && (
            <Button variant="ghost" onClick={onNext}>
              跳过
            </Button>
          )}
          <Button onClick={onNext} disabled={false}>
            下一步 →
          </Button>
        </div>
      </div>
    </div>
  );
}
