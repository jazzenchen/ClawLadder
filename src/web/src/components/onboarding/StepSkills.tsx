// Step 3: Skills — Bundle Skills + Recommended Skills (clawhub)
// Diff-based: user toggles are local, install/uninstall happens on "下一步"
import { useState, useEffect, useCallback } from "react";
import { Loader2, ExternalLink, Package } from "lucide-react";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { ScrollArea } from "../ui/scroll-area";

import {
  fetchSkills,
  fetchClawHubStatus,
  installClawHub,
  installClawHubSkill,
  uninstallClawHubSkill,
  type SkillInfo,
} from "../../lib/api";

import { useOnboardingStore } from "../../stores/onboarding";

// ── Recommended skills from ClawHub ─────────────────────────────────────────

interface RecommendedSkill {
  id: string;
  name: string;
  description: string;
  url: string;
  slug: string;
  emoji: string;
}

const RECOMMENDED_SKILLS: RecommendedSkill[] = [
  {
    id: "skill-vetter",
    name: "Skill Vetter",
    description: "自动审查和验证 Skills 的安全性与兼容性",
    url: "https://clawhub.ai/spclaudehome/skill-vetter",
    slug: "skill-vetter",
    emoji: "🔍",
  },
];

// ── Persisted state (lifted to wizard) ──────────────────────────────────────

export interface SkillsStepState {
  clawhubInstalled: boolean;
  installClawhubChecked: boolean;
  /** What the user currently has selected in the UI */
  selectedSkills: Set<string>;
  /** Snapshot of what was actually installed when the step first loaded */
  initialInstalledSkills: Set<string>;
  /** What is currently installed (updated after install/uninstall) */
  installedSkills: Set<string>;
  skillErrors: Record<string, string>;
}

export const defaultSkillsStepState: SkillsStepState = {
  clawhubInstalled: false,
  installClawhubChecked: false,
  selectedSkills: new Set(),
  initialInstalledSkills: new Set(),
  installedSkills: new Set(),
  skillErrors: {},
};

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onNext: () => void;
  onBack: () => void;
}

// ── Progress state ─────────────────────────────────────────────────────────

interface Progress {
  phase: "idle" | "uninstall" | "install-clawhub" | "install";
  current: number;
  total: number;
}

const IDLE_PROGRESS: Progress = { phase: "idle", current: 0, total: 0 };

// ── Component ──────────────────────────────────────────────────────────────

export function StepSkills({ onNext, onBack }: Props) {
  const state = useOnboardingStore((s) => s.skillsState);
  const patch = useOnboardingStore((s) => s.patchSkillsState);
  // Bundle skills (local, re-fetched each mount)
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Transient UI state
  const [clawhubChecking, setClawhubChecking] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<Progress>(IDLE_PROGRESS);

  // Destructure persisted state
  const {
    clawhubInstalled,
    installClawhubChecked,
    selectedSkills,
    initialInstalledSkills,
    installedSkills,
    skillErrors,
  } = state;

  // ── Load bundle skills ──────────────────────────────────────────────────

  const loadSkills = useCallback(() => {
    setLoading(true);
    fetchSkills()
      .then((res) => {
        const list = res.skills ?? [];
        setSkills(list.filter((s) => s.eligible));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // ── Check clawhub + snapshot initial installed skills ───────────────────

  const checkClawhub = useCallback(() => {
    setClawhubChecking(true);
    fetchClawHubStatus()
      .then((status) => {
        if (status.installed) {
          patch({ clawhubInstalled: true, installClawhubChecked: true });
        }
      })
      .catch(() => {})
      .finally(() => setClawhubChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSkills();
    checkClawhub();
  }, [loadSkills, checkClawhub]);

  // ── Toggles (local only, no API calls) ──────────────────────────────────

  const handleClawhubToggle = (checked: boolean) => {
    if (!checked) {
      patch({ installClawhubChecked: false, selectedSkills: new Set() });
    } else {
      patch({ installClawhubChecked: true });
    }
  };

  const handleSkillToggle = (skillId: string, checked: boolean) => {
    const next = new Set(selectedSkills);
    if (checked) next.add(skillId);
    else next.delete(skillId);
    patch({ selectedSkills: next });
  };

  // ── Handle next: diff → uninstall → install ─────────────────────────────

  const handleNext = async () => {
    // Compute diff
    const toUninstall = RECOMMENDED_SKILLS.filter(
      (s) => installedSkills.has(s.id) && !selectedSkills.has(s.id),
    );
    const toInstall = RECOMMENDED_SKILLS.filter(
      (s) => selectedSkills.has(s.id) && !installedSkills.has(s.id),
    );
    const needClawhub =
      installClawhubChecked && !clawhubInstalled && toInstall.length > 0;

    // No changes → skip
    if (toUninstall.length === 0 && toInstall.length === 0 && !needClawhub) {
      onNext();
      return;
    }

    setProcessing(true);
    const totalSteps =
      toUninstall.length + (needClawhub ? 1 : 0) + toInstall.length;
    let current = 0;
    let hasError = false;
    const newInstalled = new Set(installedSkills);
    const newErrors = { ...skillErrors };

    // Phase 1: Uninstall
    if (toUninstall.length > 0) {
      for (const skill of toUninstall) {
        current++;
        setProgress({ phase: "uninstall", current, total: totalSteps });
        try {
          await uninstallClawHubSkill(skill.slug);
          newInstalled.delete(skill.id);
          delete newErrors[skill.id];
        } catch (e) {
          const msg = e instanceof Error ? e.message : "卸载失败";
          if (/not found|not installed/i.test(msg)) {
            newInstalled.delete(skill.id);
            delete newErrors[skill.id];
          } else {
            hasError = true;
            newErrors[skill.id] = msg;
          }
        }
        patch({ installedSkills: newInstalled, skillErrors: newErrors });
      }
    }

    // Phase 2: Install ClawHub CLI if needed
    if (needClawhub && !hasError) {
      current++;
      setProgress({ phase: "install-clawhub", current, total: totalSteps });
      try {
        await installClawHub();
        patch({ clawhubInstalled: true });
      } catch (e) {
        hasError = true;
        newErrors.__clawhub__ =
          e instanceof Error ? e.message : "安装 ClawHub 失败";
        // Uncheck ClawHub and all skills on failure
        patch({ installClawhubChecked: false, selectedSkills: new Set(), skillErrors: newErrors });
      }
    }

    // Phase 3: Install skills
    const newSelected = new Set(selectedSkills);
    if (toInstall.length > 0 && !hasError) {
      for (const skill of toInstall) {
        current++;
        setProgress({ phase: "install", current, total: totalSteps });
        try {
          await installClawHubSkill(skill.slug);
          newInstalled.add(skill.id);
          delete newErrors[skill.id];
        } catch (e) {
          const msg = e instanceof Error ? e.message : "安装失败";
          if (/already installed/i.test(msg)) {
            newInstalled.add(skill.id);
            delete newErrors[skill.id];
          } else {
            hasError = true;
            newErrors[skill.id] = msg;
            // Uncheck the skill on install failure
            newSelected.delete(skill.id);
          }
        }
        patch({ installedSkills: newInstalled, skillErrors: newErrors, selectedSkills: newSelected });
      }
    }

    // Update initial snapshot to reflect new reality
    patch({
      installedSkills: newInstalled,
      initialInstalledSkills: new Set(newInstalled),
      skillErrors: newErrors,
    });

    setProgress(IDLE_PROGRESS);
    setProcessing(false);
    if (!hasError) onNext();
  };

  const clawhubGateDisabled = !installClawhubChecked || processing;

  // ── Progress label ──────────────────────────────────────────────────────

  const progressLabel = (() => {
    if (!processing) return null;
    const { phase, current, total } = progress;
    switch (phase) {
      case "uninstall":
        return `卸载 ${current}/${total}`;
      case "install-clawhub":
        return `安装 ClawHub ${current}/${total}`;
      case "install":
        return `安装 ${current}/${total}`;
      default:
        return null;
    }
  })();

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 pb-4">
        <h2 className="text-lg font-semibold">Skills</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Skills 是 OpenClaw 的能力扩展。查看已就绪的内置
          Skills，并选择安装推荐的社区 Skills。
        </p>
      </div>

      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-col gap-6 pb-4 px-4">
          {/* ── Bundle Skills ─────────────────────────────────────────── */}
          <Card className="border border-border">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">内置 Skills</span>
                {!loading && (
                  <Badge variant="secondary" className="text-xs">
                    {skills.length} 个可用
                  </Badge>
                )}
                {loading && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                )}
              </div>
            </CardHeader>

            <CardContent className="pt-0 pb-3">
              {error && (
                <p className="text-xs text-muted-foreground py-2">
                  暂时无法检测 Skills（OpenClaw CLI 未就绪），可直接跳过。
                </p>
              )}

              {!loading && !error && skills.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  未检测到可用的内置 Skills
                </p>
              )}

              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((skill) => (
                    <Badge key={skill.name} variant="secondary" className="text-xs">
                      {skill.name}
                    </Badge>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground mt-3">
                内置 Skills 由系统自动检测。安装完成后可在{" "}
                <span className="text-foreground">
                  OpenClaw Dashboard → Skills
                </span>{" "}
                页面管理。
              </p>
            </CardContent>
          </Card>

          {/* ── Recommended Skills (clawhub) ───────────────────────────── */}
          <div className="flex flex-col mt-4 gap-4">
            <div>
              <h2 className="text-lg font-semibold">推荐社区 Skills</h2>
              <p className="text-sm text-muted-foreground mt-1">
                从 ClawHub 安装社区贡献的 Skills，扩展 OpenClaw 的能力。
              </p>
            </div>

            {/* ClawHub prerequisite */}
            <Card
              className={`border ${installClawhubChecked ? "border-primary/50" : "border-border"}`}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={installClawhubChecked}
                    disabled={clawhubChecking || processing}
                    onCheckedChange={(checked) =>
                      handleClawhubToggle(checked === true)
                    }
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm flex items-center gap-2">
                      安装 ClawHub CLI
                      {clawhubInstalled && (
                        <Badge variant="secondary" className="text-[10px]">
                          已安装
                        </Badge>
                      )}
                      {clawhubChecking && (
                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                      )}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      安装社区 Skills 需要 ClawHub CLI（
                      <code className="bg-muted px-1 rounded text-[11px]">
                        npm i -g clawhub
                      </code>
                      ）
                    </p>
                  </div>
                </div>
                {skillErrors.__clawhub__ && (
                  <p className="text-xs text-destructive mt-2 break-all">
                    {skillErrors.__clawhub__}
                  </p>
                )}
              </CardHeader>
            </Card>

            {/* Recommended skill cards */}
            {RECOMMENDED_SKILLS.map((skill) => {
              const isSelected = selectedSkills.has(skill.id);
              const isInstalled = installedSkills.has(skill.id);
              const hasError = skillErrors[skill.id];

              return (
                <Card
                  key={skill.id}
                  className={`border ${
                    clawhubGateDisabled
                      ? "border-border opacity-50"
                      : isSelected
                        ? "border-primary/50"
                        : "border-border"
                  }`}
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={isSelected}
                        disabled={clawhubGateDisabled}
                        onCheckedChange={(checked) =>
                          handleSkillToggle(skill.id, checked === true)
                        }
                        className="shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-sm flex items-center gap-2">
                          {skill.name}
                          {isInstalled && (
                            <Badge variant="secondary" className="text-[10px]">
                              ✓ 已安装
                            </Badge>
                          )}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {skill.description}
                        </p>
                      </div>
                      <a
                        href={skill.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    {hasError && (
                      <p className="text-xs text-destructive mt-2 break-all">
                        {hasError}
                      </p>
                    )}
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </ScrollArea>

      <div className="shrink-0 flex justify-between items-center pt-4 px-4 border-t border-border">
        <Button variant="outline" onClick={onBack} disabled={processing}>
          ← 上一步
        </Button>
        <div className="flex items-center gap-3">
          {progressLabel && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              {progressLabel}
            </span>
          )}
          <Button onClick={handleNext} disabled={processing}>
            下一步 →
          </Button>
        </div>
      </div>
    </div>
  );
}
