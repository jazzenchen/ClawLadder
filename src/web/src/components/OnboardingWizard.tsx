// OnboardingWizard — orchestrates 5-step setup using Tabs
import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Card, CardContent } from "./ui/card";

import { StepModels, type ModelsConfig } from "./onboarding/StepModels";
import { StepChannels, type ChannelsConfig, defaultChannelsConfig } from "./onboarding/StepChannels";
import { StepSkills } from "./onboarding/StepSkills";
import { StepHooks } from "./onboarding/StepHooks";
import { StepLaunch } from "./onboarding/StepLaunch";

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onComplete: () => void;
}

// ── Steps definition ───────────────────────────────────────────────────────

const STEPS = [
  { id: "models", label: "模型", num: "1" },
  { id: "channels", label: "通讯软件", num: "2" },
  { id: "skills", label: "Skills", num: "3" },
  { id: "hooks", label: "Hooks", num: "4" },
  { id: "launch", label: "启动", num: "5" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

// ── Component ──────────────────────────────────────────────────────────────

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState<StepId>("models");
  /** 用户已到达的最大步骤索引（0-based），到达过的步骤都可点击切换 */
  const [maxStepReached, setMaxStepReached] = useState(0);

  // ── Shared state ─────────────────────────────────────────────────────
  const [modelsConfig, setModelsConfig] = useState<ModelsConfig>({
    providers: [],
    defaultProvider: "",
    defaultModel: "",
  });

  const [channelsConfig, setChannelsConfig] = useState<ChannelsConfig>(defaultChannelsConfig);

  // ── Navigation helpers ───────────────────────────────────────────────
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const goToStep = (stepId: StepId) => {
    const idx = STEPS.findIndex((s) => s.id === stepId);
    if (idx >= 0) {
      setStep(stepId);
      setMaxStepReached((m) => Math.max(m, idx));
    }
  };

  const goNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next) goToStep(next.id);
  };

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev.id);
  };

  return (
    <div className="h-full min-h-0 w-full max-w-4xl mx-auto flex flex-col p-6">
      {/* Header — 固定不滚动 */}
      <div className="shrink-0 mb-6">
        <h1 className="text-xl font-bold">OpenClaw 配置向导</h1>
        <p className="text-sm text-muted-foreground mt-1">
          按步骤完成配置，启动你的 AI 助手。
        </p>
      </div>

      {/* Step tabs — 已到达的步骤均可点击切换；内容区在此 flex 内滚动 */}
      <Tabs value={step} onValueChange={(v) => goToStep(v as StepId)} className="flex-1 min-h-0 flex flex-col">
        <TabsList className="w-full justify-start mb-4 shrink-0">
          {STEPS.map((s, i) => (
            <TabsTrigger
              key={s.id}
              value={s.id}
              disabled={i > maxStepReached}
              className="text-xs gap-1"
            >
              <span className="font-mono text-[10px] bg-muted rounded-full w-4 h-4 inline-flex items-center justify-center">
                {s.num}
              </span>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <Card className="flex-1 min-h-0 w-full min-w-0 flex flex-col overflow-hidden border border-border">
          <CardContent className="flex-1 flex flex-col p-0 min-h-0 min-w-0 w-full">
            <TabsContent value="models" className="mt-0 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
              <StepModels
                value={modelsConfig}
                onChange={setModelsConfig}
                onNext={goNext}
              />
            </TabsContent>

            <TabsContent value="channels" className="mt-0 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
              <StepChannels
                value={channelsConfig}
                onChange={setChannelsConfig}
                onNext={goNext}
                onBack={goBack}
              />
            </TabsContent>

            <TabsContent value="skills" className="mt-0 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
              <StepSkills onNext={goNext} onBack={goBack} />
            </TabsContent>

            <TabsContent value="hooks" className="mt-0 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
              <StepHooks onNext={goNext} onBack={goBack} />
            </TabsContent>

            <TabsContent value="launch" className="mt-0 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
              <StepLaunch
                models={modelsConfig}
                channels={channelsConfig}
                onBack={goBack}
                onComplete={onComplete}
              />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
