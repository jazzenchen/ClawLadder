// Step 1: AI Model / Provider configuration — redesigned clean UI
import { useState, useEffect, useRef, useCallback } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { ScrollArea } from "../ui/scroll-area";
import { Pencil, Trash2, Star, Key, Cpu, Plus, X } from "lucide-react";

import {
  fetchProviders,
  modelsAuthLogin,
  pluginsEnable,
  type CatalogProvider,
} from "../../lib/api";

import { useOnboardingStore } from "../../stores/onboarding";
import { useClickOutside } from "../../hooks/useClickOutside";

import {
  PROVIDER_META,
  PROVIDER_GROUPS,
  STATIC_PROVIDERS,
  API_TYPES,
  getProviderMeta,
  getProviderGroup,
  type ProviderMeta,
  type ProviderGroup,
} from "./providerMeta";

// ── Exported state shape ───────────────────────────────────────────────────

export type AuthMode =
  | "apiKey"
  | "oauth"
  | "setup-token"
  | "plugin-oauth"
  | "aws-sdk"
  | "none";

export interface ProviderEntry {
  id: string;
  label: string;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  api: string;
  selectedModel: string;
  customModelName?: string;
  customKey?: string;
  authMode: AuthMode;
  authenticated?: boolean;
}

export interface ModelsConfig {
  providers: ProviderEntry[];
  defaultProvider: string;
  defaultModel: string;
}

// ── Reusable searchable model selector ──────────────────────────────────────

interface ModelSelectorProps {
  models: { id: string; name?: string }[];
  value: string;
  placeholder: string;
  onChange: (val: string) => void;
  label?: string;
}

function ModelSelector({
  models,
  value,
  placeholder,
  onChange,
  label = "Model ID（模型 ID）",
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const closeDropdown = useCallback(() => setOpen(false), []);
  useClickOutside(ref, closeDropdown);

  // Filter suggestions based on current input value
  const filtered = models.filter(
    (m) =>
      !value ||
      (m.name || m.id).toLowerCase().includes(value.toLowerCase()) ||
      m.id.toLowerCase().includes(value.toLowerCase()),
  );

  // No catalog models → plain input, no suggestions
  if (models.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">{label}</Label>
        <div className="relative" ref={ref}>
          <div className="flex items-center border border-input rounded-lg bg-transparent dark:bg-input/30">
            <input
              ref={inputRef}
              className="flex-1 h-8 px-2.5 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        </div>
      </div>
    );
  }

  // Autocomplete input: user can type freely, suggestions appear below
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="relative" ref={ref}>
        <div className="flex items-center border border-input rounded-lg bg-transparent dark:bg-input/30">
          <input
            ref={inputRef}
            className="flex-1 h-8 px-2.5 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => {
              if (!open) setOpen(true);
            }}
          />
          {models.length > 0 && (
            <span
              className="pr-3 text-muted-foreground cursor-pointer select-none"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen((v) => !v);
                inputRef.current?.focus();
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
        </div>
        {open && filtered.length > 0 && (
          <div className="absolute z-50 mt-1 w-full max-h-96 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-md">
            {filtered.map((m) => (
              <div
                key={m.id}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground ${m.id === value ? "bg-accent/50" : ""}`}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                <span className="flex-1 truncate">{m.name || m.id}</span>
                {m.id === value && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M3 7L6 10L11 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onNext: () => void;
  onExit?: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function StepModels({ onNext, onExit }: Props) {
  const value = useOnboardingStore((s) => s.modelsConfig);
  const onChange = useOnboardingStore((s) => s.setModelsConfig);
  const [catalog, setCatalog] = useState<CatalogProvider[]>(STATIC_PROVIDERS);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState<string | null>(null);
  const [authMsg, setAuthMsg] = useState("");

  useEffect(() => {
    fetchProviders()
      .then((res) => {
        if (res.providers.length > 0) setCatalog(res.providers);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const providers = value.providers;

  const updateProvider = (idx: number, patch: Partial<ProviderEntry>) => {
    const next = [...providers];
    next[idx] = { ...next[idx], ...patch };
    onChange({ ...value, providers: next });
  };

  const catalogModelsFor = (providerId: string) => {
    return catalog.find((c) => c.id === providerId)?.models ?? [];
  };

  // Ensure a provider entry exists and is enabled; returns its index
  const ensureProvider = (id: string): number => {
    const idx = providers.findIndex((p) => p.id === id);
    if (idx >= 0) return idx;
    const meta = getProviderMeta(id);
    const cat = catalog.find((c) => c.id === id);
    const newEntry: ProviderEntry = {
      id,
      label: meta?.label ?? cat?.label ?? id,
      enabled: true,
      apiKey:
        id === "ollama" ? "ollama-local" : id === "vllm" ? "vllm-local" : "",
      baseUrl: meta?.baseUrl ?? "",
      api: meta?.api ?? "openai-completions",
      selectedModel: cat?.models[0]?.id ?? meta?.exampleModel ?? "",
      authMode: meta?.authModes[0] ?? "apiKey",
    };
    const next = [...providers, newEntry];
    onChange({ ...value, providers: next });
    return next.length - 1;
  };

  // Handle selecting a provider from the dropdown
  const handleSelectProvider = (providerId: string) => {
    const idx = ensureProvider(providerId);
    // Use the latest providers list (ensureProvider may have added a new entry)
    const currentProviders = providers.find((p) => p.id === providerId)
      ? providers
      : [
          ...providers,
          (() => {
            const meta = getProviderMeta(providerId);
            const cat = catalog.find((c) => c.id === providerId);
            return {
              id: providerId,
              label: meta?.label ?? cat?.label ?? providerId,
              enabled: true,
              apiKey:
                providerId === "ollama"
                  ? "ollama-local"
                  : providerId === "vllm"
                    ? "vllm-local"
                    : "",
              baseUrl: meta?.baseUrl ?? "",
              api: meta?.api ?? "openai-completions",
              selectedModel: cat?.models[0]?.id ?? meta?.exampleModel ?? "",
              authMode: (meta?.authModes[0] ?? "apiKey") as AuthMode,
            };
          })(),
        ];
    const entry = currentProviders[idx];
    onChange({
      ...value,
      providers: currentProviders,
      defaultProvider: providerId,
      defaultModel: entry?.selectedModel ? `${providerId}/${entry.selectedModel}` : "",
    });
  };

  // Currently selected provider
  const selectedMeta = getProviderMeta(value.defaultProvider);
  const selectedEntry = providers.find((p) => p.id === value.defaultProvider);
  const selectedIdx = providers.findIndex(
    (p) => p.id === value.defaultProvider,
  );
  const selectedCatalogModels = catalogModelsFor(value.defaultProvider);
  const selectedGroup = getProviderGroup(value.defaultProvider);

  // OAuth / plugin login
  const handleOAuthLogin = async (providerId: string) => {
    const meta = getProviderMeta(providerId);
    setAuthLoading(providerId);
    setAuthMsg("");
    try {
      // Enable plugin first if needed — but don't block login if it fails
      // (plugin may already be enabled, or the command may not exist yet)
      if (meta?.pluginName) {
        try {
          await pluginsEnable(meta.pluginName);
        } catch {
          console.warn(
            `Plugin enable for ${meta.pluginName} failed, continuing`,
          );
        }
      }
      // Pure OAuth login — don't pass auth_choice so the backend uses
      // `models auth login` (which intercepts the URL and opens a browser).
      const res = await modelsAuthLogin({
        provider: providerId,
      });
      if (res.ok) {
        const idx = providers.findIndex((p) => p.id === providerId);
        if (idx >= 0) updateProvider(idx, { authenticated: true });
        setAuthMsg("✓ 认证成功");
      } else {
        setAuthMsg(res.output || "认证失败");
      }
    } catch (e: unknown) {
      setAuthMsg(e instanceof Error ? e.message : "认证失败");
    } finally {
      setAuthLoading(null);
    }
  };

  // Setup token verification
  const handleSetupToken = async (token: string) => {
    setAuthLoading(value.defaultProvider);
    setAuthMsg("");
    try {
      const res = await modelsAuthLogin({
        provider: value.defaultProvider,
        setup_token: token,
      });
      if (res.ok) {
        if (selectedIdx >= 0)
          updateProvider(selectedIdx, { authenticated: true });
        setAuthMsg("✓ Token 验证成功");
      } else {
        setAuthMsg(res.output || "Token 验证失败");
      }
    } catch (e: unknown) {
      setAuthMsg(e instanceof Error ? e.message : "验证失败");
    } finally {
      setAuthLoading(null);
    }
  };

  // Add custom provider
  const addCustomProvider = () => {
    const entry: ProviderEntry = {
      id: `custom-${Date.now()}`,
      label: "Custom Provider",
      enabled: true,
      apiKey: "",
      baseUrl: "",
      api: "openai-completions",
      selectedModel: "",
      authMode: "apiKey",
    };
    const next = [...providers, entry];
    onChange({ ...value, providers: next, defaultProvider: entry.id });
  };

  const removeCustomProvider = (idx: number) => {
    const removed = providers[idx];
    const next = providers.filter((_, i) => i !== idx);
    onChange({
      ...value,
      providers: next,
      defaultProvider:
        value.defaultProvider === removed.id ? "" : value.defaultProvider,
      defaultModel:
        value.defaultProvider === removed.id ? "" : value.defaultModel,
    });
  };

  // Validation
  const enabledProviders = providers.filter((p) => p.enabled);
  const canProceed =
    value.defaultProvider !== "" &&
    enabledProviders.some((p) => {
      const meta = getProviderMeta(p.id);
      return (
        p.apiKey ||
        meta?.needsApiKey === false ||
        p.authenticated ||
        p.authMode === "none" ||
        p.authMode === "aws-sdk"
      );
    });

  // Group providers for the dropdown — use merged PROVIDER_GROUPS
  const CUSTOM_GROUP: ProviderGroup = {
    groupId: "__custom__",
    label: "+ 自定义 Provider",
    category: "other",
    variants: [],
  };

  const dropdownCategories = [
    {
      label: "热门",
      items: PROVIDER_GROUPS.filter((g) => g.category === "popular"),
    },
    {
      label: "云服务",
      items: PROVIDER_GROUPS.filter((g) => g.category === "cloud"),
    },
    {
      label: "本地",
      items: PROVIDER_GROUPS.filter((g) => g.category === "local"),
    },
    {
      label: "其他",
      items: [
        ...PROVIDER_GROUPS.filter((g) => g.category === "other"),
        CUSTOM_GROUP,
      ],
    },
  ];

  // Searchable dropdown state
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  const closeProviderDropdown = useCallback(() => setDropdownOpen(false), []);
  useClickOutside(dropdownRef, closeProviderDropdown);

  // Filter groups by search query (search across group label + all variant labels/ids)
  const filteredCategories = dropdownCategories
    .map((cat) => ({
      ...cat,
      items: cat.items.filter((g) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        if (g.label.toLowerCase().includes(q)) return true;
        if (g.groupId.toLowerCase().includes(q)) return true;
        return g.variants.some(
          (v) =>
            v.label.toLowerCase().includes(q) || v.id.toLowerCase().includes(q),
        );
      }),
    }))
    .filter((cat) => cat.items.length > 0);

  // Get display label for current selection — show group label if grouped
  const getDisplayLabel = () => {
    if (!value.defaultProvider) return "";
    if (value.defaultProvider.startsWith("custom-")) {
      const entry = providers.find((p) => p.id === value.defaultProvider);
      return entry?.customKey
        ? `自定义: ${entry.customKey}`
        : "自定义 Provider";
    }
    const group = getProviderGroup(value.defaultProvider);
    if (group && group.variants.length > 1) {
      const variant = group.variants.find(
        (v) => v.id === value.defaultProvider,
      );
      return `${group.label} — ${variant?.variantLabel ?? variant?.label ?? ""}`;
    }
    const meta = getProviderMeta(value.defaultProvider);
    return meta?.label ?? value.defaultProvider;
  };

  // Is current selection a custom provider?
  const isCustom = !selectedMeta;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 pb-4">
        <h2 className="text-lg font-semibold">AI 模型配置</h2>
        <p className="text-sm text-muted-foreground mt-1">
          选择 AI 服务商，填写 API Key，选择默认模型。
        </p>
      </div>

      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-col gap-5 pb-4 px-4">
          {/* ── Configured providers pill bar ──────────────────────────── */}
          {providers.filter((p) => p.enabled && (p.apiKey || p.authenticated)).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pb-4">
              {providers.map((p, idx) => {
                if (!p.enabled || (!p.apiKey && !p.authenticated)) return null;
                const meta = getProviderMeta(p.id);
                const isActive = value.defaultProvider === p.id;
                const isDefault = value.defaultModel?.startsWith(p.id + "/");
                const pillLabel = meta?.label ?? p.label ?? p.id;
                return (
                  <div
                    key={p.id}
                    className={`inline-flex items-center gap-1 h-7 pl-1 pr-1 rounded-full text-xs cursor-pointer border transition-colors ${
                      isActive
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "bg-muted/50 border-border hover:bg-muted"
                    }`}
                    onClick={() => onChange({ ...value, defaultProvider: p.id })}
                  >
                    <button
                      className={`p-0.5 rounded-full ${isDefault ? "text-primary" : "text-muted-foreground hover:text-primary hover:bg-primary/20"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange({
                          ...value,
                          defaultProvider: p.id,
                          defaultModel: p.selectedModel ? `${p.id}/${p.selectedModel}` : "",
                        });
                      }}
                      title="设为默认"
                    >
                      <Star className={`w-3 h-3 ${isDefault ? "fill-current" : ""}`} />
                    </button>
                    <span className="max-w-[100px] truncate">{pillLabel}</span>
                    <button
                      className="p-0.5 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCustomProvider(idx);
                      }}
                      title="删除"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
              <button
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs border border-dashed border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                onClick={addCustomProvider}
                title="新增"
              >
                <Plus className="w-3 h-3" />
                新增
              </button>
            </div>
          )}

          {/* ── Provider Selector (searchable dropdown) ──────────────────── */}
          <div className="flex flex-col gap-2">
            <Label>服务商 (Provider)</Label>
            <div className="relative" ref={dropdownRef}>
              <div className="flex items-center border border-input rounded-lg bg-transparent dark:bg-input/30 cursor-pointer">
                <input
                  ref={inputRef}
                  className="flex-1 h-8 px-2.5 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
                  placeholder="搜索或选择服务商…"
                  value={dropdownOpen ? searchQuery : getDisplayLabel()}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (!dropdownOpen) setDropdownOpen(true);
                  }}
                  onFocus={() => {
                    if (!dropdownOpen) {
                      setSearchQuery("");
                      setDropdownOpen(true);
                    }
                  }}
                />
                <span
                  className="pr-3 text-muted-foreground cursor-pointer select-none"
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent input blur
                    setDropdownOpen((v) => !v);
                    if (!dropdownOpen) {
                      setSearchQuery("");
                      inputRef.current?.focus();
                    }
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M3 4.5L6 7.5L9 4.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>

              {dropdownOpen && (
                <div className="absolute z-50 mt-1 w-full max-h-96 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-md">
                  {filteredCategories.length === 0 ? (
                    <div className="py-3 text-center text-xs text-muted-foreground">
                      无匹配结果
                    </div>
                  ) : (
                    filteredCategories.map((cat) => (
                      <div key={cat.label}>
                        <div className="px-3 py-1.5 text-xs text-muted-foreground sticky top-0 bg-popover">
                          {cat.label}
                        </div>
                        {cat.items.map((g) => {
                          // Check if any variant in this group is currently selected
                          const isSelected =
                            g.groupId === "__custom__"
                              ? isCustom
                              : g.variants.some(
                                  (v) => v.id === value.defaultProvider,
                                );
                          return (
                            <div
                              key={g.groupId}
                              className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground ${
                                isSelected ? "bg-accent/50" : ""
                              }`}
                              onClick={() => {
                                if (g.groupId === "__custom__") {
                                  addCustomProvider();
                                } else {
                                  // Select the first variant by default
                                  handleSelectProvider(g.variants[0].id);
                                }
                                setDropdownOpen(false);
                                setSearchQuery("");
                              }}
                            >
                              <span className="flex-1">
                                {g.label}
                                {g.variants.length > 1 && (
                                  <span className="text-xs text-muted-foreground ml-1.5">
                                    ({g.variants.length} 种接入方式)
                                  </span>
                                )}
                              </span>
                              {isSelected && (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 14 14"
                                  fill="none"
                                >
                                  <path
                                    d="M3 7L6 10L11 4"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Selected Provider Config (built-in) ────────────────────── */}
          {selectedMeta && selectedEntry && selectedIdx >= 0 && !isCustom && (
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <div className="text-sm flex items-center gap-2 ">
                {selectedGroup && selectedGroup.variants.length > 1
                  ? selectedGroup.label
                  : selectedMeta.label}
                {loading ? (
                  <Badge variant="secondary" className="text-xs">
                    加载模型中…
                  </Badge>
                ) : selectedCatalogModels.length > 0 ? (
                  <Badge variant="secondary" className="text-xs">
                    {selectedCatalogModels.length} 个模型
                  </Badge>
                ) : null}
              </div>
              {/* Variant selector — shown when group has multiple variants */}
              {selectedGroup && selectedGroup.variants.length > 1 && (
                <div className="flex flex-col gap-2">
                  <Label>接入方式</Label>
                  <div className="grid gap-2">
                    {selectedGroup.variants.map((variant) => {
                      const isActive = variant.id === value.defaultProvider;
                      return (
                        <div
                          key={variant.id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-md border cursor-pointer transition-colors ${
                            isActive
                              ? "border-primary bg-primary/5"
                              : "border-input hover:bg-accent/50"
                          }`}
                          onClick={() => handleSelectProvider(variant.id)}
                        >
                          <div
                            className={`w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              isActive
                                ? "border-primary"
                                : "border-muted-foreground/40"
                            }`}
                          >
                            {isActive && (
                              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="text-sm  truncate">
                              {variant.variantLabel ?? variant.label}
                            </div>
                            {variant.oauthNote && (
                              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {variant.oauthNote}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Auth mode selector (when multiple modes) */}
              {selectedMeta.authModes.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">认证方式</Label>
                  <Select
                    value={selectedEntry.authMode}
                    onValueChange={(v) =>
                      v &&
                      updateProvider(selectedIdx, {
                        authMode: v as AuthMode,
                        apiKey: "",
                        authenticated: false,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedMeta.authModes.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {mode === "apiKey"
                            ? "API Key"
                            : mode === "oauth"
                              ? "OAuth 登录"
                              : mode === "setup-token"
                                ? "Setup Token"
                                : mode === "plugin-oauth"
                                  ? "Coding Plan (OAuth)"
                                  : mode === "aws-sdk"
                                    ? "AWS SDK"
                                    : mode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* API Key */}
              {selectedEntry.authMode === "apiKey" && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">
                    API Key（密钥）
                    {selectedMeta.envKey && (
                      <span className="text-muted-foreground ml-1">
                        ({selectedMeta.envKey})
                      </span>
                    )}
                  </Label>
                  <Input
                    type="password"
                    placeholder={selectedMeta.placeholder || "sk-..."}
                    value={selectedEntry.apiKey}
                    onChange={(e) =>
                      updateProvider(selectedIdx, { apiKey: e.target.value })
                    }
                  />
                </div>
              )}

              {/* Setup Token */}
              {selectedEntry.authMode === "setup-token" && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Setup Token（设置令牌）</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="从 Claude Code CLI 获取 token"
                      value={selectedEntry.apiKey}
                      onChange={(e) =>
                        updateProvider(selectedIdx, { apiKey: e.target.value })
                      }
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        !selectedEntry.apiKey ||
                        authLoading === value.defaultProvider
                      }
                      onClick={() => handleSetupToken(selectedEntry.apiKey)}
                    >
                      {authLoading === value.defaultProvider
                        ? "验证中…"
                        : "验证"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    运行{" "}
                    <code className="bg-muted px-1 rounded">
                      claude setup-token
                    </code>{" "}
                    获取
                  </p>
                </div>
              )}

              {/* OAuth / Plugin OAuth */}
              {(selectedEntry.authMode === "oauth" ||
                selectedEntry.authMode === "plugin-oauth") && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={
                        selectedEntry.authenticated ? "outline" : "default"
                      }
                      disabled={authLoading === value.defaultProvider}
                      onClick={() => handleOAuthLogin(value.defaultProvider)}
                    >
                      {authLoading === value.defaultProvider
                        ? "等待浏览器登录…"
                        : selectedEntry.authenticated
                          ? "✓ 已认证 (重新登录)"
                          : "🔐 登录"}
                    </Button>
                    {selectedEntry.authenticated && (
                      <Badge variant="secondary" className="text-xs">
                        已认证
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedMeta.pluginName
                      ? `将启用 ${selectedMeta.pluginName} 插件并打开浏览器登录`
                      : "点击后将打开系统浏览器完成 OAuth 登录"}
                  </p>
                  {selectedMeta.oauthNote && (
                    <p className="text-xs text-yellow-500">
                      {selectedMeta.oauthNote}
                    </p>
                  )}
                </div>
              )}

              {/* AWS SDK / ADC */}
              {selectedEntry.authMode === "aws-sdk" && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">
                    {selectedMeta.oauthNote ||
                      "使用 AWS SDK 凭证链，无需 API Key。确保 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION 已配置。"}
                  </p>
                </div>
              )}

              {/* Base URL (for providers that need it) */}
              {selectedMeta.baseUrl &&
                !["amazon-bedrock"].includes(selectedEntry.id) && (
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Base URL（接口地址）</Label>
                    <Input
                      placeholder={selectedMeta.baseUrl}
                      value={selectedEntry.baseUrl}
                      onChange={(e) =>
                        updateProvider(selectedIdx, { baseUrl: e.target.value })
                      }
                    />
                    {selectedEntry.id === "ollama" && (
                      <p className="text-xs text-muted-foreground">
                        不要加 /v1 后缀。使用原生 Ollama API。
                      </p>
                    )}
                  </div>
                )}

              {/* Model Selector */}
              <ModelSelector
                models={selectedCatalogModels}
                value={selectedEntry.selectedModel || (value.defaultModel?.includes("/") ? value.defaultModel.split("/").slice(1).join("/") : value.defaultModel)}
                placeholder={selectedMeta.exampleModel || "model-id"}
                onChange={(val) => {
                  const next = [...providers];
                  next[selectedIdx] = {
                    ...next[selectedIdx],
                    selectedModel: val,
                  };
                  onChange({ ...value, providers: next, defaultModel: `${value.defaultProvider}/${val}` });
                }}
              />

              {/* Auth message */}
              {authMsg && (
                <p
                  className={`text-xs ${authMsg.startsWith("✓") ? "text-green-500" : "text-destructive"}`}
                >
                  {authMsg}
                </p>
              )}
            </div>
          )}

          {/* ── Custom Provider Config ────────────────────────────────────── */}
          {isCustom &&
            selectedEntry &&
            selectedIdx >= 0 && (
              <div className="flex flex-col gap-4 border-t border-border pt-4">
                <span className="text-sm ">自定义 Provider</span>
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Provider Key（服务商标识）</Label>
                      <Input
                        placeholder="my-provider"
                        value={selectedEntry.customKey ?? ""}
                        onChange={(e) =>
                          updateProvider(selectedIdx, {
                            customKey: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">API 协议</Label>
                      <Select
                        value={selectedEntry.api}
                        onValueChange={(v) =>
                          updateProvider(selectedIdx, { api: v ?? "" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {API_TYPES.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Base URL（接口地址）</Label>
                    <Input
                      placeholder="https://api.example.com/v1"
                      value={selectedEntry.baseUrl}
                      onChange={(e) =>
                        updateProvider(selectedIdx, { baseUrl: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">API Key（密钥）</Label>
                    <Input
                      type="password"
                      placeholder="sk-..."
                      value={selectedEntry.apiKey}
                      onChange={(e) =>
                        updateProvider(selectedIdx, { apiKey: e.target.value })
                      }
                    />
                  </div>
                  {/* Model ID — reuse ModelSelector for consistency */}
                  <ModelSelector
                    models={[]}
                    value={selectedEntry.selectedModel}
                    placeholder="gpt-4o / claude-sonnet-4 / ..."
                    label="Model ID（模型 ID）"
                    onChange={(val) => {
                      const next = [...providers];
                      next[selectedIdx] = {
                        ...next[selectedIdx],
                        selectedModel: val,
                      };
                      onChange({
                        ...value,
                        providers: next,
                        defaultModel: `${value.defaultProvider}/${val}`,
                      });
                    }}
                  />
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Model Name（模型显示名称，可选）</Label>
                    <Input
                      placeholder="显示名称，如 GPT-4o"
                      value={selectedEntry.customModelName ?? ""}
                      onChange={(e) =>
                        updateProvider(selectedIdx, {
                          customModelName: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}
        </div>
      </ScrollArea>

      <div className="shrink-0 flex justify-between pt-4 px-4 border-t border-border">
        {onExit ? (
          <Button variant="ghost" onClick={onExit} className="text-muted-foreground">
            退出
          </Button>
        ) : <div />}
        <Button onClick={onNext}>
          下一步 →
        </Button>
      </div>
    </div>
  );
}
