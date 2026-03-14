// Provider metadata, grouping logic, and static fallback catalog
// Extracted from StepModels.tsx to keep the component file focused on UI.

import type { AuthMode } from "./StepModels";
import type { CatalogProvider } from "../../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────

export interface ProviderMeta {
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
  groupId?: string;
  variantLabel?: string;
  fallbackModels?: string[];
}

export interface ProviderGroup {
  groupId: string;
  label: string;
  category: "popular" | "cloud" | "local" | "other";
  variants: ProviderMeta[];
}

// ── PROVIDER_META ─────────────────────────────────────────────────────────

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
    fallbackModels: ["claude-opus-4-6", "claude-sonnet-4-5", "claude-sonnet-4", "claude-haiku-3.5", "claude-3.5-sonnet"],
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
    fallbackModels: ["gpt-5.1-codex", "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
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
    fallbackModels: ["gemini-3-pro-preview", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
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
    fallbackModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
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
    fallbackModels: ["anthropic/claude-opus-4-6", "anthropic/claude-sonnet-4-5", "openai/gpt-4.1", "google/gemini-2.5-pro"],
  },

  // ── Cloud ──────────────────────────────────────────────────────────────
  { id: "openai-codex", label: "OpenAI Codex (OAuth)", api: "openai-completions", envKey: "", placeholder: "(OAuth 登录)", baseUrl: "", needsApiKey: false, exampleModel: "gpt-5.3-codex", authModes: ["oauth"], authChoice: "openai-codex", category: "cloud", groupId: "openai", variantLabel: "Codex (OAuth)" },
  { id: "opencode", label: "OpenCode Zen", api: "openai-completions", envKey: "OPENCODE_API_KEY", placeholder: "sk-...", baseUrl: "", needsApiKey: true, exampleModel: "claude-opus-4-6", authModes: ["apiKey", "oauth"], authChoice: "opencode-zen", category: "cloud" },
  { id: "mistral", label: "Mistral", api: "openai-completions", envKey: "MISTRAL_API_KEY", placeholder: "sk-...", baseUrl: "", needsApiKey: true, exampleModel: "mistral-large-latest", authModes: ["apiKey"], authChoice: "mistral-api-key", category: "cloud" },
  { id: "xai", label: "xAI (Grok)", api: "openai-completions", envKey: "XAI_API_KEY", placeholder: "xai-...", baseUrl: "", needsApiKey: true, exampleModel: "grok-41-fast", authModes: ["apiKey"], category: "cloud" },
  { id: "cerebras", label: "Cerebras", api: "openai-completions", envKey: "CEREBRAS_API_KEY", placeholder: "csk-...", baseUrl: "", needsApiKey: true, exampleModel: "llama-3.3-70b", authModes: ["apiKey"], category: "cloud" },
  { id: "huggingface", label: "Hugging Face", api: "openai-completions", envKey: "HF_TOKEN", placeholder: "hf_...", baseUrl: "", needsApiKey: true, exampleModel: "deepseek-ai/DeepSeek-R1", authModes: ["apiKey"], authChoice: "huggingface-api-key", category: "cloud" },
  { id: "together", label: "Together AI", api: "openai-completions", envKey: "TOGETHER_API_KEY", placeholder: "sk-...", baseUrl: "", needsApiKey: true, exampleModel: "meta-llama/Llama-3.3-70B", authModes: ["apiKey"], authChoice: "together-api-key", category: "cloud" },
  { id: "github-copilot", label: "GitHub Copilot", api: "openai-completions", envKey: "COPILOT_GITHUB_TOKEN", placeholder: "ghu_...", baseUrl: "", needsApiKey: true, exampleModel: "gpt-4o", authModes: ["apiKey"], category: "cloud" },
  { id: "kilocode", label: "Kilocode Gateway", api: "openai-completions", envKey: "KILOCODE_API_KEY", placeholder: "sk-...", baseUrl: "https://api.kilo.ai/api/gateway/", needsApiKey: true, exampleModel: "anthropic/claude-opus-4.6", authModes: ["apiKey"], category: "cloud" },
  { id: "nvidia", label: "NVIDIA", api: "openai-completions", envKey: "NVIDIA_API_KEY", placeholder: "nvapi-...", baseUrl: "", needsApiKey: true, exampleModel: "nvidia/llama-3.1-nemotron-70b", authModes: ["apiKey"], category: "cloud" },
  { id: "venice", label: "Venice AI", api: "openai-completions", envKey: "VENICE_API_KEY", placeholder: "vapi_...", baseUrl: "", needsApiKey: true, exampleModel: "kimi-k2-5", authModes: ["apiKey"], category: "cloud" },
  { id: "amazon-bedrock", label: "Amazon Bedrock", api: "bedrock-converse-stream", envKey: "AWS_ACCESS_KEY_ID", placeholder: "AKIA...", baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com", needsApiKey: false, exampleModel: "us.anthropic.claude-opus-4-6-v1:0", authModes: ["aws-sdk"], category: "cloud" },

  // ── Google OAuth / Vertex ─────────────────────────────────────────────
  { id: "google-vertex", label: "Google Vertex AI", api: "google-generative-ai", envKey: "", placeholder: "(gcloud ADC)", baseUrl: "", needsApiKey: false, exampleModel: "gemini-3-pro-preview", authModes: ["aws-sdk"], category: "cloud", oauthNote: "使用 gcloud ADC 认证，确保已运行 gcloud auth application-default login", groupId: "google", variantLabel: "Vertex AI (ADC)" },
  { id: "google-antigravity", label: "Google Antigravity (OAuth)", api: "google-generative-ai", envKey: "", placeholder: "(OAuth 登录)", baseUrl: "", needsApiKey: false, exampleModel: "gemini-3-pro-preview", authModes: ["plugin-oauth"], pluginName: "google-antigravity-auth", category: "cloud", oauthNote: "⚠️ 非官方集成，部分用户报告 Google 账号受限。建议使用非关键账号", groupId: "google", variantLabel: "Antigravity (OAuth)" },
  { id: "google-gemini-cli", label: "Google Gemini CLI (OAuth)", api: "google-generative-ai", envKey: "", placeholder: "(OAuth 登录)", baseUrl: "", needsApiKey: false, exampleModel: "gemini-3-pro-preview", authModes: ["plugin-oauth"], pluginName: "google-gemini-cli-auth", category: "cloud", oauthNote: "⚠️ 非官方集成，部分用户报告 Google 账号受限。建议使用非关键账号", groupId: "google", variantLabel: "Gemini CLI (OAuth)" },

  // ── China / Regional ──────────────────────────────────────────────────
  { id: "zai", label: "Z.AI (GLM)", api: "openai-completions", envKey: "ZAI_API_KEY", placeholder: "sk-...", baseUrl: "", needsApiKey: true, exampleModel: "glm-5", authModes: ["apiKey"], authChoice: "zai-api-key", category: "cloud" },
  { id: "moonshot", label: "Moonshot (Kimi)", api: "openai-completions", envKey: "MOONSHOT_API_KEY", placeholder: "sk-...", baseUrl: "https://api.moonshot.ai/v1", needsApiKey: true, exampleModel: "kimi-k2.5", authModes: ["apiKey"], authChoice: "moonshot-api-key", category: "cloud", groupId: "moonshot", variantLabel: "Moonshot API" },
  { id: "kimi-coding", label: "Kimi Coding", api: "anthropic-messages", envKey: "KIMI_API_KEY", placeholder: "sk-...", baseUrl: "", needsApiKey: true, exampleModel: "k2p5", authModes: ["apiKey"], authChoice: "kimi-code-api-key", category: "cloud", groupId: "moonshot", variantLabel: "Kimi Coding" },
  { id: "volcengine", label: "火山引擎 (Doubao)", api: "openai-completions", envKey: "VOLCANO_ENGINE_API_KEY", placeholder: "sk-...", baseUrl: "", needsApiKey: true, exampleModel: "doubao-seed-1-8-251228", authModes: ["apiKey"], authChoice: "volcengine-api-key", category: "cloud", groupId: "volcengine", variantLabel: "API Key" },
  { id: "volcengine-plan", label: "火山引擎 Coding Plan", api: "openai-completions", envKey: "VOLCANO_ENGINE_API_KEY", placeholder: "sk-...", baseUrl: "", needsApiKey: true, exampleModel: "ark-code-latest", authModes: ["apiKey"], category: "cloud", groupId: "volcengine", variantLabel: "Coding Plan" },
  { id: "byteplus", label: "BytePlus ARK", api: "openai-completions", envKey: "BYTEPLUS_API_KEY", placeholder: "sk-...", baseUrl: "", needsApiKey: true, exampleModel: "seed-1-8-251228", authModes: ["apiKey"], authChoice: "byteplus-api-key", category: "cloud", groupId: "byteplus", variantLabel: "API Key" },
  { id: "byteplus-plan", label: "BytePlus Coding Plan", api: "openai-completions", envKey: "BYTEPLUS_API_KEY", placeholder: "sk-...", baseUrl: "", needsApiKey: true, exampleModel: "ark-code-latest", authModes: ["apiKey"], category: "cloud", groupId: "byteplus", variantLabel: "Coding Plan" },
  { id: "qianfan", label: "百度千帆 (Qianfan)", api: "openai-completions", envKey: "QIANFAN_API_KEY", placeholder: "sk-...", baseUrl: "", needsApiKey: true, exampleModel: "ernie-4.5-turbo", authModes: ["apiKey"], category: "cloud" },
  { id: "xiaomi", label: "小米 (Xiaomi)", api: "openai-completions", envKey: "XIAOMI_API_KEY", placeholder: "sk-...", baseUrl: "", needsApiKey: true, exampleModel: "xiaomi-model", authModes: ["apiKey"], category: "cloud" },

  // ── Coding Plan (免费 OAuth) ─────────────────────────────────────────
  { id: "qwen-portal", label: "Qwen (Coding Plan)", api: "openai-completions", envKey: "", placeholder: "(OAuth 登录)", baseUrl: "", needsApiKey: false, exampleModel: "coder-model", authModes: ["plugin-oauth"], pluginName: "qwen-portal-auth", category: "cloud" },
  { id: "minimax-portal", label: "MiniMax (Coding Plan)", api: "anthropic-messages", envKey: "", placeholder: "(OAuth 登录)", baseUrl: "", needsApiKey: false, exampleModel: "MiniMax-M2.5", authModes: ["plugin-oauth"], pluginName: "minimax-portal-auth", category: "cloud", groupId: "minimax", variantLabel: "Coding Plan (OAuth)" },

  // ── Gateways / Proxies ────────────────────────────────────────────────
  { id: "vercel-ai-gateway", label: "Vercel AI Gateway", api: "openai-completions", envKey: "AI_GATEWAY_API_KEY", placeholder: "sk-...", baseUrl: "", needsApiKey: true, exampleModel: "anthropic/claude-opus-4.6", authModes: ["apiKey"], authChoice: "ai-gateway-api-key", category: "other" },
  { id: "cloudflare-ai-gateway", label: "Cloudflare AI Gateway", api: "openai-completions", envKey: "CF_AI_GATEWAY_API_KEY", placeholder: "sk-...", baseUrl: "", needsApiKey: true, exampleModel: "anthropic/claude-opus-4.6", authModes: ["apiKey"], category: "other" },

  // ── Local ──────────────────────────────────────────────────────────────
  { id: "ollama", label: "Ollama (Local)", api: "ollama", envKey: "", placeholder: "", baseUrl: "http://127.0.0.1:11434", needsApiKey: false, exampleModel: "llama3.3", authModes: ["none"], category: "local" },
  { id: "vllm", label: "vLLM (Local)", api: "openai-completions", envKey: "VLLM_API_KEY", placeholder: "vllm-local", baseUrl: "http://127.0.0.1:8000/v1", needsApiKey: false, exampleModel: "your-model-id", authModes: ["none"], category: "local" },

  // ── Custom-compatible ──────────────────────────────────────────────────
  { id: "litellm", label: "LiteLLM", api: "openai-completions", envKey: "LITELLM_API_KEY", placeholder: "sk-...", baseUrl: "http://localhost:4000", needsApiKey: true, exampleModel: "claude-opus-4-6", authModes: ["apiKey"], authChoice: "litellm-api-key", category: "other" },
  { id: "minimax", label: "MiniMax (API Key)", api: "anthropic-messages", envKey: "MINIMAX_API_KEY", placeholder: "sk-...", baseUrl: "https://api.minimax.io/anthropic", needsApiKey: true, exampleModel: "MiniMax-M2.5", authModes: ["apiKey"], category: "other", groupId: "minimax", variantLabel: "API Key" },
  { id: "synthetic", label: "Synthetic", api: "anthropic-messages", envKey: "SYNTHETIC_API_KEY", placeholder: "sk-...", baseUrl: "https://api.synthetic.new/anthropic", needsApiKey: true, exampleModel: "hf:MiniMaxAI/MiniMax-M2.5", authModes: ["apiKey"], authChoice: "synthetic-api-key", category: "other" },
];

// ── Helpers ───────────────────────────────────────────────────────────────

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
        result.push(group);
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

export const PROVIDER_GROUPS = buildProviderGroups();

/** Find the group a provider belongs to */
export function getProviderGroup(providerId: string): ProviderGroup | undefined {
  return PROVIDER_GROUPS.find((g) =>
    g.variants.some((v) => v.id === providerId),
  );
}

/** Static fallback for catalog when API is unavailable */
export const STATIC_PROVIDERS: CatalogProvider[] = PROVIDER_META.map((m) => ({
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

export const API_TYPES = [
  { id: "openai-completions", label: "OpenAI Completions" },
  { id: "anthropic-messages", label: "Anthropic Messages" },
  { id: "google-generative-ai", label: "Google Generative AI" },
  { id: "ollama", label: "Ollama (Native)" },
  { id: "bedrock-converse-stream", label: "AWS Bedrock Converse" },
  { id: "openai-responses", label: "OpenAI Responses" },
];