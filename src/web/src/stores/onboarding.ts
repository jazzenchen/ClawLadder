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
  stepIndex: number;
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

  // ── Reset ───────────────────────────────────────────────────────────────

  reset: () => set(initialState),
}));
