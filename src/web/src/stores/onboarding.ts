// Zustand store for the Onboarding Wizard — replaces prop-drilling + keepMounted hack
import { create } from "zustand";

import type { ModelsConfig, ProviderEntry, AuthMode } from "../components/onboarding/StepModels";
import type {
  ChannelsConfig,
} from "../components/onboarding/StepChannels";
import { defaultChannelsConfig } from "../components/onboarding/StepChannels";
import type { SkillsStepState } from "../components/onboarding/StepSkills";
import { defaultSkillsStepState } from "../components/onboarding/StepSkills";
import type { HooksStepState } from "../components/onboarding/StepHooks";
import { defaultHooksStepState } from "../components/onboarding/StepHooks";
import { getProviderMeta } from "../components/onboarding/providerMeta";
import { fetchConfig } from "../lib/api";

// Re-export channel sub-types for convenience
export type { ChannelsConfig } from "../components/onboarding/StepChannels";

// ── Steps ───────────────────────────────────────────────────────────────────

export const STEPS = [
  { id: "models", label: "模型", num: "1" },
  { id: "channels", label: "通讯软件", num: "2" },
  { id: "skills", label: "Skills", num: "3" },
  { id: "hooks", label: "Hooks", num: "4" },
  { id: "launch", label: "唤醒龙虾", num: "5" },
  { id: "pairing", label: "IM 配对", num: "6" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

// ── Store shape ─────────────────────────────────────────────────────────────

interface OnboardingState {
  // Navigation
  stepIndex: number;
  maxStepReached: number;

  // Step data
  modelsConfig: ModelsConfig;
  channelsConfig: ChannelsConfig;
  skillsState: SkillsStepState;
  hooksState: HooksStepState;
  launchDone: boolean;
  configLoaded: boolean;

  /** Whether the user chose "国内源" during install — controls Telegram visibility */
  useChinaMirror: boolean;

  // Navigation actions
  goToStep: (stepId: StepId) => void;
  goNext: () => void;
  goBack: () => void;

  // Data actions
  setModelsConfig: (config: ModelsConfig) => void;
  setChannelsConfig: (config: ChannelsConfig) => void;
  setSkillsState: (state: SkillsStepState) => void;
  patchSkillsState: (partial: Partial<SkillsStepState>) => void;
  setHooksState: (state: HooksStepState) => void;
  patchHooksState: (partial: Partial<HooksStepState>) => void;
  setLaunchDone: (done: boolean) => void;
  setUseChinaMirror: (v: boolean) => void;

  // Reset (for re-entering wizard)
  reset: () => void;

  // Load existing config from openclaw.json and pre-fill the store
  loadFromConfig: () => Promise<void>;
}

const initialState = {
  stepIndex: 0,
  maxStepReached: 0,
  modelsConfig: {
    providers: [],
    defaultProvider: "",
    defaultModel: "",
  } as ModelsConfig,
  channelsConfig: defaultChannelsConfig,
  skillsState: defaultSkillsStepState,
  hooksState: defaultHooksStepState,
  launchDone: false,
  configLoaded: false,
  useChinaMirror: true,
};

/** Derive the StepId from the store's stepIndex */
export const selectStepId = (s: OnboardingState): StepId =>
  STEPS[s.stepIndex]?.id ?? "models";

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  ...initialState,

  // ── Navigation ──────────────────────────────────────────────────────────

  goToStep: (stepId) => {
    const idx = STEPS.findIndex((s) => s.id === stepId);
    if (idx >= 0) {
      set((s) => ({
        stepIndex: idx,
        maxStepReached: Math.max(s.maxStepReached, idx),
      }));
    }
  },

  goNext: () => {
    const { stepIndex } = get();
    if (stepIndex < STEPS.length - 1) {
      set((s) => ({
        stepIndex: stepIndex + 1,
        maxStepReached: Math.max(s.maxStepReached, stepIndex + 1),
      }));
    }
  },

  goBack: () => {
    const { stepIndex } = get();
    if (stepIndex > 0) set({ stepIndex: stepIndex - 1 });
  },

  // ── Data setters ────────────────────────────────────────────────────────

  setModelsConfig: (config) => set({ modelsConfig: config }),
  setChannelsConfig: (config) => set({ channelsConfig: config }),

  setSkillsState: (state) => set({ skillsState: state }),
  patchSkillsState: (partial) =>
    set((s) => ({ skillsState: { ...s.skillsState, ...partial } })),

  setHooksState: (state) => set({ hooksState: state }),
  patchHooksState: (partial) =>
    set((s) => ({ hooksState: { ...s.hooksState, ...partial } })),

  setLaunchDone: (done) => set({ launchDone: done }),
  setUseChinaMirror: (v) => set({ useChinaMirror: v }),

  // ── Reset ───────────────────────────────────────────────────────────────

  reset: () => set(initialState),

  // ── Load existing config from openclaw.json ────────────────────────────

  loadFromConfig: async () => {
    try {
      const raw = (await fetchConfig()) as Record<string, unknown> | null;
      if (!raw) { set({ configLoaded: true }); return; }

      // --- Models ---
      const modelsSection = (raw.models as Record<string, unknown>) ?? {};
      const providersObj = (modelsSection.providers as Record<string, unknown>) ?? {};
      const envObj = (raw.env as Record<string, string>) ?? {};
      const agents = (raw.agents as Record<string, unknown>) ?? {};
      const defaults = (agents.defaults as Record<string, unknown>) ?? {};
      const modelDefaults = (defaults.model as Record<string, unknown>) ?? {};
      const defaultPrimary = (modelDefaults.primary as string) ?? "";

      // Parse "provider/model" → provider id + model id
      const slashIdx = defaultPrimary.indexOf("/");
      const defaultProviderId = slashIdx > 0 ? defaultPrimary.slice(0, slashIdx) : "";
      const defaultModelId = slashIdx > 0 ? defaultPrimary.slice(slashIdx + 1) : "";

      const providers: ProviderEntry[] = [];
      for (const [key, val] of Object.entries(providersObj)) {
        if (!val || typeof val !== "object") continue;
        const entry = val as Record<string, unknown>;
        const meta = getProviderMeta(key);
        const models = Array.isArray(entry.models) ? entry.models as { id: string; name?: string }[] : [];
        const firstModel = models[0]?.id ?? "";

        // Detect auth mode
        let authMode: AuthMode = "apiKey";
        if (meta?.authModes?.length) authMode = meta.authModes[0] as AuthMode;

        // Try to find the API key: either in the entry or in env
        let apiKey = (entry.apiKey as string) ?? "";
        if (!apiKey && meta?.envKey && envObj[meta.envKey]) {
          apiKey = envObj[meta.envKey];
        }

        providers.push({
          id: key,
          label: meta?.label ?? key,
          enabled: true,
          apiKey,
          baseUrl: (entry.baseUrl as string) ?? meta?.baseUrl ?? "",
          api: (entry.api as string) ?? meta?.api ?? "openai-completions",
          selectedModel: key === defaultProviderId ? defaultModelId : firstModel,
          authMode,
          customKey: key.startsWith("custom-") ? key : undefined,
        });
      }

      // Also check env keys for builtin providers that have no explicit entry
      // (e.g. OPENROUTER_API_KEY set but no "openrouter" in providers)
      const KNOWN_ENV_PROVIDERS: Record<string, string> = {
        ANTHROPIC_API_KEY: "anthropic",
        OPENAI_API_KEY: "openai",
        OPENROUTER_API_KEY: "openrouter",
        GOOGLE_API_KEY: "google",
        GROQ_API_KEY: "groq",
        MISTRAL_API_KEY: "mistral",
        XAI_API_KEY: "xai",
      };
      for (const [envKey, providerId] of Object.entries(KNOWN_ENV_PROVIDERS)) {
        if (envObj[envKey] && !providers.some((p) => p.id === providerId)) {
          const meta = getProviderMeta(providerId);
          providers.push({
            id: providerId,
            label: meta?.label ?? providerId,
            enabled: true,
            apiKey: envObj[envKey],
            baseUrl: meta?.baseUrl ?? "",
            api: meta?.api ?? "openai-completions",
            selectedModel: providerId === defaultProviderId ? defaultModelId : meta?.exampleModel ?? "",
            authMode: (meta?.authModes?.[0] ?? "apiKey") as AuthMode,
          });
        }
      }

      const modelsConfig: ModelsConfig = {
        providers,
        defaultProvider: defaultProviderId || (providers[0]?.id ?? ""),
        defaultModel: defaultProviderId && defaultModelId ? `${defaultProviderId}/${defaultModelId}` : "",
      };

      // --- Channels ---
      const channelsRaw = (raw.channels as Record<string, unknown>) ?? {};
      const feishuRaw = (channelsRaw.feishu as Record<string, unknown>) ?? {};
      const telegramRaw = (channelsRaw.telegram as Record<string, unknown>) ?? {};
      // dingtalk-connector is the key used in openclaw.json
      const dingtalkRaw = (channelsRaw["dingtalk-connector"] as Record<string, unknown>) ?? {};
      const wecomRaw = (channelsRaw.wecom as Record<string, unknown>) ?? {};

      const channelsConfig: ChannelsConfig = {
        feishu: {
          enabled: !!feishuRaw.enabled,
          appId: (feishuRaw.appId as string) ?? "",
          appSecret: (feishuRaw.appSecret as string) ?? "",
          connectionMode: (feishuRaw.connectionMode as "websocket" | "webhook") ?? "websocket",
          domain: (feishuRaw.domain as "feishu" | "lark") ?? "feishu",
        },
        dingtalk: {
          enabled: !!dingtalkRaw.enabled,
          clientId: (dingtalkRaw.clientId as string) ?? "",
          clientSecret: (dingtalkRaw.clientSecret as string) ?? "",
        },
        wecom: {
          enabled: !!wecomRaw.enabled,
          botId: (wecomRaw.botId as string) ?? "",
          secret: (wecomRaw.secret as string) ?? "",
        },
        telegram: {
          enabled: !!telegramRaw.enabled,
          botToken: (telegramRaw.botToken as string) ?? "",
        },
      };

      set({ modelsConfig, channelsConfig, configLoaded: true });
    } catch {
      // Config read failed — just mark as loaded so wizard can proceed
      set({ configLoaded: true });
    }
  },
}));
