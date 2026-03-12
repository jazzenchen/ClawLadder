// Zustand store for the Onboarding Wizard — replaces prop-drilling + keepMounted hack
import { create } from "zustand";

import type { ModelsConfig } from "../components/onboarding/StepModels";
import type {
  ChannelsConfig,
} from "../components/onboarding/StepChannels";
import { defaultChannelsConfig } from "../components/onboarding/StepChannels";
import type { SkillsStepState } from "../components/onboarding/StepSkills";
import { defaultSkillsStepState } from "../components/onboarding/StepSkills";
import type { HooksStepState } from "../components/onboarding/StepHooks";
import { defaultHooksStepState } from "../components/onboarding/StepHooks";

// ── Steps ───────────────────────────────────────────────────────────────────

export const STEPS = [
  { id: "models", label: "模型", num: "1" },
  { id: "channels", label: "通讯软件", num: "2" },
  { id: "skills", label: "Skills", num: "3" },
  { id: "hooks", label: "Hooks", num: "4" },
  { id: "launch", label: "启动", num: "5" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

// ── Store shape ─────────────────────────────────────────────────────────────

interface OnboardingState {
  // Navigation
  step: StepId;
  maxStepReached: number;

  // Step data
  modelsConfig: ModelsConfig;
  channelsConfig: ChannelsConfig;
  skillsState: SkillsStepState;
  hooksState: HooksStepState;

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

  // Reset (for re-entering wizard)
  reset: () => void;
}

const initialState = {
  step: "models" as StepId,
  maxStepReached: 0,
  modelsConfig: {
    providers: [],
    defaultProvider: "",
    defaultModel: "",
  } as ModelsConfig,
  channelsConfig: defaultChannelsConfig,
  skillsState: defaultSkillsStepState,
  hooksState: defaultHooksStepState,
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  ...initialState,

  // ── Navigation ──────────────────────────────────────────────────────────

  goToStep: (stepId) => {
    const idx = STEPS.findIndex((s) => s.id === stepId);
    if (idx >= 0) {
      set((s) => ({
        step: stepId,
        maxStepReached: Math.max(s.maxStepReached, idx),
      }));
    }
  },

  goNext: () => {
    const { step } = get();
    const idx = STEPS.findIndex((s) => s.id === step);
    const next = STEPS[idx + 1];
    if (next) get().goToStep(next.id);
  },

  goBack: () => {
    const { step } = get();
    const idx = STEPS.findIndex((s) => s.id === step);
    const prev = STEPS[idx - 1];
    if (prev) set({ step: prev.id });
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

  // ── Reset ───────────────────────────────────────────────────────────────

  reset: () => set(initialState),
}));
