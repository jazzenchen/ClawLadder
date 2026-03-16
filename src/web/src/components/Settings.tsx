import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchConfig, saveConfig } from "@/lib/api";

interface SettingsProps {
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Types matching the Rust config structs
// ---------------------------------------------------------------------------

interface ProviderConfig {
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  default?: boolean;
  [key: string]: unknown;
}

interface ChannelConfig {
  type: string;
  [key: string]: unknown;
}

interface OpenClawConfig {
  providers?: ProviderConfig[];
  channels?: ChannelConfig[];
  skills?: string[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Known providers
// ---------------------------------------------------------------------------

const KNOWN_PROVIDERS = [
  { id: "openai", label: "OpenAI", defaultBase: "https://api.openai.com/v1" },
  { id: "anthropic", label: "Anthropic", defaultBase: "https://api.anthropic.com" },
  { id: "ollama", label: "Ollama (本地)", defaultBase: "http://localhost:11434" },
  { id: "openrouter", label: "OpenRouter", defaultBase: "https://openrouter.ai/api/v1" },
  { id: "custom", label: "自定义", defaultBase: "" },
];

const KNOWN_CHANNELS = [
  { id: "lark", label: "飞书 (Lark)" },
  { id: "telegram", label: "Telegram" },
  { id: "slack", label: "Slack" },
  { id: "discord", label: "Discord" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Settings({ onBack }: SettingsProps) {
  const [config, setConfig] = useState<OpenClawConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [error, setError] = useState<string | null>(null);

  // Load config on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchConfig();
        if (data && typeof data === "object") {
          setConfig(data as OpenClawConfig);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
    return () => clearTimeout(savedTimerRef.current);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await saveConfig(config);
      setSaved(true);
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [config]);

  // --- Provider helpers ---
  const providers = config.providers || [];

  const updateProvider = (index: number, patch: Partial<ProviderConfig>) => {
    const updated = [...providers];
    updated[index] = { ...updated[index], ...patch };
    setConfig({ ...config, providers: updated });
  };

  const addProvider = () => {
    setConfig({
      ...config,
      providers: [
        ...providers,
        { provider: "openai", apiKey: "", model: "", default: providers.length === 0 },
      ],
    });
  };

  const removeProvider = (index: number) => {
    const updated = providers.filter((_, i) => i !== index);
    setConfig({ ...config, providers: updated });
  };

  const setDefaultProvider = (index: number) => {
    const updated = providers.map((p, i) => ({ ...p, default: i === index }));
    setConfig({ ...config, providers: updated });
  };

  // --- Channel helpers ---
  const channels = config.channels || [];

  const updateChannel = (index: number, patch: Partial<ChannelConfig>) => {
    const updated = [...channels];
    updated[index] = { ...updated[index], ...patch };
    setConfig({ ...config, channels: updated });
  };

  const addChannel = () => {
    setConfig({
      ...config,
      channels: [...channels, { type: "slack" }],
    });
  };

  const removeChannel = (index: number) => {
    const updated = channels.filter((_, i) => i !== index);
    setConfig({ ...config, channels: updated });
  };

  // --- Skills helpers ---
  const skills = config.skills || [];
  const [skillInput, setSkillInput] = useState("");

  const addSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setConfig({ ...config, skills: [...skills, trimmed] });
      setSkillInput("");
    }
  };

  const removeSkill = (name: string) => {
    const updated = skills.filter((s) => s !== name);
    setConfig({ ...config, skills: updated });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">加载配置中…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← 返回
          </Button>
          <h1 className="text-lg ">设置</h1>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm text-green-500">已保存 ✓</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "保存中…" : "保存配置"}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <Tabs defaultValue="providers" className="max-w-2xl mx-auto">
          <TabsList className="mb-4">
            <TabsTrigger value="providers">模型 API</TabsTrigger>
            <TabsTrigger value="channels">IM 频道</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="raw">原始 JSON</TabsTrigger>
          </TabsList>

          {/* ============ Providers Tab ============ */}
          <TabsContent value="providers" className="flex flex-col gap-4">
            {providers.map((p, i) => (
              <Card key={p.provider || i}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Provider #{i + 1}</span>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`default-${i}`} className="text-xs text-muted-foreground">
                        默认
                      </Label>
                      <Switch
                        id={`default-${i}`}
                        checked={!!p.default}
                        onCheckedChange={() => setDefaultProvider(i)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive h-6 px-2"
                        onClick={() => removeProvider(i)}
                      >
                        删除
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Provider</Label>
                      <Select
                        value={p.provider}
                        onValueChange={(v: string | null) => {
                          if (!v) return;
                          const known = KNOWN_PROVIDERS.find((k) => k.id === v);
                          updateProvider(i, {
                            provider: v,
                            baseUrl: known?.defaultBase || p.baseUrl,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {KNOWN_PROVIDERS.map((k) => (
                            <SelectItem key={k.id} value={k.id}>
                              {k.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Model</Label>
                      <Input
                        placeholder="e.g. gpt-4o"
                        value={p.model || ""}
                        onChange={(e) => updateProvider(i, { model: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">API Base URL</Label>
                    <Input
                      placeholder="https://api.openai.com/v1"
                      value={p.baseUrl || ""}
                      onChange={(e) => updateProvider(i, { baseUrl: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">API Key</Label>
                    <Input
                      type="password"
                      placeholder="sk-..."
                      value={p.apiKey || ""}
                      onChange={(e) => updateProvider(i, { apiKey: e.target.value })}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
            <Button variant="outline" onClick={addProvider}>
              + 添加 Provider
            </Button>
          </TabsContent>

          {/* ============ Channels Tab ============ */}
          <TabsContent value="channels" className="flex flex-col gap-4">
            {channels.map((ch, i) => (
              <Card key={`${ch.type}-${i}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Channel #{i + 1}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-6 px-2"
                      onClick={() => removeChannel(i)}
                    >
                      删除
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">类型</Label>
                    <Select
                      value={ch.type}
                      onValueChange={(v: string | null) => {
                        if (!v) return;
                        updateChannel(i, { type: v });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KNOWN_CHANNELS.map((k) => (
                          <SelectItem key={k.id} value={k.id}>
                            {k.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Dynamic fields based on channel type */}
                  {ch.type === "slack" && (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Bot Token</Label>
                        <Input
                          type="password"
                          placeholder="xoxb-..."
                          value={(ch.botToken as string) || ""}
                          onChange={(e) => updateChannel(i, { botToken: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">App Token</Label>
                        <Input
                          type="password"
                          placeholder="xapp-..."
                          value={(ch.appToken as string) || ""}
                          onChange={(e) => updateChannel(i, { appToken: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  {ch.type === "lark" && (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">App ID</Label>
                        <Input
                          placeholder="cli_xxxxxxxx"
                          value={(ch.appId as string) || ""}
                          onChange={(e) => updateChannel(i, { appId: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">App Secret</Label>
                        <Input
                          type="password"
                          placeholder="xxxxxxxxxxxxxxxx"
                          value={(ch.appSecret as string) || ""}
                          onChange={(e) => updateChannel(i, { appSecret: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Verification Token (可选)</Label>
                        <Input
                          placeholder="xxxxxxxxxxxxxxxx"
                          value={(ch.verificationToken as string) || ""}
                          onChange={(e) => updateChannel(i, { verificationToken: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  {ch.type === "discord" && (
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Bot Token</Label>
                      <Input
                        type="password"
                        placeholder="Discord bot token"
                        value={(ch.token as string) || ""}
                        onChange={(e) => updateChannel(i, { token: e.target.value })}
                      />
                    </div>
                  )}
                  {ch.type === "telegram" && (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Bot Token</Label>
                        <Input
                          type="password"
                          placeholder="123456:ABC-DEF..."
                          value={(ch.token as string) || ""}
                          onChange={(e) => updateChannel(i, { token: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Chat ID (可选)</Label>
                        <Input
                          placeholder="e.g. -1001234567890"
                          value={(ch.chatId as string) || ""}
                          onChange={(e) => updateChannel(i, { chatId: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
            <Button variant="outline" onClick={addChannel}>
              + 添加频道
            </Button>
          </TabsContent>

          {/* ============ Skills Tab ============ */}
          <TabsContent value="skills" className="flex flex-col gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">已启用的 Skills</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {skills.length === 0 && (
                  <p className="text-sm text-muted-foreground">暂无已启用的 skill</p>
                )}
                {skills.map((skill) => (
                  <div key={skill} className="flex items-center justify-between bg-muted rounded-md px-3 py-2">
                    <span className="text-sm font-mono">{skill}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-6 px-2"
                      onClick={() => removeSkill(skill)}
                    >
                      移除
                    </Button>
                  </div>
                ))}
                <Separator />
                <div className="flex gap-2">
                  <Input
                    placeholder="skill 名称或路径"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addSkill();
                    }}
                  />
                  <Button variant="outline" onClick={addSkill}>
                    添加
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ Raw JSON Tab ============ */}
          <TabsContent value="raw" className="flex flex-col gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">openclaw.json 原始内容</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  className="font-mono text-xs min-h-[300px]"
                  value={JSON.stringify(config, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      setConfig(parsed);
                      setError(null);
                    } catch {
                      // Let user keep typing — don't update config until valid
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  直接编辑 JSON 配置。保存后将写入 ~/.openclaw/openclaw.json
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
