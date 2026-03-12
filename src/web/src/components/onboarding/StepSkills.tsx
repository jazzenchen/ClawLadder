// Step 3: Skills selection
import { useState, useEffect, useCallback } from "react";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { ScrollArea } from "../ui/scroll-area";

import { fetchSkills, type SkillsResponse } from "../../lib/api";

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onNext: () => void;
  onBack: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function StepSkills({ onNext, onBack }: Props) {
  const [data, setData] = useState<SkillsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetchSkills()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const eligible = data?.eligible ?? [];
  const disabled = data?.disabled ?? [];
  const missingRequirements = data?.missingRequirements ?? [];
  const hasAnySkills =
    eligible.length > 0 ||
    disabled.length > 0 ||
    missingRequirements.length > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 pb-4">
        <h2 className="text-lg font-semibold">Skills</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Skills 是 OpenClaw 的能力扩展。系统会自动检测可用的
          Skills，暂时无需手动配置。
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {loading && (
          <Card className="border border-border shrink-0 mx-4">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              正在检测可用 Skills…
            </CardContent>
          </Card>
        )}

        {error && !loading && (
          <Card className="border border-border shrink-0 mx-4">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              暂时无法检测 Skills（OpenClaw CLI 未就绪），可直接跳过此步骤。
            </CardContent>
          </Card>
        )}

        {!loading && !error && !hasAnySkills && (
          <Card className="border border-border shrink-0 mx-4">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              未检测到任何 Skills
            </CardContent>
          </Card>
        )}

        {!loading && hasAnySkills && (
          <ScrollArea className="flex-1 min-h-0 overflow-hidden">
            <div>
              <div className="flex flex-col gap-4 pb-4 px-4">
                {/* Summary */}
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary">
                    可用: {data?.summary?.eligible ?? eligible.length}
                  </Badge>
                  {(data?.summary?.blocked ?? 0) > 0 && (
                    <Badge variant="outline">
                      不可用: {data?.summary?.blocked}
                    </Badge>
                  )}
                  {(data?.summary?.missingRequirements ??
                    missingRequirements.length) > 0 && (
                    <Badge variant="outline">
                      缺少依赖:{" "}
                      {data?.summary?.missingRequirements ??
                        missingRequirements.length}
                    </Badge>
                  )}
                </div>

                {/* Eligible skills */}
                {eligible.map((name) => (
                  <Card key={name} className="border border-border">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <Checkbox checked disabled className="shrink-0" />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <CardTitle className="text-sm truncate">
                            {name}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground truncate">
                            已就绪，自动启用
                          </p>
                        </div>
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          ✓ 可用
                        </Badge>
                      </div>
                    </CardHeader>
                  </Card>
                ))}

                {/* Disabled skills */}
                {disabled.map((name) => (
                  <Card key={name} className="border border-border opacity-60">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={false}
                          disabled
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <CardTitle className="text-sm truncate">
                            {name}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground truncate">
                            已禁用
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-xs">
                          已禁用
                        </Badge>
                      </div>
                    </CardHeader>
                  </Card>
                ))}

                {/* Missing requirements */}
                {missingRequirements.map((item) => {
                  const missing = item.missing;
                  const parts: string[] = Array.isArray(missing)
                    ? missing
                    : [
                        ...(missing?.bins ?? []),
                        ...(missing?.config ?? []),
                        ...(missing?.env ?? []),
                      ].filter(Boolean);
                  return (
                    <Card
                      key={item.name}
                      className="border border-border opacity-60"
                    >
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={false}
                            disabled
                            className="shrink-0"
                          />
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <CardTitle className="text-sm truncate">
                              {item.name}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground truncate">
                              缺少: {parts.length ? parts.join(", ") : "—"}
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-xs">
                            缺少依赖
                          </Badge>
                        </div>
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        )}
      </div>

      <div className="shrink-0 flex justify-between pt-4 px-4 border-t border-border">
        <Button variant="outline" onClick={onBack}>
          ← 上一步
        </Button>
        <Button onClick={onNext}>下一步 →</Button>
      </div>
    </div>
  );
}
