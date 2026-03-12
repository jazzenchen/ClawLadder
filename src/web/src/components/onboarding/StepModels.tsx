// Step 1: AI Model / Provider configuration — redesigned clean UI
import { useState, useEffect, useRef } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { ScrollArea } from "../ui/scroll-area";

import {
  fetchProviders,
  modelsAuthLogin,
  pluginsEnable,
  type CatalogProvider,
} from "../../lib/api";

import { useOnboardingStore } from "../../stores/onboarding";

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

// ── Provider metadata ──────────────────────────────────────────────────────

interface ProviderMeta {
  id: string;
  label: string;
  api: string;
  envKey: string;
  placeholder: string;
  baseUrl: string;
  needsApiKey: boolean;
  exampleModel: string;
  authModes: AuthMode[];
  authChoice?: string;
  pluginName?: string;
  oauthNote?: string;
  category: "popular" | "cloud" | "local" | "other";
  /** Group ID — variants with the same groupId are merged into one dropdown entry */
  groupId?: string;
  /** Short label shown in the variant selector within the config card */
  variantLabel?: string;
  /** Fallback model IDs shown when catalog is unavailable */
  fallbackModels?: string[];
}

/** A group shown in the dropdown — may contain 1+ variants */
interface ProviderGroup {
  groupId: string;
  label: string;
  category: "popular" | "cloud" | "local" | "other";
  /** All variant provider IDs in this group */
  variants: ProviderMeta[];
}

export const PROVIDER_META: ProviderMeta[] = [
  // ── Popular ────────────────────────────────────────────────────────────
  {
    id: "anthropic",
    label: "Anthropic",
    api: "anthropic-messages",
    envKey: "ANTHROPIC_API_KEY",
    placeholder: "sk-ant-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "claude-opus-4-6",
    authModes: ["apiKey", "setup-token"],
    authChoice: "anthropic-api-key",
    category: "popular",
    fallbackModels: [
      "claude-opus-4-6",
      "claude-sonnet-4-5",
      "claude-sonnet-4",
      "claude-haiku-3.5",
      "claude-3.5-sonnet",
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    api: "openai-completions",
    envKey: "OPENAI_API_KEY",
    placeholder: "sk-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "gpt-5.1-codex",
    authModes: ["apiKey"],
    authChoice: "openai-api-key",
    category: "popular",
    groupId: "openai",
    variantLabel: "API Key",
    fallbackModels: [
      "gpt-5.1-codex",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "o3",
      "o4-mini",
    ],
  },
  {
    id: "google",
    label: "Google Gemini (API Key)",
    api: "google-generative-ai",
    envKey: "GEMINI_API_KEY",
    placeholder: "AIza...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "gemini-3-pro-preview",
    authModes: ["apiKey"],
    authChoice: "gemini-api-key",
    category: "popular",
    groupId: "google",
    variantLabel: "Gemini API Key",
    fallbackModels: [
      "gemini-3-pro-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
    ],
  },
  {
    id: "groq",
    label: "Groq",
    api: "openai-completions",
    envKey: "GROQ_API_KEY",
    placeholder: "gsk_...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "llama-3.3-70b-versatile",
    authModes: ["apiKey"],
    authChoice: "groq-api-key",
    category: "popular",
    fallbackModels: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    api: "openai-completions",
    envKey: "OPENROUTER_API_KEY",
    placeholder: "sk-or-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "anthropic/claude-sonnet-4-5",
    authModes: ["apiKey"],
    category: "popular",
    fallbackModels: [
      "anthropic/claude-opus-4-6",
      "anthropic/claude-sonnet-4-5",
      "openai/gpt-4.1",
      "google/gemini-2.5-pro",
    ],
  },

  // ── Cloud ──────────────────────────────────────────────────────────────
  {
    id: "openai-codex",
    label: "OpenAI Codex (OAuth)",
    api: "openai-completions",
    envKey: "",
    placeholder: "(OAuth 登录)",
    baseUrl: "",
    needsApiKey: false,
    exampleModel: "gpt-5.3-codex",
    authModes: ["oauth"],
    authChoice: "openai-codex",
    category: "cloud",
    groupId: "openai",
    variantLabel: "Codex (OAuth)",
  },
  {
    id: "opencode",
    label: "OpenCode Zen",
    api: "openai-completions",
    envKey: "OPENCODE_API_KEY",
    placeholder: "sk-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "claude-opus-4-6",
    authModes: ["apiKey", "oauth"],
    authChoice: "opencode-zen",
    category: "cloud",
  },
  {
    id: "mistral",
    label: "Mistral",
    api: "openai-completions",
    envKey: "MISTRAL_API_KEY",
    placeholder: "sk-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "mistral-large-latest",
    authModes: ["apiKey"],
    authChoice: "mistral-api-key",
    category: "cloud",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    api: "openai-completions",
    envKey: "XAI_API_KEY",
    placeholder: "xai-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "grok-41-fast",
    authModes: ["apiKey"],
    category: "cloud",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    api: "openai-completions",
    envKey: "CEREBRAS_API_KEY",
    placeholder: "csk-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "llama-3.3-70b",
    authModes: ["apiKey"],
    category: "cloud",
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    api: "openai-completions",
    envKey: "HF_TOKEN",
    placeholder: "hf_...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "deepseek-ai/DeepSeek-R1",
    authModes: ["apiKey"],
    authChoice: "huggingface-api-key",
    category: "cloud",
  },
  {
    id: "together",
    label: "Together AI",
    api: "openai-completions",
    envKey: "TOGETHER_API_KEY",
    placeholder: "sk-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "meta-llama/Llama-3.3-70B",
    authModes: ["apiKey"],
    authChoice: "together-api-key",
    category: "cloud",
  },
  {
    id: "github-copilot",
    label: "GitHub Copilot",
    api: "openai-completions",
    envKey: "COPILOT_GITHUB_TOKEN",
    placeholder: "ghu_...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "gpt-4o",
    authModes: ["apiKey"],
    category: "cloud",
  },
  {
    id: "kilocode",
    label: "Kilocode Gateway",
    api: "openai-completions",
    envKey: "KILOCODE_API_KEY",
    placeholder: "sk-...",
    baseUrl: "https://api.kilo.ai/api/gateway/",
    needsApiKey: true,
    exampleModel: "anthropic/claude-opus-4.6",
    authModes: ["apiKey"],
    category: "cloud",
  },
  {
    id: "nvidia",
    label: "NVIDIA",
    api: "openai-completions",
    envKey: "NVIDIA_API_KEY",
    placeholder: "nvapi-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "nvidia/llama-3.1-nemotron-70b",
    authModes: ["apiKey"],
    category: "cloud",
  },
  {
    id: "venice",
    label: "Venice AI",
    api: "openai-completions",
    envKey: "VENICE_API_KEY",
    placeholder: "vapi_...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "kimi-k2-5",
    authModes: ["apiKey"],
    category: "cloud",
  },
  {
    id: "amazon-bedrock",
    label: "Amazon Bedrock",
    api: "bedrock-converse-stream",
    envKey: "AWS_ACCESS_KEY_ID",
    placeholder: "AKIA...",
    baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
    needsApiKey: false,
    exampleModel: "us.anthropic.claude-opus-4-6-v1:0",
    authModes: ["aws-sdk"],
    category: "cloud",
  },

  // ── Google OAuth / Vertex ─────────────────────────────────────────────
  {
    id: "google-vertex",
    label: "Google Vertex AI",
    api: "google-generative-ai",
    envKey: "",
    placeholder: "(gcloud ADC)",
    baseUrl: "",
    needsApiKey: false,
    exampleModel: "gemini-3-pro-preview",
    authModes: ["aws-sdk"],
    category: "cloud",
    oauthNote:
      "使用 gcloud ADC 认证，确保已运行 gcloud auth application-default login",
    groupId: "google",
    variantLabel: "Vertex AI (ADC)",
  },
  {
    id: "google-antigravity",
    label: "Google Antigravity (OAuth)",
    api: "google-generative-ai",
    envKey: "",
    placeholder: "(OAuth 登录)",
    baseUrl: "",
    needsApiKey: false,
    exampleModel: "gemini-3-pro-preview",
    authModes: ["plugin-oauth"],
    pluginName: "google-antigravity-auth",
    category: "cloud",
    oauthNote:
      "⚠️ 非官方集成，部分用户报告 Google 账号受限。建议使用非关键账号",
    groupId: "google",
    variantLabel: "Antigravity (OAuth)",
  },
  {
    id: "google-gemini-cli",
    label: "Google Gemini CLI (OAuth)",
    api: "google-generative-ai",
    envKey: "",
    placeholder: "(OAuth 登录)",
    baseUrl: "",
    needsApiKey: false,
    exampleModel: "gemini-3-pro-preview",
    authModes: ["plugin-oauth"],
    pluginName: "google-gemini-cli-auth",
    category: "cloud",
    oauthNote:
      "⚠️ 非官方集成，部分用户报告 Google 账号受限。建议使用非关键账号",
    groupId: "google",
    variantLabel: "Gemini CLI (OAuth)",
  },

  // ── China / Regional ──────────────────────────────────────────────────
  {
    id: "zai",
    label: "Z.AI (GLM)",
    api: "openai-completions",
    envKey: "ZAI_API_KEY",
    placeholder: "sk-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "glm-5",
    authModes: ["apiKey"],
    authChoice: "zai-api-key",
    category: "cloud",
  },
  {
    id: "moonshot",
    label: "Moonshot (Kimi)",
    api: "openai-completions",
    envKey: "MOONSHOT_API_KEY",
    placeholder: "sk-...",
    baseUrl: "https://api.moonshot.ai/v1",
    needsApiKey: true,
    exampleModel: "kimi-k2.5",
    authModes: ["apiKey"],
    authChoice: "moonshot-api-key",
    category: "cloud",
    groupId: "moonshot",
    variantLabel: "Moonshot API",
  },
  {
    id: "kimi-coding",
    label: "Kimi Coding",
    api: "anthropic-messages",
    envKey: "KIMI_API_KEY",
    placeholder: "sk-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "k2p5",
    authModes: ["apiKey"],
    authChoice: "kimi-code-api-key",
    category: "cloud",
    groupId: "moonshot",
    variantLabel: "Kimi Coding",
  },
  {
    id: "volcengine",
    label: "火山引擎 (Doubao)",
    api: "openai-completions",
    envKey: "VOLCANO_ENGINE_API_KEY",
    placeholder: "sk-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "doubao-seed-1-8-251228",
    authModes: ["apiKey"],
    authChoice: "volcengine-api-key",
    category: "cloud",
    groupId: "volcengine",
    variantLabel: "API Key",
  },
  {
    id: "volcengine-plan",
    label: "火山引擎 Coding Plan",
    api: "openai-completions",
    envKey: "VOLCANO_ENGINE_API_KEY",
    placeholder: "sk-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "ark-code-latest",
    authModes: ["apiKey"],
    category: "cloud",
    groupId: "volcengine",
    variantLabel: "Coding Plan",
  },
  {
    id: "byteplus",
    label: "BytePlus ARK",
    api: "openai-completions",
    envKey: "BYTEPLUS_API_KEY",
    placeholder: "sk-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "seed-1-8-251228",
    authModes: ["apiKey"],
    authChoice: "byteplus-api-key",
    category: "cloud",
    groupId: "byteplus",
    variantLabel: "API Key",
  },
  {
    id: "byteplus-plan",
    label: "BytePlus Coding Plan",
    api: "openai-completions",
    envKey: "BYTEPLUS_API_KEY",
    placeholder: "sk-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "ark-code-latest",
    authModes: ["apiKey"],
    category: "cloud",
    groupId: "byteplus",
    variantLabel: "Coding Plan",
  },
  {
    id: "qianfan",
    label: "百度千帆 (Qianfan)",
    api: "openai-completions",
    envKey: "QIANFAN_API_KEY",
    placeholder: "sk-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "ernie-4.5-turbo",
    authModes: ["apiKey"],
    category: "cloud",
  },
  {
    id: "xiaomi",
    label: "小米 (Xiaomi)",
    api: "openai-completions",
    envKey: "XIAOMI_API_KEY",
    placeholder: "sk-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "xiaomi-model",
    authModes: ["apiKey"],
    category: "cloud",
  },

  // ── Coding Plan (免费 OAuth) ─────────────────────────────────────────
  {
    id: "qwen-portal",
    label: "Qwen (Coding Plan)",
    api: "openai-completions",
    envKey: "",
    placeholder: "(OAuth 登录)",
    baseUrl: "",
    needsApiKey: false,
    exampleModel: "coder-model",
    authModes: ["plugin-oauth"],
    pluginName: "qwen-portal-auth",
    category: "cloud",
  },
  {
    id: "minimax-portal",
    label: "MiniMax (Coding Plan)",
    api: "anthropic-messages",
    envKey: "",
    placeholder: "(OAuth 登录)",
    baseUrl: "",
    needsApiKey: false,
    exampleModel: "MiniMax-M2.5",
    authModes: ["plugin-oauth"],
    pluginName: "minimax-portal-auth",
    category: "cloud",
    groupId: "minimax",
    variantLabel: "Coding Plan (OAuth)",
  },

  // ── Gateways / Proxies ────────────────────────────────────────────────
  {
    id: "vercel-ai-gateway",
    label: "Vercel AI Gateway",
    api: "openai-completions",
    envKey: "AI_GATEWAY_API_KEY",
    placeholder: "sk-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "anthropic/claude-opus-4.6",
    authModes: ["apiKey"],
    authChoice: "ai-gateway-api-key",
    category: "other",
  },
  {
    id: "cloudflare-ai-gateway",
    label: "Cloudflare AI Gateway",
    api: "openai-completions",
    envKey: "CF_AI_GATEWAY_API_KEY",
    placeholder: "sk-...",
    baseUrl: "",
    needsApiKey: true,
    exampleModel: "anthropic/claude-opus-4.6",
    authModes: ["apiKey"],
    category: "other",
  },

  // ── Local ──────────────────────────────────────────────────────────────
  {
    id: "ollama",
    label: "Ollama (Local)",
    api: "ollama",
    envKey: "",
    placeholder: "",
    baseUrl: "http://127.0.0.1:11434",
    needsApiKey: false,
    exampleModel: "llama3.3",
    authModes: ["none"],
    category: "local",
  },
  {
    id: "vllm",
    label: "vLLM (Local)",
    api: "openai-completions",
    envKey: "VLLM_API_KEY",
    placeholder: "vllm-local",
    baseUrl: "http://127.0.0.1:8000/v1",
    needsApiKey: false,
    exampleModel: "your-model-id",
    authModes: ["none"],
    category: "local",
  },

  // ── Custom-compatible ──────────────────────────────────────────────────
  {
    id: "litellm",
    label: "LiteLLM",
    api: "openai-completions",
    envKey: "LITELLM_API_KEY",
    placeholder: "sk-...",
    baseUrl: "http://localhost:4000",
    needsApiKey: true,
    exampleModel: "claude-opus-4-6",
    authModes: ["apiKey"],
    authChoice: "litellm-api-key",
    category: "other",
  },
  {
    id: "minimax",
    label: "MiniMax (API Key)",
    api: "anthropic-messages",
    envKey: "MINIMAX_API_KEY",
    placeholder: "sk-...",
    baseUrl: "https://api.minimax.io/anthropic",
    needsApiKey: true,
    exampleModel: "MiniMax-M2.5",
    authModes: ["apiKey"],
    category: "other",
    groupId: "minimax",
    variantLabel: "API Key",
  },
  {
    id: "synthetic",
    label: "Synthetic",
    api: "anthropic-messages",
    envKey: "SYNTHETIC_API_KEY",
    placeholder: "sk-...",
    baseUrl: "https://api.synthetic.new/anthropic",
    needsApiKey: true,
    exampleModel: "hf:MiniMaxAI/MiniMax-M2.5",
    authModes: ["apiKey"],
    authChoice: "synthetic-api-key",
    category: "other",
  },
];

export function getProviderMeta(id: string): ProviderMeta | undefined {
  return PROVIDER_META.find((m) => m.id === id);
}

/** Build merged groups from PROVIDER_META. Providers with the same groupId are merged. */
function buildProviderGroups(): ProviderGroup[] {
  const groupMap = new Map<string, ProviderGroup>();
  const result: ProviderGroup[] = [];

  for (const m of PROVIDER_META) {
    const gid = m.groupId;
    if (gid) {
      if (!groupMap.has(gid)) {
        const groupLabel: Record<string, string> = {
          google: "Google",
          openai: "OpenAI",
          moonshot: "Moonshot / Kimi",
          volcengine: "火山引擎",
          byteplus: "BytePlus",
          minimax: "MiniMax",
        };
        const group: ProviderGroup = {
          groupId: gid,
          label: groupLabel[gid] ?? m.label,
          category: m.category,
          variants: [],
        };
        groupMap.set(gid, group);
        result.push(group); // Insert at first-seen position
      }
      groupMap.get(gid)!.variants.push(m);
    } else {
      result.push({
        groupId: m.id,
        label: m.label,
        category: m.category,
        variants: [m],
      });
    }
  }

  return result;
}

const PROVIDER_GROUPS = buildProviderGroups();

/** Find the group a provider belongs to */
function getProviderGroup(providerId: string): ProviderGroup | undefined {
  return PROVIDER_GROUPS.find((g) =>
    g.variants.some((v) => v.id === providerId),
  );
}

// Static fallback for catalog
const STATIC_PROVIDERS: CatalogProvider[] = PROVIDER_META.map((m) => ({
  id: m.id,
  label: m.label,
  builtin: !m.baseUrl || ["ollama", "vllm", "amazon-bedrock"].includes(m.id),
  modelCount: m.fallbackModels?.length ?? 0,
  models: (m.fallbackModels ?? []).map((id) => ({
    id,
    key: `${m.id}/${id}`,
    name: id,
    input: "text",
    contextWindow: 0,
    available: true,
    local: false,
    tags: [],
  })),
}));

const API_TYPES = [
  { id: "openai-completions", label: "OpenAI Completions" },
  { id: "anthropic-messages", label: "Anthropic Messages" },
  { id: "google-generative-ai", label: "Google Generative AI" },
  { id: "ollama", label: "Ollama (Native)" },
  { id: "bedrock-converse-stream", label: "AWS Bedrock Converse" },
  { id: "openai-responses", label: "OpenAI Responses" },
];

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
  label = "Model ID",
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
              className="flex-1 h-8 px-2.5 text-base md:text-sm bg-transparent outline-none placeholder:text-muted-foreground"
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
            className="flex-1 h-8 px-2.5 text-base md:text-sm bg-transparent outline-none placeholder:text-muted-foreground"
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
                className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground ${m.id === value ? "bg-accent/50" : ""}`}
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
      defaultModel: entry?.selectedModel ?? "",
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
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
  const isCustom = value.defaultProvider.startsWith("custom-");

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
          {/* ── Provider Selector (searchable dropdown) ──────────────────── */}
          <div className="flex flex-col gap-2">
            <Label>服务商 (Provider)</Label>
            <div className="relative" ref={dropdownRef}>
              <div className="flex items-center border border-input rounded-lg bg-transparent dark:bg-input/30 cursor-pointer">
                <input
                  ref={inputRef}
                  className="flex-1 h-8 px-2.5 text-base md:text-sm bg-transparent outline-none placeholder:text-muted-foreground"
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
                    <div className="py-3 text-center text-sm text-muted-foreground">
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
                              className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground ${
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
              <div className="text-sm flex items-center gap-2 font-medium">
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
                            <div className="text-sm font-medium truncate">
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
                    API Key
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
                  <Label className="text-xs">Setup Token</Label>
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
                    <Label className="text-xs">Base URL</Label>
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
                value={selectedEntry.selectedModel || value.defaultModel}
                placeholder={selectedMeta.exampleModel || "model-id"}
                onChange={(val) => {
                  const next = [...providers];
                  next[selectedIdx] = {
                    ...next[selectedIdx],
                    selectedModel: val,
                  };
                  onChange({ ...value, providers: next, defaultModel: val });
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
          {value.defaultProvider.startsWith("custom-") &&
            selectedEntry &&
            selectedIdx >= 0 && (
              <div className="flex flex-col gap-4 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">自定义 Provider</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive text-xs h-7"
                    onClick={() => removeCustomProvider(selectedIdx)}
                  >
                    删除
                  </Button>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Provider Key</Label>
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
                    <Label className="text-xs">Base URL</Label>
                    <Input
                      placeholder="https://api.example.com/v1"
                      value={selectedEntry.baseUrl}
                      onChange={(e) =>
                        updateProvider(selectedIdx, { baseUrl: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">API Key</Label>
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
                    label="Model ID"
                    onChange={(val) => {
                      const next = [...providers];
                      next[selectedIdx] = {
                        ...next[selectedIdx],
                        selectedModel: val,
                      };
                      onChange({
                        ...value,
                        providers: next,
                        defaultModel: val,
                      });
                    }}
                  />
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Model Name（可选）</Label>
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
        <Button onClick={onNext} disabled={!canProceed}>
          下一步 →
        </Button>
      </div>
    </div>
  );
}
