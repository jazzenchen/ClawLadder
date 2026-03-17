// Step 3: Skills — Bundle Skills + Recommended Skills (clawhub)
// Supports category-based selection and individual skill toggles
// Loads skill catalog from recommendedSkills.json
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2,
  ExternalLink,
  Package,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

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
import catalogData from "../../data/recommendedSkills.json";

// ── Types from JSON catalog ─────────────────────────────────────────────────

interface CatalogSkill {
  id: string;
  name: string;
  slug: string;
  author: string;
  description: string;
  url: string;
  downloads: number;
  stars: number;
  installs: number;
  security: string;
  recommended?: boolean;
  verifiedBy?: string[];
  setup?: "none" | "api-key" | "cli-install";
}

interface CatalogCategory {
  id: string;
  label: string;
  emoji: string;
  description: string;
  popular?: boolean;
  recommended?: boolean;
  skills: CatalogSkill[];
}

interface Catalog {
  categories: CatalogCategory[];
}

const catalog = catalogData as Catalog;

// Build a flat lookup: skillId → CatalogSkill + slug
const allCatalogSkills: CatalogSkill[] = catalog.categories.flatMap(
  (c) => c.skills,
);
const skillById = new Map(allCatalogSkills.map((s) => [s.id, s]));

// ── Persisted state (lifted to wizard) ──────────────────────────────────────

export interface SkillsStepState {
  clawhubInstalled: boolean;
  installClawhubChecked: boolean;
  selectedSkills: Set<string>;
  initialInstalledSkills: Set<string>;
  installedSkills: Set<string>;
  skillErrors: Record<string, string>;
}

export const defaultSkillsStepState: SkillsStepState = {
  clawhubInstalled: false,
  installClawhubChecked: true,
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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(),
  );
  const [bundleExpanded, setBundleExpanded] = useState(false);

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

        // Cross-match: detect community skills already installed
        // (via clawhub, manual cp, or any other method)
        const installedNames = new Set(
          list.filter((s) => s.eligible).map((s) => s.name.toLowerCase()),
        );
        const alreadyInstalled = new Set<string>();
        for (const cs of allCatalogSkills) {
          if (
            installedNames.has(cs.slug.toLowerCase()) ||
            installedNames.has(cs.name.toLowerCase()) ||
            installedNames.has(cs.id.toLowerCase())
          ) {
            alreadyInstalled.add(cs.id);
          }
        }
        if (alreadyInstalled.size > 0) {
          patch({
            installedSkills: alreadyInstalled,
            initialInstalledSkills: alreadyInstalled,
            selectedSkills: new Set([...selectedSkills, ...alreadyInstalled]),
          });
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Derived: selected count per category ──────────────────────────────

  const categorySelectionInfo = useMemo(() => {
    const info = new Map<
      string,
      { total: number; selected: number; allSelected: boolean }
    >();
    for (const cat of catalog.categories) {
      const total = cat.skills.length;
      const selected = cat.skills.filter((s) =>
        selectedSkills.has(s.id),
      ).length;
      info.set(cat.id, { total, selected, allSelected: selected === total });
    }
    return info;
  }, [selectedSkills]);

  // ── Toggles ───────────────────────────────────────────────────────────

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

  const handleCategoryToggle = (categoryId: string, checked: boolean) => {
    const cat = catalog.categories.find((c) => c.id === categoryId);
    if (!cat) return;
    const next = new Set(selectedSkills);
    for (const skill of cat.skills) {
      if (checked) next.add(skill.id);
      else next.delete(skill.id);
    }
    patch({ selectedSkills: next });
  };

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // ── Handle next: diff → uninstall → install ─────────────────────────

  const handleNext = async () => {
    const toUninstall = allCatalogSkills.filter(
      (s) => installedSkills.has(s.id) && !selectedSkills.has(s.id),
    );
    const toInstall = allCatalogSkills.filter(
      (s) => selectedSkills.has(s.id) && !installedSkills.has(s.id),
    );
    const needClawhub =
      installClawhubChecked && !clawhubInstalled && toInstall.length > 0;

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
        patch({
          installClawhubChecked: false,
          selectedSkills: new Set(),
          skillErrors: newErrors,
        });
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
            newSelected.delete(skill.id);
          }
        }
        patch({
          installedSkills: newInstalled,
          skillErrors: newErrors,
          selectedSkills: newSelected,
        });
      }
    }

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

  // ── Progress label ──────────────────────────────────────────────────

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

  const selectedCount = selectedSkills.size;

  // ── Render ──────────────────────────────────────────────────────────

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
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setBundleExpanded((v) => !v)}
            >
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">内置 Skills</span>
                {!loading && (
                  <Badge variant="secondary" className="text-xs">
                    {skills.length} 个可用
                  </Badge>
                )}
                {loading && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                )}
                <span className="ml-auto shrink-0 text-muted-foreground">
                  {bundleExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </span>
              </div>
            </CardHeader>
            {bundleExpanded && (
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
                    <Badge
                      key={skill.name}
                      variant="secondary"
                      className="text-xs"
                    >
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
            )}
          </Card>

          {/* ── Community Skills Section ──────────────────────────────── */}
          <div className="flex flex-col mt-4 gap-4">
            <div>
              <h2 className="text-lg font-semibold">社区优选 Skills</h2>
              <p className="text-sm text-muted-foreground mt-1">
                社区精选的高质量 Skills，按使用场景分类，勾选后自动从 ClawHub 安装。
                标有 🔑 的需要在 OpenClaw 设置中配置 API Key，标有 📦 的需要额外 CLI 工具（OpenClaw 会自动提示安装）。
                {selectedCount > 0 && (
                  <span className="text-primary ml-1">
                    已选 {selectedCount} 个
                  </span>
                )}
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
                      安装以下社区 Skills 必须先安装 ClawHub CLI（
                      <code className="bg-muted px-1 rounded text-[11px]">
                        npm i -g clawhub
                      </code>
                      ），取消勾选将跳过所有社区 Skills 安装
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


            {/* ── Category Accordion ───────────────────────────────────── */}
            <div className="flex flex-col gap-2">
              {catalog.categories.map((cat) => {
                const isExpanded = expandedCategories.has(cat.id);
                const info = categorySelectionInfo.get(cat.id)!;

                return (
                  <Card
                    key={cat.id}
                    className={`border ${
                      clawhubGateDisabled
                        ? "border-border opacity-50"
                        : info.selected > 0
                          ? "border-primary/30"
                          : "border-border"
                    }`}
                  >
                    <CardHeader className="cursor-pointer select-none">
                      <div className="flex items-center gap-3">
                        {/* Category-level checkbox */}
                        <Checkbox
                          checked={info.allSelected}
                          disabled={clawhubGateDisabled}
                          onCheckedChange={(checked) =>
                            handleCategoryToggle(cat.id, checked === true)
                          }
                          className="shrink-0"
                          {...(info.selected > 0 && !info.allSelected
                            ? { "data-state": "indeterminate" as const }
                            : {})}
                        />

                        {/* Clickable header area */}
                        <div
                          className="flex-1 flex items-center gap-2 min-w-0"
                          onClick={() => toggleCategory(cat.id)}
                        >
                          <span className="text-base">{cat.emoji}</span>
                          <span className="text-sm font-medium">
                            {cat.label}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5"
                          >
                            {info.selected}/{info.total}
                          </Badge>
                          {cat.popular && (
                            <Badge
                              variant="default"
                              className="text-[10px] px-1.5 bg-orange-500/10 text-orange-600 border-orange-500/20"
                            >
                              热门
                            </Badge>
                          )}
                          {cat.recommended && (
                            <Badge
                              variant="default"
                              className="text-[10px] px-1.5 bg-green-500/10 text-green-600 border-green-500/20"
                            >
                              推荐
                            </Badge>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleCategory(cat.id)}
                          className="shrink-0 text-muted-foreground"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {/* Category description (always visible) */}
                      <p
                        className="text-xs text-muted-foreground mt-1 ml-9"
                        onClick={() => toggleCategory(cat.id)}
                      >
                        {cat.description}
                      </p>
                    </CardHeader>

                    {/* Expanded skill list */}
                    {isExpanded && (
                      <CardContent>
                        <div className="flex flex-col gap-1 ml-9">
                          {cat.skills.map((skill) => {
                            const isSelected = selectedSkills.has(skill.id);
                            const isInstalled = installedSkills.has(skill.id);
                            const hasError = skillErrors[skill.id];

                            return (
                              <div
                                key={skill.id}
                                className={`flex items-start p-2 gap-3 rounded-md transition-colors ${
                                  isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                                }`}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  disabled={clawhubGateDisabled}
                                  onCheckedChange={(checked) =>
                                    handleSkillToggle(
                                      skill.id,
                                      checked === true,
                                    )
                                  }
                                  className="shrink-0 mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">
                                      {skill.name}
                                    </span>
                                    {isInstalled && (
                                      <Badge
                                        variant="secondary"
                                        className="text-[10px]"
                                      >
                                        ✓ 已安装
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {skill.description}
                                  </p>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[10px] text-muted-foreground">
                                      ⬇️ {skill.downloads >= 1000 ? `${(skill.downloads / 1000).toFixed(1)}k` : skill.downloads}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      ⭐ {skill.stars}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      by @{skill.author}
                                    </span>
                                    {skill.security === "benign" && (
                                      <span
                                        className="text-[10px] text-green-600"
                                      >
                                        ✓ 安全
                                      </span>
                                    )}
                                    {skill.security?.startsWith("suspicious") && (
                                      <span
                                        className="text-[10px] text-yellow-600"
                                      >
                                        ⚠ 需审查
                                      </span>
                                    )}
                                    {skill.setup === "api-key" && (
                                      <span
                                        className="text-[10px] text-blue-500"
                                        title="安装后需在 OpenClaw 设置中配置 API Key"
                                      >
                                        🔑 需配置
                                      </span>
                                    )}
                                    {skill.setup === "cli-install" && (
                                      <span
                                        className="text-[10px] text-blue-500"
                                        title="需要额外 CLI 工具，OpenClaw 会自动提示安装"
                                      >
                                        📦 需依赖
                                      </span>
                                    )}
                                  </div>
                                  {hasError && (
                                    <p className="text-xs text-destructive mt-1 break-all">
                                      {hasError}
                                    </p>
                                  )}
                                </div>
                                <a
                                  href={skill.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
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
