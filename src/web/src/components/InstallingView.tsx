import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

// --- Install log types ---

export interface InstallLog {
  id: number
  type: "info" | "success" | "error" | "warning"
  message: string
}

// --- Step definitions for nvm install path ---

interface StepDef {
  /** Regex to match against PTY output line */
  match: RegExp
  /** Log message to display */
  message: string
  /** Log type */
  type: InstallLog["type"]
  /** Progress percentage when this step is reached */
  progress: number
}

const NVM_STEPS: StepDef[] = [
  { match: /==> 安装 Xcode Command Line Tools/, message: "安装 Xcode Command Line Tools...", type: "info", progress: 1 },
  { match: /==> 找到:.*Command Line/, message: "找到 Xcode CLT 安装包", type: "info", progress: 2 },
  { match: /==> 正在安装/, message: "正在安装 Xcode CLT（约 5-10 分钟）...", type: "info", progress: 2 },
  { match: /==> Xcode Command Line Tools 安装完成/, message: "Xcode CLT 安装完成", type: "success", progress: 3 },
  { match: /==> Xcode CLT 已安装/, message: "Xcode CLT 已安装", type: "success", progress: 3 },
  { match: /==> git 已可用/, message: "git 已可用", type: "success", progress: 4 },
  { match: /==> 检查 Node\.js/, message: "检查 Node.js ...", type: "info", progress: 5 },
  { match: /==> 检测到 Node\.js v.+跳过安装/, message: "已有合适版本的 Node.js，跳过安装", type: "success", progress: 40 },
  { match: /==> 检测到 Node\.js v.+版本过低/, message: "Node.js 版本过低，需要重新安装", type: "warning", progress: 5 },
  { match: /==> 需要安装 Node\.js/, message: "需要安装 Node.js ...", type: "info", progress: 8 },
  { match: /==> 查询最新 LTS 版本/, message: "查询最新 LTS 版本...", type: "info", progress: 10 },
  { match: /==> 最新 LTS:/, message: "已获取 LTS 版本号", type: "success", progress: 15 },
  { match: /==> 下载 node-/, message: "正在下载 Node.js ...", type: "info", progress: 20 },
  { match: /==> 解压到/, message: "正在解压 Node.js ...", type: "info", progress: 35 },
  { match: /==> Node v.+安装完成/, message: "Node.js 安装完成", type: "success", progress: 40 },
  { match: /==> Node version:/, message: "Node.js 版本确认", type: "success", progress: 45 },
  { match: /==> npm version:/, message: "npm 版本确认", type: "success", progress: 50 },
  { match: /==> 设置 npm 国内镜像/, message: "设置 npm 国内镜像...", type: "info", progress: 55 },
  { match: /==> Installing OpenClaw via npm/, message: "通过 npm 安装 OpenClaw ...", type: "info", progress: 60 },
  { match: /==> Verifying installation/, message: "验证安装...", type: "info", progress: 85 },
  { match: /openclaw\/\d+\.\d+/, message: "OpenClaw 安装验证通过", type: "success", progress: 95 },
  { match: /==> Done!/, message: "安装完成！", type: "success", progress: 100 },
]

// --- Hook: parse PTY output into structured logs ---

export function useInstallLogs() {
  const [logs, setLogs] = useState<InstallLog[]>([])
  const [progress, setProgress] = useState(0)
  const idRef = useRef(0)
  const matchedRef = useRef<Set<number>>(new Set())

  const handleOutput = useCallback((text: string) => {
    // Split by newlines and process each line
    const lines = text.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.replace(/\x1b\[[0-9;]*m/g, "").trim() // strip ANSI
      if (!trimmed) continue

      for (let i = 0; i < NVM_STEPS.length; i++) {
        const step = NVM_STEPS[i]
        if (matchedRef.current.has(i)) continue
        if (step.match.test(trimmed)) {
          matchedRef.current.add(i)
          const id = ++idRef.current
          setLogs((prev) => [...prev, { id, type: step.type, message: step.message }])
          setProgress(step.progress)
          break
        }
      }
    }
  }, [])

  const reset = useCallback(() => {
    setLogs([])
    setProgress(0)
    idRef.current = 0
    matchedRef.current.clear()
  }, [])

  return { logs, progress, handleOutput, reset }
}

// --- Component ---

const logIcons = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
}

const logColors = {
  info: "text-blue-400",
  success: "text-emerald-400",
  error: "text-red-400",
  warning: "text-amber-400",
}

interface InstallingViewProps {
  progress: number
  logs: InstallLog[]
  onCancel: () => void
}

export function InstallingView({ progress, logs, onCancel }: InstallingViewProps) {
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🦞</span>
          <div>
            <h1 className="text-sm font-medium text-foreground">
              正在安装 OpenClaw...
            </h1>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4 mr-1" />
          取消
        </Button>
      </header>

      {/* Progress bar */}
      <div className="px-6 py-3 bg-secondary/20">
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Terminal-like logs */}
      <div className="flex-1 overflow-auto bg-background custom-scrollbar">
        <div className="p-6 font-mono text-sm space-y-2">
          {logs.map((log) => {
            const Icon = logIcons[log.type]
            return (
              <div
                key={log.id}
                className={cn(
                  "flex items-start gap-3 py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300",
                  logColors[log.type]
                )}
              >
                <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="text-foreground/90">{log.message}</span>
              </div>
            )
          })}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* Current step indicator */}
      <div className="px-6 py-4 border-t border-border/50 bg-card">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm text-muted-foreground">
            {logs.length > 0 ? logs[logs.length - 1].message : "准备安装..."}
          </span>
        </div>
      </div>
    </div>
  )
}
