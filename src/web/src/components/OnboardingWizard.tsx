// OnboardingWizard — orchestrates 5-step setup using Tabs + zustand store
import { CheckCircle2 } from "lucide-react";

import { Tabs, TabsContent } from "./ui/tabs";
import { Card, CardContent } from "./ui/card";

import { StepModels } from "./onboarding/StepModels";
import { StepChannels } from "./onboarding/StepChannels";
import { StepSkills } from "./onboarding/StepSkills";
import { StepHooks } from "./onboarding/StepHooks";
import { StepLaunch } from "./onboarding/StepLaunch";

import { useOnboardingStore, STEPS, type StepId } from "../stores/onboarding";

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onComplete: () => void;
  onExit?: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function OnboardingWizard({ onComplete, onExit }: Props) {
  const step = useOnboardingStore((s) => s.step);
  const maxStepReached = useOnboardingStore((s) => s.maxStepReached);
  const goToStep = useOnboardingStore((s) => s.goToStep);
  const goNext = useOnboardingStore((s) => s.goNext);
  const goBack = useOnboardingStore((s) => s.goBack);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="h-full min-h-0 w-full max-w-4xl mx-auto flex flex-col p-6">
      {/* Header — 固定不滚动 */}
      <div className="shrink-0 mb-6">
        <h1 className="text-2xl font-bold tracking-tight">OpenClaw 配置向导</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          按步骤完成配置，启动你的 AI 助手。
        </p>
      </div>

      {/* Step indicators */}
      <div className="shrink-0 flex items-center gap-1 mb-5">
        {STEPS.map((s, i) => {
          const isCompleted = i < stepIndex;
          const isCurrent = s.id === step;
          const isFuture = i > maxStepReached;

          return (
            <button
              key={s.id}
              disabled={isFuture}
              onClick={() => !isFuture && goToStep(s.id)}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium
                transition-colors select-none
                ${isCurrent
                  ? "bg-muted text-foreground"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
                }
                ${isFuture ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              {isCompleted ? (
                <span className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                </span>
              ) : (
                <span
                  className={`
                    w-5 h-5 rounded-full flex items-center justify-center shrink-0
                    text-xs font-semibold
                    ${isCurrent
                      ? "bg-orange-500 text-white"
                      : "bg-muted-foreground/20 text-muted-foreground"
                    }
                  `}
                >
                  {s.num}
                </span>
              )}
              <span className={isCompleted ? "text-foreground" : ""}>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Step tabs — 内容区在此 flex 内滚动 */}
      <Tabs value={step} onValueChange={(v) => goToStep(v as StepId)} className="flex-1 min-h-0 flex flex-col">

        <Card className="flex-1 min-h-0 w-full min-w-0 flex flex-col overflow-hidden border border-border">
          <CardContent className="flex-1 flex flex-col p-0 min-h-0 min-w-0 w-full">
            <TabsContent value="models" className="mt-0 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
              <StepModels onNext={goNext} onExit={onExit} />
            </TabsContent>

            <TabsContent value="channels" className="mt-0 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
              <StepChannels onNext={goNext} onBack={goBack} />
            </TabsContent>

            <TabsContent value="skills" className="mt-0 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
              <StepSkills onNext={goNext} onBack={goBack} />
            </TabsContent>

            <TabsContent value="hooks" className="mt-0 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
              <StepHooks onNext={goNext} onBack={goBack} />
            </TabsContent>

            <TabsContent value="launch" className="mt-0 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
              <StepLaunch onBack={goBack} onComplete={onComplete} />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
