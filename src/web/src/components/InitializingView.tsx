import { useEffect, useState, useRef } from "react"
import { Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  runOnboard,
  gatewayInstall,
} from "@/lib/api"

interface InitializingViewProps {
  onComplete: () => void
}

interface InitStep {
  id: string
  label: string
  run: () => Promise<void>
}

const INIT_STEPS: InitStep[] = [
  {
    id: "config",
    label: "正在执行初始化配置",
    run: async () => {
      await runOnboard({
        auth_choice: "skip",
        install_daemon: true,
        skip_channels: true,
        skip_skills: true,
        skip_search: true,
        skip_health: true,
        skip_ui: true,
      })
    },
  },
  {
    id: "gateway",
    label: "正在注册 Gateway 服务",
    run: async () => {
      try {
        await gatewayInstall()
      } catch {
        // Gateway install failed — not fatal
      }
    },
  },
  {
    id: "state",
    label: "正在写入安装状态",
    run: async () => {
      // Small delay to make the step visible
      await new Promise((r) => setTimeout(r, 600))
    },
  },
]

export function InitializingView({ onComplete }: InitializingViewProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set())
  const [frozen, setFrozen] = useState(false)

  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    // Reset state every time this component mounts (fresh start)
    setCurrentStepIndex(0)
    setCompletedSteps(new Set())
    setFrozen(false)

    let cancelled = false

    const run = async () => {
      for (let i = 0; i < INIT_STEPS.length; i++) {
        if (cancelled) return
        setCurrentStepIndex(i)
        const step = INIT_STEPS[i]
        try {
          await step.run()
        } catch {
          // Continue even if a step fails
        }
        if (cancelled) return
        setCompletedSteps((prev) => new Set([...prev, step.id]))
      }
      if (cancelled) return
      // Freeze the UI in completed state — prevents any visual flicker on unmount
      setFrozen(true)
      // Let the user see the completed state briefly
      await new Promise((r) => setTimeout(r, 800))
      if (cancelled) return
      onCompleteRef.current()
    }

    run()

    return () => {
      cancelled = true
    }
  }, [])

  // Once frozen, allCompleted is permanently true — no flicker possible
  const allCompleted = frozen || currentStepIndex >= INIT_STEPS.length

  return (
    <div className="h-full w-full flex flex-col items-center justify-center min-h-screen p-8 bg-background page-transition">
      {/* Logo */}
      <div className="mb-8">
        <span className="text-6xl block">🦞</span>
      </div>

      {/* Title */}
      <h1 className="text-xl  text-foreground mb-2">
        {allCompleted ? "初始化完成" : "正在初始化"}
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        {allCompleted ? "即将进入配置向导" : "请稍候，正在准备环境..."}
      </p>

      {/* Steps */}
      <div className="w-full max-w-sm space-y-3">
        {INIT_STEPS.map((step, index) => {
          const isCompleted = completedSteps.has(step.id) || allCompleted
          const isCurrent = index === currentStepIndex && !allCompleted
          const isPending = !isCompleted && !isCurrent

          return (
            <div
              key={step.id}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300",
                isCompleted && "bg-emerald-500/10",
                isCurrent && "bg-card border border-border",
                isPending && "opacity-40"
              )}
            >
              {/* Status icon */}
              <div
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-full transition-all duration-300",
                  isCompleted && "bg-emerald-600 text-white",
                  isCurrent && "bg-primary/20",
                  isPending && "bg-muted"
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : isCurrent ? (
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  "text-sm transition-colors duration-300",
                  isCompleted && "text-emerald-400",
                  isCurrent && "text-foreground",
                  isPending && "text-muted-foreground"
                )}
              >
                {step.label}
                {isCurrent && (
                  <span className="inline-flex ml-1">
                    <span className="animate-pulse">.</span>
                    <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>.</span>
                    <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>.</span>
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {/* Progress indicator */}
      <div className="mt-10 flex items-center gap-2">
        {INIT_STEPS.map((step, index) => (
          <div
            key={step.id}
            className={cn(
              "h-1 rounded-full transition-all duration-500",
              index <= currentStepIndex ? "w-8 bg-primary" : "w-2 bg-muted"
            )}
          />
        ))}
      </div>
    </div>
  )
}
