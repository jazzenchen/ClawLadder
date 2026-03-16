import { useEffect, useState, useCallback } from "react";
import {
  Radio,
  MessageSquare,
  Hash,
  RefreshCw,
  CheckCircle2,
  Loader2,
  UserCheck,
  Plus,
  Save,
  Pencil,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  fetchChannelsStatus,
  fetchPairingList,
  approvePairing,
  fetchConfig,
  saveConfig,
  gatewayRestart,
  type PairingRequest,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ChannelProbe {
  ok: boolean;
  bot?: { username?: string; name?: string };
}

interface ChannelInfo {
  configured: boolean;
  running: boolean;
  probe?: ChannelProbe;
  dmPolicy?: string;
  groups?: Record<string, { requireMention?: boolean }>;
}

type ChannelsMap = Record<string, ChannelInfo>;

// Editable channel config shapes
interface FeishuFormData {
  enabled: boolean;
  appId: string;
  appSecret: string;
  connectionMode: "websocket" | "webhook";
  domain: "feishu" | "lark";
}

interface TelegramFormData {
  enabled: boolean;
  botToken: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function channelIcon(type: string) {
  if (type === "feishu" || type === "lark") return Hash;
  return MessageSquare;
}

function channelLabel(type: string) {
  const map: Record<string, string> = {
    telegram: "Telegram",
    feishu: "飞书 (Feishu)",
    lark: "Lark",
    wechat: "微信",
    dingtalk: "钉钉",
    slack: "Slack",
    discord: "Discord",
  };
  return map[type] ?? type;
}


const defaultFeishu: FeishuFormData = {
  enabled: false,
  appId: "",
  appSecret: "",
  connectionMode: "websocket",
  domain: "feishu",
};

const defaultTelegram: TelegramFormData = {
  enabled: false,
  botToken: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChannelsDialog({ open, onOpenChange }: ChannelsDialogProps) {
  const [channels, setChannels] = useState<ChannelsMap>({});
  const [pairings, setPairings] = useState<PairingRequest[]>([]);
  const [pairedUsers, setPairedUsers] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [approvingCode, setApprovingCode] = useState<string | null>(null);
  const [approvedCodes, setApprovedCodes] = useState<Set<string>>(new Set());

  // Track whether we've completed the initial load
  const [hasLoaded, setHasLoaded] = useState(false);

  // ---- inline config editing ----
  const [editing, setEditing] = useState<"feishu" | "telegram" | null>(null);
  const [feishuForm, setFeishuForm] = useState<FeishuFormData>(defaultFeishu);
  const [telegramForm, setTelegramForm] = useState<TelegramFormData>(defaultTelegram);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ---- data fetching ----
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [chRes, prRes] = await Promise.all([
        fetchChannelsStatus(),
        fetchPairingList(),
      ]);
      const raw = chRes as Record<string, unknown> | undefined;
      const nested = raw?.channels as ChannelsMap | undefined;

      const normalise = (obj: Record<string, unknown>): ChannelsMap => {
        const map: ChannelsMap = {};
        const skip = new Set(["ok", "count", "error", "summary"]);
        for (const [k, v] of Object.entries(obj)) {
          if (skip.has(k) || !v || typeof v !== "object") continue;
          const entry = v as Record<string, unknown>;
          if (
            "configured" in entry ||
            "running" in entry ||
            "probe" in entry ||
            "bot" in entry ||
            "ok" in entry
          ) {
            map[k] = {
              configured: (entry.configured as boolean) ?? true,
              running: (entry.running as boolean) ?? (entry.ok as boolean) ?? false,
              probe: (entry.probe as ChannelProbe) ?? (entry.ok != null ? { ok: !!entry.ok, bot: entry.bot as ChannelProbe["bot"] } : undefined),
              dmPolicy: entry.dmPolicy as string | undefined,
              groups: entry.groups as Record<string, { requireMention?: boolean }> | undefined,
            };
          }
        }
        return map;
      };

      if (nested && typeof nested === "object") {
        setChannels(normalise(nested as unknown as Record<string, unknown>));
      } else if (raw && typeof raw === "object") {
        setChannels(normalise(raw));
      } else {
        setChannels({});
      }
      setPairings(prRes?.requests ?? []);
      // Extract paired user lists from enriched response
      const pu = raw?.pairedUsers as Record<string, string[]> | undefined;
      if (pu) setPairedUsers(pu);
    } catch (err) {
      console.error("[ChannelsDialog] fetch error:", err);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, []);

  // Load existing config into forms when opening
  const loadConfigForms = useCallback(async () => {
    try {
      const config = (await fetchConfig()) as Record<string, unknown> | null;
      if (!config) return;
      const channelsObj = (config.channels as Record<string, unknown>) ?? {};

      const fs = channelsObj.feishu as Record<string, unknown> | undefined;
      if (fs) {
        setFeishuForm({
          enabled: (fs.enabled as boolean) ?? false,
          appId: (fs.appId as string) ?? "",
          appSecret: (fs.appSecret as string) ?? "",
          connectionMode: (fs.connectionMode as "websocket" | "webhook") ?? "websocket",
          domain: (fs.domain as "feishu" | "lark") ?? "feishu",
        });
      }

      const tg = channelsObj.telegram as Record<string, unknown> | undefined;
      if (tg) {
        setTelegramForm({
          enabled: (tg.enabled as boolean) ?? false,
          botToken: (tg.botToken as string) ?? "",
        });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setEditing(null);
      setSaveError(null);
      setSaveSuccess(false);
      setHasLoaded(false);
      return;
    }
    refresh();
    loadConfigForms();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [open, refresh, loadConfigForms]);

  // ---- save channel config ----
  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const config = ((await fetchConfig()) as Record<string, unknown>) ?? {};
      const channelsObj: Record<string, unknown> =
        (config.channels as Record<string, unknown>) ?? {};

      if (editing === "feishu") {
        if (feishuForm.enabled && feishuForm.appId && feishuForm.appSecret) {
          channelsObj.feishu = {
            enabled: true,
            appId: feishuForm.appId,
            appSecret: feishuForm.appSecret,
            connectionMode: feishuForm.connectionMode,
            domain: feishuForm.domain,
            dmPolicy: "pairing",
            groups: { "*": { requireMention: true } },
          };
        } else if (!feishuForm.enabled) {
          channelsObj.feishu = { enabled: false };
        }
      }

      if (editing === "telegram") {
        if (telegramForm.enabled && telegramForm.botToken) {
          channelsObj.telegram = {
            enabled: true,
            botToken: telegramForm.botToken,
            dmPolicy: "pairing",
            groups: { "*": { requireMention: true } },
          };
        } else if (!telegramForm.enabled) {
          channelsObj.telegram = { enabled: false };
        }
      }

      config.channels = channelsObj;
      await saveConfig(config);
      await gatewayRestart();

      setSaveSuccess(true);
      setEditing(null);
      setTimeout(() => setSaveSuccess(false), 3000);
      // Refresh status after restart
      setTimeout(refresh, 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // ---- approve pairing ----
  const handleApprove = async (code: string, channel?: string) => {
    setApprovingCode(code);
    try {
      await approvePairing(code, channel);
      setApprovedCodes((prev) => new Set(prev).add(code));
      setTimeout(() => {
        setPairings((prev) => prev.filter((p) => p.code !== code));
      }, 1500);
    } catch {
      // ignore
    } finally {
      setApprovingCode(null);
    }
  };

  const channelEntries = Object.entries(channels);
  const pending = pairings.filter((r) => !approvedCodes.has(r.code));
  const hasFeishu = channelEntries.some(([k]) => k === "feishu" || k === "lark");
  const hasTelegram = channelEntries.some(([k]) => k === "telegram");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-2xl max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="w-4 h-4" />
            通讯工具管理
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground ml-1"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            </Button>
          </DialogTitle>
          <DialogDescription>添加、配置和管理 AI 助手连接的聊天通道</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4">
          {/* Save success banner */}
          {saveSuccess && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              配置已保存，网关正在重启…
            </div>
          )}

          {/* Save error banner */}
          {saveError && (
            <div className="px-3 py-2 rounded-md bg-destructive/10 text-destructive text-sm">
              {saveError}
            </div>
          )}

          {/* Loading state */}
          {loading && channelEntries.length === 0 && !editing && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              加载中…
            </div>
          )}

          {/* Channel cards — each includes its own pairing requests */}
          {channelEntries.map(([name, ch]: [string, ChannelInfo]) => {
            const Icon = channelIcon(name);
            const online = ch.running === true;
            const configured = ch.configured !== false;
            const botName =
              ch.probe?.bot?.username ?? ch.probe?.bot?.name;
            const isEditing = editing === name || (editing === "feishu" && name === "lark");
            // Filter pairing requests for this channel
            // Match loosely: feishu/lark are treated as the same channel
            const feishuLike = new Set(["feishu", "lark"]);
            const channelPending = channelEntries.length === 1
              ? pending  // Only one channel — show all requests here
              : pending.filter(
                  (r) => r.channel === name || (feishuLike.has(name) && feishuLike.has(r.channel)),
                );

            if (!configured && !isEditing) {
              return (
                <Button
                  key={name}
                  variant="outline"
                  className="w-full justify-start gap-2 h-10 text-sm text-muted-foreground border-dashed"
                  onClick={() => {
                    const editKey = (name === "lark" ? "feishu" : name) as "feishu" | "telegram";
                    setEditing(editKey);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  配置 {channelLabel(name)}
                </Button>
              );
            }

            return (
              <Card
                key={name}
              >
                <div className="space-y-3 px-4 -my-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className=" text-sm">
                        {channelLabel(name)}
                      </span>
                      {botName && (
                        <span className="text-xs text-muted-foreground">
                          @{botName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!isEditing && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            const editKey = (name === "lark" ? "feishu" : name) as "feishu" | "telegram";
                            setEditing(editKey);
                          }}
                        >
                          <Pencil className="w-3 h-3" />
                          编辑
                        </Button>
                      )}
                      <Badge
                        className={cn(
                          "border-transparent text-[10px]",
                          online
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-red-500/15 text-red-500",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block w-1.5 h-1.5 rounded-full mr-1",
                            online ? "bg-emerald-500" : "bg-red-500",
                          )}
                        />
                        {online ? "在线" : "离线"}
                      </Badge>
                    </div>
                  </div>

                  {/* Inline edit form for this channel */}
                  {isEditing ? (
                    name === "telegram" || (editing === "telegram") ? (
                      <TelegramEditForm
                        form={telegramForm}
                        onChange={setTelegramForm}
                        onSave={handleSave}
                        onCancel={() => setEditing(null)}
                        saving={saving}
                      />
                    ) : (
                      <FeishuEditForm
                        form={feishuForm}
                        onChange={setFeishuForm}
                        onSave={handleSave}
                        onCancel={() => setEditing(null)}
                        saving={saving}
                      />
                    )
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      已启用配对模式 — 新用户需发送{" "}
                      <code className="bg-muted px-1 rounded text-[10px]">/pair</code>{" "}
                      获取配对码
                    </p>
                  )}
                </div>

                {/* Paired + pending users in one block */}
                {!isEditing && (
                  <div className="border-t border-foreground/5 mx-4 pt-3 -mt-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-muted-foreground">配对用户</span>
                      {(() => {
                        const feishuLike = new Set(["feishu", "lark"]);
                        const ids = feishuLike.has(name)
                          ? [...(pairedUsers["feishu"] ?? []), ...(pairedUsers["lark"] ?? [])]
                          : (pairedUsers[name] ?? []);
                        const total = ids.length + channelPending.length;
                        return total > 0 ? (
                          <Badge className="bg-muted text-muted-foreground border-transparent text-[10px]">
                            {ids.length} 已配对{channelPending.length > 0 ? ` · ${channelPending.length} 待批准` : ""}
                          </Badge>
                        ) : null;
                      })()}
                    </div>
                    {(() => {
                      const feishuLike = new Set(["feishu", "lark"]);
                      const ids = feishuLike.has(name)
                        ? [...(pairedUsers["feishu"] ?? []), ...(pairedUsers["lark"] ?? [])]
                        : (pairedUsers[name] ?? []);
                      const hasAny = ids.length > 0 || channelPending.length > 0;
                      return !hasAny ? (
                        <p className="text-[11px] text-muted-foreground/50 pb-1">
                          暂无 — 用户发送 <code className="bg-muted px-1 rounded text-[10px]">/pair</code> 后会出现在这里
                        </p>
                      ) : (
                        <>
                          {ids.map((id) => (
                            <div
                              key={id}
                              className="flex items-center gap-2 rounded-md bg-emerald-500/5 px-3 py-1.5"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <span className="text-xs font-mono text-muted-foreground truncate">{id}</span>
                              <span className="text-[10px] text-emerald-500 ml-auto shrink-0">已配对</span>
                            </div>
                          ))}
                          {channelPending.map((req) => {
                            const approved = approvedCodes.has(req.code);
                            const approving = approvingCode === req.code;
                            return (
                              <div
                                key={req.code}
                                className="flex items-center justify-between gap-3 rounded-md bg-amber-500/5 px-3 py-1.5"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Loader2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                    <span className="text-xs font-mono text-muted-foreground">
                                      {req.senderName ?? req.senderId ?? req.code}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground/60 ml-6 block">
                                    配对码: {req.code}
                                  </span>
                                </div>
                                {approved ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                ) : (
                                  <Button
                                    size="sm"
                                    className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs shrink-0 gap-1"
                                    disabled={approving}
                                    onClick={() => handleApprove(req.code, req.channel)}
                                  >
                                    {approving ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <UserCheck className="w-3.5 h-3.5" />
                                    )}
                                    批准
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>
                )}
              </Card>
            );
          })}

          {/* Add new channel buttons */}
          {!editing && hasLoaded && (
            <div className="flex flex-wrap gap-2">
              {!hasFeishu && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    setFeishuForm({ ...defaultFeishu, enabled: true });
                    setEditing("feishu");
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加飞书 / Lark
                </Button>
              )}
              {!hasTelegram && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    setTelegramForm({ ...defaultTelegram, enabled: true });
                    setEditing("telegram");
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加 Telegram
                </Button>
              )}
            </div>
          )}

          {/* New channel form (when adding, not editing existing) */}
          {editing && !channelEntries.some(([k]) =>
            editing === "feishu" ? (k === "feishu" || k === "lark") : k === editing
          ) && (
            <Card>
              <div className="space-y-3 px-4 -my-1">
                <div className="flex items-center gap-2">
                  {editing === "feishu" ? (
                    <Hash className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className=" text-sm">
                    {editing === "feishu" ? "飞书 (Feishu / Lark)" : "Telegram"}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">新增</Badge>
                </div>
                {editing === "feishu" ? (
                  <FeishuEditForm
                    form={feishuForm}
                    onChange={setFeishuForm}
                    onSave={handleSave}
                    onCancel={() => setEditing(null)}
                    saving={saving}
                  />
                ) : (
                  <TelegramEditForm
                    form={telegramForm}
                    onChange={setTelegramForm}
                    onSave={handleSave}
                    onCancel={() => setEditing(null)}
                    saving={saving}
                  />
                )}
              </div>
            </Card>
          )}

          {/* Empty state — no channels and not editing */}
          {hasLoaded && channelEntries.length === 0 && !editing && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Radio className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                暂无已配置的通道，点击上方按钮添加
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Feishu Edit Form
// ---------------------------------------------------------------------------

function FeishuEditForm({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  form: FeishuFormData;
  onChange: (f: FeishuFormData) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const update = (patch: Partial<FeishuFormData>) =>
    onChange({ ...form, ...patch });

  const canSave = form.enabled && form.appId.trim() && form.appSecret.trim();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Switch
          checked={form.enabled}
          onCheckedChange={(v) => update({ enabled: v })}
        />
        <span className="text-xs text-muted-foreground">
          {form.enabled ? "已启用" : "已禁用"}
        </span>
      </div>

      {form.enabled && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">App ID（应用 ID）</Label>
              <Input
                placeholder="cli_xxxxxxxx"
                value={form.appId}
                onChange={(e) => update({ appId: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">App Secret（应用密钥）</Label>
              <Input
                type="password"
                placeholder="xxxxxxxxxxxxxxxx"
                value={form.appSecret}
                onChange={(e) => update({ appSecret: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">域名</Label>
              <Select
                value={form.domain}
                onValueChange={(v) => update({ domain: v as "feishu" | "lark" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="feishu">feishu.cn (国内)</SelectItem>
                  <SelectItem value="lark">lark.com (海外)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">连接方式</Label>
              <Select
                value={form.connectionMode}
                onValueChange={(v) =>
                  update({ connectionMode: v as "websocket" | "webhook" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="websocket">WebSocket (推荐)</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            需要在飞书开放平台创建应用并开启{" "}
            <code className="bg-muted px-1 rounded text-[10px]">contact:contact.base:readonly</code>{" "}
            权限。保存后将自动启用配对模式。
          </p>
        </>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={saving || (form.enabled && !canSave)}
          onClick={onSave}
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saving ? "保存中…" : "保存并重启网关"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={saving}
          onClick={onCancel}
        >
          <X className="w-3.5 h-3.5" />
          取消
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Telegram Edit Form
// ---------------------------------------------------------------------------

function TelegramEditForm({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  form: TelegramFormData;
  onChange: (f: TelegramFormData) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const update = (patch: Partial<TelegramFormData>) =>
    onChange({ ...form, ...patch });

  const canSave = form.enabled && form.botToken.trim();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Switch
          checked={form.enabled}
          onCheckedChange={(v) => update({ enabled: v })}
        />
        <span className="text-xs text-muted-foreground">
          {form.enabled ? "已启用" : "已禁用"}
        </span>
      </div>

      {form.enabled && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Bot Token（机器人令牌）</Label>
            <Input
              type="password"
              placeholder="123456:ABC-DEF..."
              value={form.botToken}
              onChange={(e) => update({ botToken: e.target.value })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            通过 @BotFather 创建 Bot 并获取 Token。保存后将自动启用配对模式。
          </p>
        </>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={saving || (form.enabled && !canSave)}
          onClick={onSave}
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saving ? "保存中…" : "保存并重启网关"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={saving}
          onClick={onCancel}
        >
          <X className="w-3.5 h-3.5" />
          取消
        </Button>
      </div>
    </div>
  );
}
