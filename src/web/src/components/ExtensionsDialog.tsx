import React, { useState, useEffect, useCallback } from "react";
import { Puzzle, Loader2, Zap, Anchor, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  fetchSkills,
  fetchHooks,
  fetchPluginsList,
  enableHook,
  disableHook,
  pluginsEnable,
  pluginsDisable,
  type SkillInfo,
  type HookInfo,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Chinese description maps — match by name, fallback to system description
// ---------------------------------------------------------------------------

const SKILL_DETAILS: Record<string, string> = {
  "1password": "使用 1Password 安全地获取密钥和凭证，无需明文存储",
  "brave-search": "通过 Brave Search API 搜索网页，获取实时信息",
  "desktop-notifications": "在桌面发送系统通知，提醒重要事件或任务完成",
  "google-search": "通过 Google Custom Search API 搜索网页内容",
  "memory-search": "在记忆索引中搜索历史对话和文档片段",
  "playwright": "使用 Playwright 自动化浏览器操作，抓取网页或执行 UI 测试",
  "sequential-thinking": "分步骤推理复杂问题，逐步拆解并解决",
  "skill-vetter": "自动审查和验证 Skills 的安全性与兼容性",
  "tavily-search": "通过 Tavily API 进行 AI 优化的网页搜索",
  "web-search": "搜索网页获取实时信息和最新内容",
};

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

const PLUGIN_DETAILS: Record<string, string> = {
  telegram: "连接 Telegram Bot，通过 Telegram 与 AI 助手对话",
  feishu: "连接飞书机器人，在飞书中使用 AI 助手",
  lark: "连接 Lark 机器人，在 Lark 中使用 AI 助手",
  wechat: "连接微信，通过微信与 AI 助手对话",
  dingtalk: "连接钉钉机器人，在钉钉中使用 AI 助手",
  slack: "连接 Slack Bot，在 Slack 中使用 AI 助手",
  discord: "连接 Discord Bot，在 Discord 中使用 AI 助手",
  "anthropic-oauth": "通过 Anthropic OAuth 认证，使用 Claude Coding Plan",
};

// ---------------------------------------------------------------------------
// Plugin type (best-effort parse from unknown JSON)
// ---------------------------------------------------------------------------

interface PluginItem {
  name: string;
  enabled: boolean;
}

function parsePlugins(raw: unknown): PluginItem[] {
  if (Array.isArray(raw)) {
    return raw.map((p: Record<string, unknown>) => ({
      name: String(p.name ?? p.id ?? "unknown"),
      enabled: p.enabled !== false && p.disabled !== true,
    }));
  }
  if (raw && typeof raw === "object" && "plugins" in raw) {
    return parsePlugins((raw as Record<string, unknown>).plugins);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExtensionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Skills Tab
// ---------------------------------------------------------------------------

function SkillsTab({ skills, loading }: { skills: SkillInfo[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        技能是 AI 助手的能力扩展，启用后 AI 可以使用对应功能（如搜索网页、操作文档等）
      </p>

      {skills.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">暂无技能</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {skills.map((s) => (
            <Card key={s.name} className="p-3 flex flex-col items-center text-center gap-1.5">
              <span className="text-xl">{s.emoji || "🧩"}</span>
              <div className="min-w-0 w-full">
                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                  <span className="font-medium text-sm truncate">{s.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                    {s.bundled ? "内置" : "社区"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {SKILL_DETAILS[s.name] || s.description || "—"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {s.eligible ? (
                  <Badge className="text-[10px] px-1.5 py-0 bg-green-500/15 text-green-400 border-green-500/30">
                    可用
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    不可用
                  </Badge>
                )}
                {s.disabled && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    已禁用
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hooks Tab
// ---------------------------------------------------------------------------

function HooksTab({
  hooks,
  loading,
  onToggle,
}: {
  hooks: HookInfo[];
  loading: boolean;
  onToggle: (name: string, enable: boolean) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        钩子是自动触发的后台任务，在特定事件（如收到消息、定时任务）发生时自动执行
      </p>

      {hooks.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">暂无钩子</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {hooks.map((h) => (
            <Card
              key={h.name}
              className={cn("p-3 flex flex-col items-center text-center gap-1.5", h.disabled && "opacity-60")}
            >
              <span className="text-xl">{h.emoji || "🪝"}</span>
              <div className="min-w-0 w-full">
                <span className="font-medium text-sm">{h.name}</span>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {HOOK_DETAILS[h.name] || h.description || "—"}
                </p>
                {h.events.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                    {h.events.map((ev) => (
                      <Badge key={ev} variant="outline" className="text-[10px] px-1 py-0 font-mono">
                        {ev}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <Switch
                checked={!h.disabled}
                onCheckedChange={(checked) => onToggle(h.name, checked)}
                className="mt-1"
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plugins Tab
// ---------------------------------------------------------------------------

function PluginsTab({
  plugins,
  loading,
  onToggle,
}: {
  plugins: PluginItem[];
  loading: boolean;
  onToggle: (name: string, enable: boolean) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        插件是底层扩展模块，提供通道连接、工具集成等基础能力。一般不需要手动管理。
      </p>

      {plugins.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">暂无插件</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {plugins.map((p) => (
            <Card key={p.name} className={cn("p-3 flex flex-col items-center text-center gap-1.5", !p.enabled && "opacity-60")}>
              <Package className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0 w-full">
                <span className="font-medium text-sm">{p.name}</span>
                {PLUGIN_DETAILS[p.name] && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {PLUGIN_DETAILS[p.name]}
                  </p>
                )}
              </div>
              <Switch
                checked={p.enabled}
                onCheckedChange={(checked) => onToggle(p.name, checked)}
                className="mt-1"
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dialog
// ---------------------------------------------------------------------------

export function ExtensionsDialog({ open, onOpenChange }: ExtensionsDialogProps) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [hooks, setHooks] = useState<HookInfo[]>([]);
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [skillsRes, hooksRes, pluginsRaw] = await Promise.all([
        fetchSkills(),
        fetchHooks(),
        fetchPluginsList(),
      ]);
      setSkills(skillsRes.skills ?? []);
      setHooks(hooksRes.hooks ?? []);
      setPlugins(parsePlugins(pluginsRaw));
    } catch (e) {
      console.error("[ExtensionsDialog] load failed:", e);
      setError("加载扩展信息失败，请检查服务是否正常运行");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleHookToggle = useCallback(
    async (name: string, enable: boolean) => {
      try {
        if (enable) {
          await enableHook(name);
        } else {
          await disableHook(name);
        }
        const res = await fetchHooks();
        setHooks(res.hooks ?? []);
      } catch {
        // Silently fail — could add toast later
      }
    },
    [],
  );

  const handlePluginToggle = useCallback(
    async (name: string, enable: boolean) => {
      try {
        if (enable) {
          await pluginsEnable(name);
        } else {
          await pluginsDisable(name);
        }
        const raw = await fetchPluginsList();
        setPlugins(parsePlugins(raw));
      } catch {
        // Silently fail
      }
    },
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-2xl max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Puzzle className="h-4 w-4" />
            扩展管理
          </DialogTitle>
          <DialogDescription>管理 AI 助手的技能、钩子和插件</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        <Tabs defaultValue="skills" className="flex flex-col flex-1 overflow-hidden">
          <TabsList variant="line" className="w-full mb-3 shrink-0">
            <TabsTrigger value="skills" className="gap-1 text-xs">
              <Zap className="w-3 h-3" />
              技能
              {!loading && <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">{skills.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="hooks" className="gap-1 text-xs">
              <Anchor className="w-3 h-3" />
              钩子
              {!loading && <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">{hooks.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="plugins" className="gap-1 text-xs">
              <Package className="w-3 h-3" />
              插件
              {!loading && <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">{plugins.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-1 custom-scrollbar">
            <TabsContent value="skills">
              <SkillsTab skills={skills} loading={loading} />
            </TabsContent>
            <TabsContent value="hooks">
              <HooksTab hooks={hooks} loading={loading} onToggle={handleHookToggle} />
            </TabsContent>
            <TabsContent value="plugins">
              <PluginsTab plugins={plugins} loading={loading} onToggle={handlePluginToggle} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
