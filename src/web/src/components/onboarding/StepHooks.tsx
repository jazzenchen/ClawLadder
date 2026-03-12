// Step 4: Hooks selection
import { useState, useEffect, useCallback } from "react";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { ScrollArea } from "../ui/scroll-area";

import {
  fetchHooks,
  enableHook,
  disableHook,
  type HooksResponse,
  type HookInfo,
} from "../../lib/api";

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onNext: () => void;
  onBack: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function StepHooks({ onNext, onBack }: Props) {
  const [data, setData] = useState<HooksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchHooks()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (hook: HookInfo) => {
    setToggling(hook.name);
    try {
      if (hook.disabled) {
        await enableHook(hook.name);
      } else {
        await disableHook(hook.name);
      }
      // Reload list
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setToggling(null);
    }
  };

  const hooks = data?.hooks ?? [];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 pb-4">
        <h2 className="text-lg font-semibold">Hooks</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Hooks 在特定事件触发时自动执行。你可以启用或禁用它们。
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {loading && (
          <Card className="border border-border shrink-0 mx-4">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              正在加载 Hooks…
            </CardContent>
          </Card>
        )}

        {error && !loading && (
          <Card className="border border-border shrink-0 mx-4">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              暂时无法加载 Hooks（OpenClaw CLI 未就绪），可直接跳过此步骤。
            </CardContent>
          </Card>
        )}

        {!loading && hooks.length === 0 && !error && (
          <Card className="border border-border shrink-0 mx-4">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              未检测到任何 Hooks
            </CardContent>
          </Card>
        )}

        {!loading && hooks.length > 0 && (
          <ScrollArea className="flex-1 min-h-0 overflow-hidden">
            <div>
              <div className="flex flex-col gap-4 pb-4 px-4">
                {hooks.map((hook) => (
                  <Card
                    key={hook.name}
                    className={`border border-border ${hook.disabled ? "opacity-60" : ""}`}
                  >
                    <CardHeader>
                      <div className="flex items-center gap-4">
                        <div className="min-w-0 flex-1 flex items-center gap-4">
                          {hook.emoji && (
                            <span className="text-base shrink-0">
                              {hook.emoji}
                            </span>
                          )}
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <CardTitle className="text-sm truncate">
                              {hook.name}
                            </CardTitle>
                            {hook.description && (
                              <p className="text-xs text-muted-foreground truncate">
                                {hook.description}
                              </p>
                            )}
                            {hook.events.length > 0 && (
                              <div className="flex gap-1 mt-1 overflow-hidden">
                                {hook.events.slice(0, 3).map((ev) => (
                                  <Badge
                                    key={ev}
                                    variant="outline"
                                    className="text-[10px] shrink-0 max-w-[120px] truncate"
                                  >
                                    {ev}
                                  </Badge>
                                ))}
                                {hook.events.length > 3 && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] shrink-0"
                                  >
                                    +{hook.events.length - 3}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <Switch
                            checked={!hook.disabled}
                            disabled={toggling === hook.name || !hook.eligible}
                            onCheckedChange={() => handleToggle(hook)}
                          />
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
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
