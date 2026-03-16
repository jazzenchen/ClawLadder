// ModelsDialog — shows user-registered model providers from config
// Allows: view, add, set default, remove
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2,
  Cpu,
  Plus,
  Star,
  Trash2,
  Globe,
  Key,
  ChevronDown,
  Pencil,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  fetchUserModels,
  fetchProviders,
  fetchConfig,
  saveConfig,
  setDefaultModel,
  removeProvider,
  upsertProvider,
  gatewayRestart,
  type UserProvider,
  type UserModelsInfo,
  type CatalogProvider,
} from "@/lib/api";
import {
  PROVIDER_META,
  PROVIDER_GROUPS,
  API_TYPES,
  getProviderMeta,
  type ProviderMeta,
  type ProviderGroup,
} from "./onboarding/providerMeta";
import { useClickOutside } from "../hooks/useClickOutside";

// ---------------------------------------------------------------------------
// Chinese labels for known providers
// ---------------------------------------------------------------------------

const PROVIDER_LABELS: Record<string, string> = {};
for (const m of PROVIDER_META) {
  PROVIDER_LABELS[m.id] = m.label;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ModelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultModel?: string;
  onRefresh?: () => void;
}

// ---------------------------------------------------------------------------
// Provider card (user-registered)
// ---------------------------------------------------------------------------

function UserProviderCard({
  provider,
  isDefault,
  onSetDefault,
  onRemove,
  onEdit,
  settingDefault,
}: {
  provider: UserProvider;
  isDefault: boolean;
  onSetDefault: () => void;
  onRemove: () => void;
  onEdit: () => void;
  settingDefault: boolean;
}) {
  const meta = getProviderMeta(provider.key);
  const label = meta?.label ?? PROVIDER_LABELS[provider.key] ?? provider.key;
  const modelIds = provider.models?.map((m) => m.name || m.id) ?? [];

  return (
    <Card className={cn("p-3", isDefault && "ring-1 ring-primary/40")}>
      <div className="flex items-center gap-3">
        <Cpu className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className=" text-sm">{label}</span>
            {isDefault && (
              <Badge className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30">
                默认
              </Badge>
            )}
            {provider.api && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {provider.api}
              </Badge>
            )}
          </div>
          {provider.baseUrl && (
            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono flex items-center gap-1">
              <Globe className="w-2.5 h-2.5" />
              {provider.baseUrl}
            </p>
          )}
          {provider.apiKey && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Key className="w-2.5 h-2.5" />
              {provider.apiKey}
            </p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-primary"
            onClick={onEdit}
            title="编辑"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          {!isDefault && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={onSetDefault}
              disabled={settingDefault}
              title="设为默认"
            >
              <Star className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Model list */}
      {modelIds.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/30 space-y-0.5">
          {modelIds.map((name, i) => (
            <div key={i} className="text-xs font-mono text-muted-foreground pl-6">
              {name}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Builtin provider card (detected from env keys, not in models.providers)
// ---------------------------------------------------------------------------

function BuiltinProviderCard({
  providerKey,
  envKey,
  isDefault,
  defaultPrimary,
  onSetDefault,
  onRemove,
  onEdit,
  settingDefault,
}: {
  providerKey: string;
  envKey: string;
  isDefault: boolean;
  defaultPrimary: string;
  onSetDefault: (modelPath: string) => void;
  onRemove: () => void;
  onEdit: () => void;
  settingDefault: boolean;
}) {
  const meta = getProviderMeta(providerKey);
  const label = meta?.label ?? PROVIDER_LABELS[providerKey] ?? providerKey;
  const modelId = isDefault ? defaultPrimary.split("/").slice(1).join("/") : meta?.exampleModel ?? "";

  return (
    <Card className={cn("p-3", isDefault && "ring-1 ring-primary/40")}>
      <div className="flex items-center gap-3">
        <Cpu className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className=" text-sm">{label}</span>
            {isDefault && (
              <Badge className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30">
                默认
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">内置</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Key className="w-2.5 h-2.5" />
            {envKey} ✓
          </p>
          {modelId && (
            <p className="text-xs font-mono text-muted-foreground mt-1 pl-0">
              {modelId}
            </p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-primary"
            onClick={onEdit}
            title="编辑"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          {!isDefault && meta?.exampleModel && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={() => onSetDefault(`${providerKey}/${meta.exampleModel}`)}
              disabled={settingDefault}
              title="设为默认"
            >
              <Star className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            title="移除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Edit Builtin Provider Form (only API Key + default model)
// ---------------------------------------------------------------------------

function EditBuiltinProviderForm({
  providerKey,
  envKey,
  catalog,
  defaultPrimary,
  onSave,
  onCancel,
  saving,
}: {
  providerKey: string;
  envKey: string;
  catalog: CatalogProvider[];
  defaultPrimary: string;
  onSave: (data: { envKey: string; envValue: string; modelPath?: string }) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const meta = getProviderMeta(providerKey);
  const label = meta?.label ?? PROVIDER_LABELS[providerKey] ?? providerKey;
  const currentModelId = defaultPrimary.startsWith(providerKey + "/")
    ? defaultPrimary.split("/").slice(1).join("/")
    : "";

  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState(currentModelId || meta?.exampleModel || "");

  // Catalog models for this provider
  const catalogModels = catalog.find((c) => c.id === providerKey)?.models ?? [];
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const closeModelDropdown = useCallback(() => setModelDropdownOpen(false), []);
  useClickOutside(modelDropdownRef, closeModelDropdown);
  const filteredModels = catalogModels.filter(
    (m) => !modelId || (m.name || m.id).toLowerCase().includes(modelId.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-4 border rounded-lg p-4 bg-muted/20">
      <div className="flex items-center gap-2">
        <span className="text-sm ">编辑: {label}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">内置</Badge>
      </div>

      {/* API Key */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">
          API Key
          <span className="text-muted-foreground ml-1">({envKey})</span>
        </Label>
        <Input
          type="password"
          placeholder={meta?.placeholder || "sk-...（留空则不修改）"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="text-[10px] text-muted-foreground">留空表示不修改当前 Key</p>
      </div>

      {/* Model selector */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">默认模型</Label>
        <div className="relative" ref={modelDropdownRef}>
          <div className="flex items-center border border-input rounded-lg bg-transparent dark:bg-input/30">
            <input
              className="flex-1 h-8 px-2.5 text-base md:text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              placeholder={meta?.exampleModel || "model-id"}
              value={modelId}
              onChange={(e) => { setModelId(e.target.value); if (!modelDropdownOpen && catalogModels.length > 0) setModelDropdownOpen(true); }}
              onFocus={() => { if (catalogModels.length > 0) setModelDropdownOpen(true); }}
            />
            {catalogModels.length > 0 && (
              <span className="pr-3 text-muted-foreground cursor-pointer" onMouseDown={(e) => { e.preventDefault(); setModelDropdownOpen((v) => !v); }}>
                <ChevronDown className="w-3 h-3" />
              </span>
            )}
          </div>
          {modelDropdownOpen && filteredModels.length > 0 && (
            <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-md">
              {filteredModels.map((m) => (
                <div
                  key={m.id}
                  className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-accent ${m.id === modelId ? "bg-accent/50" : ""}`}
                  onClick={() => { setModelId(m.id); setModelDropdownOpen(false); }}
                >
                  {m.name || m.id}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          取消
        </Button>
        <Button size="sm" onClick={() => onSave({
          envKey,
          envValue: apiKey,
          modelPath: modelId ? `${providerKey}/${modelId}` : undefined,
        })} disabled={saving}>
          {saving ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />保存中…</> : "保存"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Provider Form (inline, reuses StepModels-style interaction)
// ---------------------------------------------------------------------------

interface AddProviderFormProps {
  catalog: CatalogProvider[];
  onSave: (data: {
    providerKey: string;
    isBuiltin: boolean;
    entry?: { apiKey?: string; baseUrl?: string; api?: string; models?: { id: string; name: string; reasoning: boolean; input: string[]; cost: { input: number; output: number; cacheRead: number; cacheWrite: number }; contextWindow: number; maxTokens: number }[] };
    envKey?: string;
    envValue?: string;
    setAsDefault?: boolean;
    modelPath?: string;
  }) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function AddProviderForm({ catalog, onSave, onCancel, saving }: AddProviderFormProps) {
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiProtocol, setApiProtocol] = useState("openai-completions");
  const [modelId, setModelId] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [customModelName, setCustomModelName] = useState("");
  const [setAsDefault, setSetAsDefault] = useState(true);

  // Searchable provider dropdown
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeDropdown = useCallback(() => setDropdownOpen(false), []);
  useClickOutside(dropdownRef, closeDropdown);

  const selectedMeta = getProviderMeta(selectedProviderId);
  const isCustom = selectedProviderId.startsWith("custom-");

  const CUSTOM_GROUP: ProviderGroup = {
    groupId: "__custom__",
    label: "+ 自定义 Provider",
    category: "other",
    variants: [],
  };

  const dropdownCategories = [
    { label: "热门", items: PROVIDER_GROUPS.filter((g) => g.category === "popular") },
    { label: "云服务", items: PROVIDER_GROUPS.filter((g) => g.category === "cloud") },
    { label: "本地", items: PROVIDER_GROUPS.filter((g) => g.category === "local") },
    { label: "其他", items: [...PROVIDER_GROUPS.filter((g) => g.category === "other"), CUSTOM_GROUP] },
  ];

  const filteredCategories = dropdownCategories
    .map((cat) => ({
      ...cat,
      items: cat.items.filter((g) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return g.label.toLowerCase().includes(q) || g.groupId.toLowerCase().includes(q) ||
          g.variants.some((v) => v.label.toLowerCase().includes(q) || v.id.toLowerCase().includes(q));
      }),
    }))
    .filter((cat) => cat.items.length > 0);

  const handleSelectProvider = (id: string) => {
    setSelectedProviderId(id);
    const meta = getProviderMeta(id);
    if (meta) {
      setBaseUrl(meta.baseUrl);
      setApiProtocol(meta.api);
      setModelId(meta.exampleModel);
    }
    setDropdownOpen(false);
    setSearchQuery("");
  };

  const getDisplayLabel = () => {
    if (!selectedProviderId) return "";
    if (isCustom) return customKey ? `自定义: ${customKey}` : "自定义 Provider";
    return selectedMeta?.label ?? selectedProviderId;
  };

  // Catalog models for selected provider
  const catalogModels = catalog.find((c) => c.id === selectedProviderId)?.models ?? [];

  // Model autocomplete
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const closeModelDropdown = useCallback(() => setModelDropdownOpen(false), []);
  useClickOutside(modelDropdownRef, closeModelDropdown);
  const filteredModels = catalogModels.filter(
    (m) => !modelId || (m.name || m.id).toLowerCase().includes(modelId.toLowerCase()),
  );

  const handleSave = async () => {
    const meta = selectedMeta;
    let key = selectedProviderId;
    if (isCustom && customKey) key = customKey;
    else if (isCustom && baseUrl) {
      try { key = `custom-${new URL(baseUrl).hostname.replace(/\./g, "-")}`; } catch { /* keep */ }
    }

    // Builtin catalog provider = meta exists, meta.baseUrl is empty, and user didn't provide a custom baseUrl
    const isBuiltin = !!meta && !meta.baseUrl && !baseUrl;

    const envKey = (meta?.envKey && apiKey && !isCustom) ? meta.envKey : undefined;
    const modelPath = modelId ? `${key}/${modelId}` : "";

    await onSave({
      providerKey: key,
      isBuiltin,
      // For builtin: no entry needed. For non-builtin: full entry with baseUrl + models
      entry: isBuiltin ? undefined : (() => {
        const entry: Record<string, unknown> = {};
        if (apiKey) entry.apiKey = apiKey;
        entry.baseUrl = baseUrl || meta?.baseUrl || "";
        if (isCustom && apiProtocol) entry.api = apiProtocol;
        else if (meta?.api) entry.api = meta.api;
        entry.models = modelId ? [{
          id: modelId,
          name: customModelName || `${modelId} (${key})`,
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 16000,
          maxTokens: 4096,
        }] : [];
        return entry;
      })(),
      envKey,
      envValue: envKey ? apiKey : undefined,
      setAsDefault: setAsDefault && !!modelPath,
      modelPath,
    });
  };

  const canSave = selectedProviderId && (apiKey || selectedMeta?.needsApiKey === false || isCustom);

  return (
    <div className="flex flex-col gap-4 border rounded-lg p-4 bg-muted/20">
      <div className="text-sm ">添加模型接口</div>

      {/* Provider selector */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">服务商</Label>
        <div className="relative" ref={dropdownRef}>
          <div className="flex items-center border border-input rounded-lg bg-transparent dark:bg-input/30 cursor-pointer">
            <input
              ref={inputRef}
              className="flex-1 h-8 px-2.5 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
              placeholder="搜索或选择服务商…"
              value={dropdownOpen ? searchQuery : getDisplayLabel()}
              onChange={(e) => { setSearchQuery(e.target.value); if (!dropdownOpen) setDropdownOpen(true); }}
              onFocus={() => { if (!dropdownOpen) { setSearchQuery(""); setDropdownOpen(true); } }}
            />
            <span
              className="pr-3 text-muted-foreground cursor-pointer select-none"
              onMouseDown={(e) => { e.preventDefault(); setDropdownOpen((v) => !v); if (!dropdownOpen) { setSearchQuery(""); inputRef.current?.focus(); } }}
            >
              <ChevronDown className="w-3 h-3" />
            </span>
          </div>
          {dropdownOpen && (
            <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-md">
              {filteredCategories.length === 0 ? (
                <div className="py-3 text-center text-xs text-muted-foreground">无匹配结果</div>
              ) : (
                filteredCategories.map((cat) => (
                  <div key={cat.label}>
                    <div className="px-3 py-1 text-xs text-muted-foreground sticky top-0 bg-popover">{cat.label}</div>
                    {cat.items.map((g) => (
                      <div
                        key={g.groupId}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground"
                        onClick={() => {
                          if (g.groupId === "__custom__") {
                            setSelectedProviderId(`custom-${Date.now()}`);
                            setDropdownOpen(false);
                            setSearchQuery("");
                          } else {
                            handleSelectProvider(g.variants[0].id);
                          }
                        }}
                      >
                        <span className="flex-1">{g.label}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Config fields */}
      {selectedProviderId && (
        <>
          {/* API Key */}
          {(selectedMeta?.needsApiKey !== false || isCustom) && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">
                API Key
                {selectedMeta?.envKey && <span className="text-muted-foreground ml-1">({selectedMeta.envKey})</span>}
              </Label>
              <Input
                type="password"
                placeholder={selectedMeta?.placeholder || "sk-..."}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          )}

          {/* Base URL (for custom or providers that need it) */}
          {(isCustom || selectedMeta?.baseUrl) && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Base URL</Label>
              <Input
                placeholder={selectedMeta?.baseUrl || "https://api.example.com/v1"}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          )}

          {/* API Protocol (for custom) */}
          {isCustom && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Provider Key</Label>
                <Input
                  placeholder="my-provider"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">API 协议</Label>
                <Select value={apiProtocol} onValueChange={(v) => v && setApiProtocol(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {API_TYPES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Model selector */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Model ID</Label>
            <div className="relative" ref={modelDropdownRef}>
              <div className="flex items-center border border-input rounded-lg bg-transparent dark:bg-input/30">
                <input
                  className="flex-1 h-8 px-2.5 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
                  placeholder={selectedMeta?.exampleModel || "model-id"}
                  value={modelId}
                  onChange={(e) => { setModelId(e.target.value); if (!modelDropdownOpen && catalogModels.length > 0) setModelDropdownOpen(true); }}
                  onFocus={() => { if (catalogModels.length > 0) setModelDropdownOpen(true); }}
                />
                {catalogModels.length > 0 && (
                  <span className="pr-3 text-muted-foreground cursor-pointer" onMouseDown={(e) => { e.preventDefault(); setModelDropdownOpen((v) => !v); }}>
                    <ChevronDown className="w-3 h-3" />
                  </span>
                )}
              </div>
              {modelDropdownOpen && filteredModels.length > 0 && (
                <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-md">
                  {filteredModels.map((m) => (
                    <div
                      key={m.id}
                      className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-accent ${m.id === modelId ? "bg-accent/50" : ""}`}
                      onClick={() => { setModelId(m.id); setModelDropdownOpen(false); }}
                    >
                      {m.name || m.id}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Custom model name */}
          {isCustom && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">显示名称（可选）</Label>
              <Input
                placeholder="GPT-4o"
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
              />
            </div>
          )}

          {/* Set as default checkbox */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={setAsDefault}
              onChange={(e) => setSetAsDefault(e.target.checked)}
              className="rounded"
            />
            保存后设为默认模型
          </label>
        </>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          取消
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave || saving}>
          {saving ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />保存中…</> : "保存"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Provider Form (inline)
// ---------------------------------------------------------------------------

interface EditProviderFormProps {
  provider: UserProvider;
  catalog: CatalogProvider[];
  onSave: (data: {
    providerKey: string;
    entry: { apiKey?: string; baseUrl?: string; api?: string; models?: { id: string; name: string; reasoning: boolean; input: string[]; cost: { input: number; output: number; cacheRead: number; cacheWrite: number }; contextWindow: number; maxTokens: number }[] };
    envKey?: string;
    envValue?: string;
  }) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function EditProviderForm({ provider, catalog, onSave, onCancel, saving }: EditProviderFormProps) {
  const meta = getProviderMeta(provider.key);
  const label = meta?.label ?? PROVIDER_LABELS[provider.key] ?? provider.key;
  const isCustom = !meta;

  const [apiKey, setApiKey] = useState(provider.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? "");
  const [apiProtocol, setApiProtocol] = useState(provider.api ?? meta?.api ?? "openai-completions");
  const [modelId, setModelId] = useState(provider.models?.[0]?.id ?? "");
  const [customModelName, setCustomModelName] = useState(provider.models?.[0]?.name ?? "");

  // Catalog models for this provider
  const catalogModels = catalog.find((c) => c.id === provider.key)?.models ?? [];
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const closeModelDropdown = useCallback(() => setModelDropdownOpen(false), []);
  useClickOutside(modelDropdownRef, closeModelDropdown);
  const filteredModels = catalogModels.filter(
    (m) => !modelId || (m.name || m.id).toLowerCase().includes(modelId.toLowerCase()),
  );

  const handleSave = async () => {
    const resolvedBaseUrl = baseUrl || provider.baseUrl || meta?.baseUrl || "";

    const entry: Record<string, unknown> = {};
    if (apiKey) entry.apiKey = apiKey;
    entry.baseUrl = resolvedBaseUrl;
    if (apiProtocol) entry.api = apiProtocol;
    if (modelId) {
      entry.models = [{
        id: modelId,
        name: customModelName || `${modelId} (${provider.key})`,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: provider.models?.[0]?.contextWindow ?? 16000,
        maxTokens: provider.models?.[0]?.maxTokens ?? 4096,
      }];
    } else {
      entry.models = [];
    }

    const envKey = (meta?.envKey && apiKey) ? meta.envKey : undefined;

    await onSave({
      providerKey: provider.key,
      entry: entry as typeof entry,
      envKey,
      envValue: envKey ? apiKey : undefined,
    });
  };

  return (
    <div className="flex flex-col gap-4 border rounded-lg p-4 bg-muted/20">
      <div className="text-sm ">编辑: {label}</div>

      {/* API Key */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">
          API Key
          {meta?.envKey && <span className="text-muted-foreground ml-1">({meta.envKey})</span>}
        </Label>
        <Input
          type="password"
          placeholder={meta?.placeholder || "sk-..."}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>

      {/* Base URL */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Base URL</Label>
        <Input
          placeholder={meta?.baseUrl || "https://api.example.com/v1"}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </div>

      {/* API Protocol (for custom providers) */}
      {isCustom && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">API 协议</Label>
          <Select value={apiProtocol} onValueChange={(v) => v && setApiProtocol(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {API_TYPES.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Model selector */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Model ID</Label>
        <div className="relative" ref={modelDropdownRef}>
          <div className="flex items-center border border-input rounded-lg bg-transparent dark:bg-input/30">
            <input
              className="flex-1 h-8 px-2.5 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
              placeholder={meta?.exampleModel || "model-id"}
              value={modelId}
              onChange={(e) => { setModelId(e.target.value); if (!modelDropdownOpen && catalogModels.length > 0) setModelDropdownOpen(true); }}
              onFocus={() => { if (catalogModels.length > 0) setModelDropdownOpen(true); }}
            />
            {catalogModels.length > 0 && (
              <span className="pr-3 text-muted-foreground cursor-pointer" onMouseDown={(e) => { e.preventDefault(); setModelDropdownOpen((v) => !v); }}>
                <ChevronDown className="w-3 h-3" />
              </span>
            )}
          </div>
          {modelDropdownOpen && filteredModels.length > 0 && (
            <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-md">
              {filteredModels.map((m) => (
                <div
                  key={m.id}
                  className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-accent ${m.id === modelId ? "bg-accent/50" : ""}`}
                  onClick={() => { setModelId(m.id); setModelDropdownOpen(false); }}
                >
                  {m.name || m.id}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Display name */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">显示名称（可选）</Label>
        <Input
          placeholder="模型显示名称"
          value={customModelName}
          onChange={(e) => setCustomModelName(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          取消
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />保存中…</> : "保存"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dialog
// ---------------------------------------------------------------------------

export function ModelsDialog({ open, onOpenChange, defaultModel, onRefresh }: ModelsDialogProps) {
  const [userModels, setUserModels] = useState<UserModelsInfo | null>(null);
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingBuiltinKey, setEditingBuiltinKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [um, cat] = await Promise.all([
        fetchUserModels(),
        fetchProviders().catch(() => ({ providers: [], totalModels: 0 })),
      ]);
      setUserModels(um);
      setCatalog(cat.providers);
      // Auto-expand add form if no providers configured
      const hasProviders = (um.providers.length > 0) || (um.envKeys.length > 0);
      if (!hasProviders) setAdding(true);
    } catch (e) {
      console.error("[ModelsDialog] load failed:", e);
      setError("加载模型信息失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const defaultPrimary = userModels?.defaultPrimary ?? "";
  const defaultProviderKey = defaultPrimary.split("/")[0];

  // Detect builtin providers from env keys (not in models.providers)
  const ENV_TO_PROVIDER: Record<string, { id: string; envKey: string }> = {};
  for (const m of PROVIDER_META) {
    if (m.envKey) ENV_TO_PROVIDER[m.envKey] = { id: m.id, envKey: m.envKey };
  }
  const explicitKeys = new Set(userModels?.providers.map((p) => p.key) ?? []);
  const builtinProviders: { id: string; envKey: string }[] = [];
  for (const ek of userModels?.envKeys ?? []) {
    const info = ENV_TO_PROVIDER[ek];
    if (info && !explicitKeys.has(info.id)) {
      builtinProviders.push(info);
    }
  }

  const providerCount = (userModels?.providers.length ?? 0) + builtinProviders.length;

  const handleSetDefault = async (modelPath: string) => {
    setSettingDefault(true);
    try {
      await setDefaultModel(modelPath);
      await gatewayRestart();
      await load();
      onRefresh?.();
    } catch (e) {
      console.error("[ModelsDialog] setDefault failed:", e);
      setError("设置默认模型失败");
    } finally {
      setSettingDefault(false);
    }
  };

  const handleRemove = async (providerKey: string) => {
    try {
      await removeProvider(providerKey);
      // Gateway restart may fail if no providers left — that's OK
      try { await gatewayRestart(); } catch { /* ignore */ }
      await load();
      onRefresh?.();
    } catch (e) {
      console.error("[ModelsDialog] remove failed:", e);
      setError("删除失败");
    }
  };

  // Remove a builtin provider by clearing its env key
  const handleRemoveBuiltin = async (envKey: string) => {
    try {
      const config = (await fetchConfig()) as Record<string, unknown> | null;
      if (!config) return;
      const envObj = { ...(config.env as Record<string, string>) ?? {} };
      delete envObj[envKey];
      config.env = envObj;
      await saveConfig(config);
      try { await gatewayRestart(); } catch { /* ignore */ }
      await load();
      onRefresh?.();
    } catch (e) {
      console.error("[ModelsDialog] remove builtin failed:", e);
      setError("删除失败");
    }
  };

  // Edit a builtin provider (update env key + optionally set default model)
  const handleEditBuiltinSave = async (data: { envKey: string; envValue: string; modelPath?: string }) => {
    setSaving(true);
    try {
      const config = (await fetchConfig()) as Record<string, unknown> | null;
      if (!config) throw new Error("Config not found");
      // Update env key if a new value was provided
      if (data.envValue) {
        const envObj = { ...(config.env as Record<string, string>) ?? {} };
        envObj[data.envKey] = data.envValue;
        config.env = envObj;
      }
      // Update default model if provided
      if (data.modelPath) {
        const agents = (config.agents as Record<string, unknown>) ?? {};
        const defaults = (agents.defaults as Record<string, unknown>) ?? {};
        const modelDefaults = (defaults.model as Record<string, unknown>) ?? {};
        config.agents = {
          ...agents,
          defaults: { ...defaults, model: { ...modelDefaults, primary: data.modelPath } },
        };
      }
      await saveConfig(config);
      try { await gatewayRestart(); } catch { /* ignore */ }
      setEditingBuiltinKey(null);
      await load();
      onRefresh?.();
    } catch (e) {
      console.error("[ModelsDialog] edit builtin failed:", e);
      setError("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleAddSave = async (data: {
    providerKey: string;
    isBuiltin: boolean;
    entry?: Record<string, unknown>;
    envKey?: string;
    envValue?: string;
    setAsDefault?: boolean;
    modelPath?: string;
  }) => {
    setSaving(true);
    try {
      if (data.isBuiltin) {
        // Builtin catalog provider: only set env key, no models.providers entry
        const config = (await fetchConfig()) as Record<string, unknown> | null;
        if (!config) throw new Error("Config not found");
        if (data.envKey && data.envValue) {
          const envObj = { ...(config.env as Record<string, string>) ?? {} };
          envObj[data.envKey] = data.envValue;
          config.env = envObj;
        }
        if (data.setAsDefault && data.modelPath) {
          const agents = (config.agents as Record<string, unknown>) ?? {};
          const defaults = (agents.defaults as Record<string, unknown>) ?? {};
          const modelDefaults = (defaults.model as Record<string, unknown>) ?? {};
          config.agents = {
            ...agents,
            defaults: { ...defaults, model: { ...modelDefaults, primary: data.modelPath } },
          };
        }
        await saveConfig(config);
      } else {
        // Non-builtin: write full entry to models.providers
        if (data.entry) {
          await upsertProvider(data.providerKey, data.entry as Parameters<typeof upsertProvider>[1], data.envKey, data.envValue);
        }
        if (data.setAsDefault && data.modelPath) {
          await setDefaultModel(data.modelPath);
        }
      }
      await gatewayRestart();
      setAdding(false);
      await load();
      onRefresh?.();
    } catch (e) {
      console.error("[ModelsDialog] add failed:", e);
      setError("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = async (data: {
    providerKey: string;
    entry: Record<string, unknown>;
    envKey?: string;
    envValue?: string;
  }) => {
    setSaving(true);
    try {
      await upsertProvider(data.providerKey, data.entry as Parameters<typeof upsertProvider>[1], data.envKey, data.envValue);
      await gatewayRestart();
      setEditingKey(null);
      await load();
      onRefresh?.();
    } catch (e) {
      console.error("[ModelsDialog] edit failed:", e);
      setError("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-2xl max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            模型管理
          </DialogTitle>
          <DialogDescription>
            {loading ? "加载中…" : `${providerCount} 个已注册的模型接口`}
            {defaultPrimary && (
              <span className="ml-2 font-mono text-[11px] opacity-70">
                默认: {defaultPrimary}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 px-1">
            <div className="space-y-3">
              {/* Explicit providers from config */}
              {userModels?.providers.map((p) =>
                editingKey === p.key ? (
                  <EditProviderForm
                    key={p.key}
                    provider={p}
                    catalog={catalog}
                    onSave={handleEditSave}
                    onCancel={() => setEditingKey(null)}
                    saving={saving}
                  />
                ) : (
                  <UserProviderCard
                    key={p.key}
                    provider={p}
                    isDefault={p.key === defaultProviderKey}
                    onSetDefault={() => {
                      const modelId = p.models?.[0]?.id ?? "";
                      handleSetDefault(modelId ? `${p.key}/${modelId}` : p.key);
                    }}
                    onRemove={() => handleRemove(p.key)}
                    onEdit={() => { setEditingKey(p.key); setAdding(false); }}
                    settingDefault={settingDefault}
                  />
                )
              )}

              {/* Builtin providers detected from env keys */}
              {builtinProviders.map((bp) =>
                editingBuiltinKey === bp.id ? (
                  <EditBuiltinProviderForm
                    key={bp.id}
                    providerKey={bp.id}
                    envKey={bp.envKey}
                    catalog={catalog}
                    defaultPrimary={defaultPrimary}
                    onSave={handleEditBuiltinSave}
                    onCancel={() => setEditingBuiltinKey(null)}
                    saving={saving}
                  />
                ) : (
                  <BuiltinProviderCard
                    key={bp.id}
                    providerKey={bp.id}
                    envKey={bp.envKey}
                    isDefault={bp.id === defaultProviderKey}
                    defaultPrimary={defaultPrimary}
                    onSetDefault={handleSetDefault}
                    onRemove={() => handleRemoveBuiltin(bp.envKey)}
                    onEdit={() => { setEditingBuiltinKey(bp.id); setAdding(false); setEditingKey(null); }}
                    settingDefault={settingDefault}
                  />
                )
              )}

              {providerCount === 0 && !adding && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  暂无已注册的模型接口，点击下方按钮添加。
                </p>
              )}

              {/* Add form */}
              {adding && (
                <AddProviderForm
                  catalog={catalog}
                  onSave={handleAddSave}
                  onCancel={() => setAdding(false)}
                  saving={saving}
                />
              )}
            </div>
          </div>
        )}

        <DialogFooter className="border-t pt-3">
          {!adding && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdding(true)}
              className="gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              添加模型接口
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
