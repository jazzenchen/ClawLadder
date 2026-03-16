// Unified provider form — handles add, edit, and editBuiltin modes
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  API_TYPES,
  getProviderMeta,
  getAuthMethods,
} from "@/components/onboarding/providerMeta";
import type { CatalogProvider, UserProvider } from "@/lib/api";
import { ModelAutocomplete } from "./ModelAutocomplete";
import { ProviderSearchDropdown } from "./ProviderSearchDropdown";
import { OAuthLoginSection } from "./OAuthLoginSection";
import { providerLabel } from "./ProviderCard";

// ---------------------------------------------------------------------------
// Shared save payload
// ---------------------------------------------------------------------------

/** Payload emitted by all form modes */
export interface ProviderFormPayload {
  providerKey: string;
  isBuiltin: boolean;
  entry?: {
    apiKey?: string;
    baseUrl?: string;
    api?: string;
    models?: {
      id: string;
      name: string;
      reasoning: boolean;
      input: string[];
      cost: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
      };
      contextWindow: number;
      maxTokens: number;
    }[];
  };
  envKey?: string;
  envValue?: string;
  setAsDefault?: boolean;
  modelPath?: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

// STUB — will be filled with StrReplace
export type ProviderFormMode =
  | { kind: "add" }
  | { kind: "edit"; provider: UserProvider }
  | {
      kind: "editBuiltin";
      providerKey: string;
      envKey: string;
      defaultPrimary: string;
    };

export interface ProviderFormProps {
  mode: ProviderFormMode;
  catalog: CatalogProvider[];
  onSave: (payload: ProviderFormPayload) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProviderForm({
  mode,
  catalog,
  onSave,
  onCancel,
  saving,
}: ProviderFormProps) {
  if (mode.kind === "editBuiltin") {
    return (
      <EditBuiltinForm
        mode={mode}
        catalog={catalog}
        onSave={onSave}
        onCancel={onCancel}
        saving={saving}
      />
    );
  }
  if (mode.kind === "edit") {
    return (
      <EditForm
        mode={mode}
        catalog={catalog}
        onSave={onSave}
        onCancel={onCancel}
        saving={saving}
      />
    );
  }
  return (
    <AddForm
      catalog={catalog}
      onSave={onSave}
      onCancel={onCancel}
      saving={saving}
    />
  );
}

// ---------------------------------------------------------------------------
// SaveBar — shared footer
// ---------------------------------------------------------------------------

function SaveBar({
  onCancel,
  onSave,
  canSave,
  saving,
}: {
  onCancel: () => void;
  onSave: () => void;
  canSave: boolean;
  saving: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      {!saving && (
        <Button variant="outline" size="sm" onClick={onCancel}>
          取消
        </Button>
      )}
      <Button size="sm" onClick={onSave} disabled={!canSave || saving}>
        {saving ? (
          <span className="inline-flex items-center">
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
            保存中…
          </span>
        ) : (
          "保存"
        )}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditBuiltinForm
// ---------------------------------------------------------------------------

function EditBuiltinForm({
  mode,
  catalog,
  onSave,
  onCancel,
  saving,
}: {
  mode: Extract<ProviderFormMode, { kind: "editBuiltin" }>;
  catalog: CatalogProvider[];
  onSave: (p: ProviderFormPayload) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const { providerKey, envKey, defaultPrimary } = mode;
  const meta = getProviderMeta(providerKey);
  const label = providerLabel(providerKey, meta);
  const currentModelId = defaultPrimary.startsWith(providerKey + "/")
    ? defaultPrimary.split("/").slice(1).join("/")
    : "";

  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState(
    currentModelId || meta?.exampleModel || "",
  );

  const catalogModels = catalog.find((c) => c.id === providerKey)?.models ?? [];

  return (
    <div className="flex flex-col gap-4 border rounded-lg p-4 bg-muted/20">
      <div className="flex items-center gap-2">
        <span className="text-sm">编辑: {label}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          内置
        </Badge>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">
          API Key <span className="text-muted-foreground ml-1">({envKey})</span>
        </Label>
        <Input
          type="password"
          placeholder={meta?.placeholder || "sk-...（留空则不修改）"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="text-[10px] text-muted-foreground">
          留空表示不修改当前 Key
        </p>
      </div>
      <ModelAutocomplete
        models={catalogModels}
        value={modelId}
        placeholder={meta?.exampleModel || "model-id"}
        onChange={setModelId}
        label="默认模型"
      />
      <SaveBar
        onCancel={onCancel}
        saving={saving}
        canSave
        onSave={() =>
          onSave({
            providerKey,
            isBuiltin: true,
            envKey,
            envValue: apiKey || undefined,
            modelPath: modelId ? `${providerKey}/${modelId}` : undefined,
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditForm
// ---------------------------------------------------------------------------

function EditForm({
  mode,
  catalog,
  onSave,
  onCancel,
  saving,
}: {
  mode: Extract<ProviderFormMode, { kind: "edit" }>;
  catalog: CatalogProvider[];
  onSave: (p: ProviderFormPayload) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const { provider } = mode;
  const meta = getProviderMeta(provider.key);
  const label = providerLabel(provider.key, meta);
  const isCustom = !meta;

  const [apiKey, setApiKey] = useState(provider.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? "");
  const [apiProtocol, setApiProtocol] = useState(
    provider.api ?? meta?.api ?? "openai-completions",
  );
  const [modelId, setModelId] = useState(provider.models?.[0]?.id ?? "");
  const [customModelName, setCustomModelName] = useState(
    provider.models?.[0]?.name ?? "",
  );

  const catalogModels =
    catalog.find((c) => c.id === provider.key)?.models ?? [];

  const handleSave = () => {
    const resolvedBaseUrl = baseUrl || provider.baseUrl || meta?.baseUrl || "";
    const entry: Record<string, unknown> = {};
    if (apiKey) entry.apiKey = apiKey;
    entry.baseUrl = resolvedBaseUrl;
    if (apiProtocol) entry.api = apiProtocol;
    entry.models = modelId
      ? [
          {
            id: modelId,
            name: customModelName || `${modelId} (${provider.key})`,
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: provider.models?.[0]?.contextWindow ?? 16000,
            maxTokens: provider.models?.[0]?.maxTokens ?? 4096,
          },
        ]
      : [];
    const envKey = meta?.envKey && apiKey ? meta.envKey : undefined;
    onSave({
      providerKey: provider.key,
      isBuiltin: false,
      entry: entry as ProviderFormPayload["entry"],
      envKey,
      envValue: envKey ? apiKey : undefined,
    });
  };

  return (
    <div className="flex flex-col gap-4 border rounded-lg p-4 bg-muted/20">
      <div className="text-sm">编辑: {label}</div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">
          API Key
          {meta?.envKey && (
            <span className="text-muted-foreground ml-1">({meta.envKey})</span>
          )}
        </Label>
        <Input
          type="password"
          placeholder={meta?.placeholder || "sk-..."}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Base URL</Label>
        <Input
          placeholder={meta?.baseUrl || "https://api.example.com/v1"}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </div>
      {isCustom && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">API 协议</Label>
          <Select
            value={apiProtocol}
            onValueChange={(v) => v && setApiProtocol(v)}
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
      )}
      <ModelAutocomplete
        models={catalogModels}
        value={modelId}
        placeholder={meta?.exampleModel || "model-id"}
        onChange={setModelId}
        label="Model ID"
      />
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">显示名称（可选）</Label>
        <Input
          placeholder="模型显示名称"
          value={customModelName}
          onChange={(e) => setCustomModelName(e.target.value)}
        />
      </div>
      <SaveBar
        onCancel={onCancel}
        saving={saving}
        canSave
        onSave={handleSave}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddForm
// ---------------------------------------------------------------------------

function AddForm({
  catalog,
  onSave,
  onCancel,
  saving,
}: {
  catalog: CatalogProvider[];
  onSave: (p: ProviderFormPayload) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiProtocol, setApiProtocol] = useState("openai-completions");
  const [modelId, setModelId] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [customModelName, setCustomModelName] = useState("");
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  const selectedMeta = getProviderMeta(selectedProviderId);
  const isCustom = selectedProviderId.startsWith("custom-");

  const handleSelectProvider = (id: string) => {
    setSelectedProviderId(id);
    setAuthenticated(false);
    const meta = getProviderMeta(id);
    if (meta) {
      setBaseUrl(meta.baseUrl);
      setApiProtocol(meta.api);
      setModelId(meta.exampleModel);
    }
  };

  const getDisplayLabel = () => {
    if (!selectedProviderId) return "";
    if (isCustom) return customKey ? `自定义: ${customKey}` : "自定义 Provider";
    return selectedMeta?.label ?? selectedProviderId;
  };

  const catalogModels =
    catalog.find((c) => c.id === selectedProviderId)?.models ?? [];

  const handleSave = () => {
    const meta = selectedMeta;
    let key = selectedProviderId;
    if (isCustom && customKey) key = customKey;
    else if (isCustom && baseUrl) {
      try {
        key = `custom-${new URL(baseUrl).hostname.replace(/\./g, "-")}`;
      } catch {
        /* keep */
      }
    }
    const isBuiltin = !!meta && !meta.baseUrl && !baseUrl;
    const envKey =
      meta?.envKey && apiKey && !isCustom ? meta.envKey : undefined;
    const modelPath = modelId ? `${key}/${modelId}` : "";

    onSave({
      providerKey: key,
      isBuiltin,
      entry: isBuiltin
        ? undefined
        : ((() => {
            const entry: Record<string, unknown> = {};
            if (apiKey) entry.apiKey = apiKey;
            entry.baseUrl = baseUrl || meta?.baseUrl || "";
            if (isCustom && apiProtocol) entry.api = apiProtocol;
            else if (meta?.api) entry.api = meta.api;
            entry.models = modelId
              ? [
                  {
                    id: modelId,
                    name: customModelName || `${modelId} (${key})`,
                    reasoning: false,
                    input: ["text"],
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                    contextWindow: 16000,
                    maxTokens: 4096,
                  },
                ]
              : [];
            return entry;
          })() as ProviderFormPayload["entry"]),
      envKey,
      envValue: envKey ? apiKey : undefined,
      setAsDefault: setAsDefault && !!modelPath,
      modelPath,
    });
  };

  const canSave =
    selectedProviderId &&
    (apiKey ||
      authenticated ||
      selectedMeta?.needsApiKey === false ||
      isCustom);

  return (
    <div className="flex flex-col gap-4 border rounded-lg p-4 bg-muted/20">
      <div className="text-sm">添加模型接口</div>

      <ProviderSearchDropdown
        value={selectedProviderId}
        displayLabel={getDisplayLabel()}
        onSelect={handleSelectProvider}
        onSelectCustom={() => setSelectedProviderId(`custom-${Date.now()}`)}
        label="服务商"
      />

      {selectedProviderId && (
        <>
          {(selectedMeta?.needsApiKey !== false || isCustom) && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">
                API Key
                {selectedMeta?.envKey && (
                  <span className="text-muted-foreground ml-1">
                    ({selectedMeta.envKey})
                  </span>
                )}
              </Label>
              <Input
                type="password"
                placeholder={selectedMeta?.placeholder || "sk-..."}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          )}

          {selectedMeta?.authModes?.includes("plugin-oauth") && (
            <OAuthLoginSection
              meta={selectedMeta}
              providerId={selectedProviderId}
              authenticated={authenticated}
              onAuthenticated={() => setAuthenticated(true)}
            />
          )}

          {(isCustom || selectedMeta?.baseUrl) && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Base URL</Label>
              <Input
                placeholder={
                  selectedMeta?.baseUrl || "https://api.example.com/v1"
                }
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          )}

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
                <Select
                  value={apiProtocol}
                  onValueChange={(v) => v && setApiProtocol(v)}
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
          )}

          <ModelAutocomplete
            models={catalogModels}
            value={modelId}
            placeholder={selectedMeta?.exampleModel || "model-id"}
            onChange={setModelId}
            label="Model ID"
          />

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

      <SaveBar
        onCancel={onCancel}
        saving={saving}
        canSave={!!canSave}
        onSave={handleSave}
      />
    </div>
  );
}
