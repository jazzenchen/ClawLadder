// Step: IM Pairing — per-channel cards with paired users + pending requests
import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  CheckCircle2,
  MessageCircle,
  RefreshCw,
  UserCheck,
  AlertTriangle,
  Hash,
  MessageSquare,
} from "lucide-react";

import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";

import {
  fetchPairingList,
  fetchChannelsStatus,
  approvePairing,
  type PairingRequest,
} from "../../lib/api";
import { useOnboardingStore } from "../../stores/onboarding";

// ── Types ───────────────────────────────────────────────────────────────────

interface ChannelStatus {
  configured: boolean;
  running: boolean;
}

// ── Props ───────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  onComplete: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function channelLabel(type: string) {
  const map: Record<string, string> = {
    telegram: "Telegram",
    feishu: "飞书 (Feishu)",
    lark: "Lark",
  };
  return map[type] ?? type;
}

function channelIcon(type: string) {
  if (type === "feishu" || type === "lark") return Hash;
  return MessageSquare;
}

// ── Component ───────────────────────────────────────────────────────────────

export function StepPairing({ onBack, onComplete }: Props) {
  const channels = useOnboardingStore((s) => s.channelsConfig);
  const goToStep = useOnboardingStore((s) => s.goToStep);
  const { feishu, telegram } = channels;
  const hasChannels = feishu.enabled || telegram.enabled;

  // Detect incomplete config
  const feishuIncomplete = feishu.enabled && (!feishu.appId || !feishu.appSecret);
  const telegramIncomplete = telegram.enabled && !telegram.botToken;
  const hasIncomplete = feishuIncomplete || telegramIncomplete;

  const [channelStatuses, setChannelStatuses] = useState<Record<string, ChannelStatus>>({});
  const [pairedUsers, setPairedUsers] = useState<Record<string, string[]>>({});
  const [requests, setRequests] = useState<PairingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [approvingCode, setApprovingCode] = useState<string | null>(null);
  const [approvedCodes, setApprovedCodes] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [chRes, prRes] = await Promise.all([
        fetchChannelsStatus(),
        fetchPairingList(),
      ]);
      const raw = chRes as Record<string, unknown> | undefined;
      const nested = raw?.channels as Record<string, ChannelStatus> | undefined;
      if (nested) {
        setChannelStatuses(nested);
      }
      const pu = raw?.pairedUsers as Record<string, string[]> | undefined;
      if (pu) setPairedUsers(pu);
      setRequests(prRes?.requests ?? []);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 5s while on this step
  useEffect(() => {
    if (!hasChannels) return;
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [hasChannels, refresh]);

  const handleApprove = async (code: string, channel?: string) => {
    setApprovingCode(code);
    try {
      await approvePairing(code, channel);
      setApprovedCodes((prev) => new Set(prev).add(code));
      setTimeout(() => {
        setRequests((prev) => prev.filter((r) => r.code !== code));
      }, 1500);
      // Refresh to get updated paired users
      setTimeout(refresh, 2000);
    } catch {
      // ignore
    } finally {
      setApprovingCode(null);
    }
  };

  const pending = requests.filter((r) => !approvedCodes.has(r.code));

  // Build the list of channel keys to render cards for
  const enabledChannels: string[] = [];
  if (feishu.enabled) enabledChannels.push("feishu");
  if (telegram.enabled) enabledChannels.push("telegram");

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 pb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">IM 配对</h2>
          {hasChannels && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          将通讯工具与 OpenClaw 配对，让 Bot 识别你的身份。
          {!hasChannels && " 你尚未配置任何通讯工具，可以跳过此步骤。"}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-4 pb-4 space-y-3">
        {!hasChannels ? (
          <Card>
            <div className="py-8 flex flex-col items-center gap-3 text-center px-4">
              <MessageCircle className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                未配置通讯工具，跳过配对即可。
                <br />
                你可以稍后在设置中添加飞书或 Telegram，再进行配对。
              </p>
            </div>
          </Card>
        ) : (
          <>
            {/* Incomplete config warning */}
            {hasIncomplete && (
              <Card className="border-amber-500/50 bg-amber-500/5">
                <div className="py-3 px-4 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-amber-200 mb-1">
                      以下通讯工具已启用但配置不完整，无法进行配对：
                    </p>
                    <ul className="text-[11px] text-amber-200/80 list-disc list-inside space-y-0.5">
                      {feishuIncomplete && <li>飞书 — 缺少 App ID 或 App Secret</li>}
                      {telegramIncomplete && <li>Telegram — 缺少 Bot Token</li>}
                    </ul>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 h-7 text-xs border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
                      onClick={() => goToStep("channels")}
                    >
                      ← 返回通讯软件配置
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Per-channel cards */}
            {enabledChannels.map((chName) => {
              const Icon = channelIcon(chName);
              const status = channelStatuses[chName];
              const online = status?.running === true;

              // Paired users for this channel
              const feishuLike = new Set(["feishu", "lark"]);
              const paired = feishuLike.has(chName)
                ? [...(pairedUsers["feishu"] ?? []), ...(pairedUsers["lark"] ?? [])]
                : (pairedUsers[chName] ?? []);

              // Pending requests for this channel
              const channelPending = enabledChannels.length === 1
                ? pending
                : pending.filter(
                    (r) => r.channel === chName || (feishuLike.has(chName) && feishuLike.has(r.channel)),
                  );

              const isIncomplete = chName === "feishu" ? feishuIncomplete : telegramIncomplete;

              return (
                <Card key={chName}>
                  <div className="space-y-3 px-4 -my-1">
                    {/* Channel header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{channelLabel(chName)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isIncomplete ? (
                          <Badge className="border-transparent text-[10px] bg-amber-500/15 text-amber-500">
                            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 bg-amber-500" />
                            配置不完整
                          </Badge>
                        ) : (
                          <Badge
                            className={`border-transparent text-[10px] ${
                              online
                                ? "bg-emerald-500/15 text-emerald-500"
                                : "bg-red-500/15 text-red-500"
                            }`}
                          >
                            <span
                              className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                                online ? "bg-emerald-500" : "bg-red-500"
                              }`}
                            />
                            {online ? "在线" : "离线"}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Instructions */}
                    <p className="text-[11px] text-muted-foreground">
                      {isIncomplete
                        ? "请先完成配置后再进行配对"
                        : <>已启用配对模式 — 在{channelLabel(chName)}中向 Bot 发送 <code className="bg-muted px-1 rounded text-[10px]">/pair</code> 获取配对码</>
                      }
                    </p>
                  </div>

                  {!isIncomplete && (
                    <div className="border-t border-foreground/5 mx-4 pt-3 -mt-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground">配对用户</span>
                        {(paired.length > 0 || channelPending.length > 0) && (
                          <Badge className="bg-muted text-muted-foreground border-transparent text-[10px]">
                            {paired.length} 已配对{channelPending.length > 0 ? ` · ${channelPending.length} 待批准` : ""}
                          </Badge>
                        )}
                      </div>
                      {paired.length === 0 && channelPending.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground/50 pb-1">
                          暂无 — 用户发送 <code className="bg-muted px-1 rounded text-[10px]">/pair</code> 后会出现在这里
                        </p>
                      ) : (
                        <>
                          {paired.map((id) => (
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
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </>
        )}
      </div>

      <div className="shrink-0 flex justify-between pt-4 px-4 border-t border-border">
        <Button variant="outline" onClick={onBack}>
          ← 上一步
        </Button>
        <Button onClick={onComplete}>完成配置 →</Button>
      </div>
    </div>
  );
}
