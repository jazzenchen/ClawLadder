import { useEffect, useState, useCallback } from "react";
import { Bot, Pencil, Trash2, Plus, Loader2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  fetchAgentsList,
  addAgent,
  deleteAgent,
  setAgentIdentity,
  type OpenClawAgent,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AgentListResponse {
  agents: OpenClawAgent[];
  defaultId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAge(ms: number | null): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

function truncPath(p: string, max = 36): string {
  if (p.length <= max) return p;
  return "…" + p.slice(-(max - 1));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentsDialog({ open, onOpenChange }: AgentsDialogProps) {
  const [agents, setAgents] = useState<OpenClawAgent[]>([]);
  const [defaultId, setDefaultId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newId, setNewId] = useState("");
  const [newWorkspace, setNewWorkspace] = useState("");
  const [adding, setAdding] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await fetchAgentsList()) as AgentListResponse;
      setAgents(data.agents ?? []);
      setDefaultId(data.defaultId ?? "");
    } catch (e: unknown) {
      console.error("[AgentsDialog] refresh failed:", e);
      setError("加载 Agent 列表失败，请检查服务是否正常运行");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      refresh();
      // reset transient state
      setShowAdd(false);
      setEditingId(null);
      setConfirmDelete(null);
    }
  }, [open, refresh]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  async function handleAdd() {
    if (!newId.trim()) return;
    setAdding(true);
    try {
      await addAgent(newId.trim(), newWorkspace.trim() || undefined);
      setNewId("");
      setNewWorkspace("");
      setShowAdd(false);
      await refresh();
    } catch (e: unknown) {
      console.error("[AgentsDialog] addAgent failed:", e);
      setError("添加 Agent 失败，请稍后重试");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await deleteAgent(id);
      setConfirmDelete(null);
      await refresh();
    } catch (e: unknown) {
      console.error("[AgentsDialog] deleteAgent failed:", e);
      setError("删除 Agent 失败，请稍后重试");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveIdentity(id: string) {
    setSaving(true);
    try {
      await setAgentIdentity(id, editName.trim() || undefined, editEmoji.trim() || undefined);
      setEditingId(null);
      await refresh();
    } catch (e: unknown) {
      console.error("[AgentsDialog] setAgentIdentity failed:", e);
      setError("保存身份信息失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-2xl max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-4 h-4" />
              Agent 管理
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground -mr-2 -mt-1"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <DialogDescription>
            Agent 是独立的 AI 助手实例，每个 Agent 有自己的工作目录和会话
          </DialogDescription>
        </DialogHeader>

        {/* Error banner */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
            {error}
            <button
              className="ml-2 underline"
              onClick={() => setError(null)}
            >
              关闭
            </button>
          </div>
        )}

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto space-y-2 px-1 custom-scrollbar">
          {loading && agents.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              加载中…
            </div>
          ) : agents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              暂无 Agent
            </p>
          ) : (
            agents.map((agent) => (
              <Card
                key={agent.id}
                className={cn(
                  "p-3 bg-card/50 border-border/30 space-y-1.5",
                  confirmDelete === agent.id && "border-destructive/50",
                )}
              >
                {/* Delete confirmation overlay */}
                {confirmDelete === agent.id ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-destructive">
                      确认删除 <span className="font-bold">{agent.id}</span>？此操作不可撤销。
                    </span>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-6 text-xs px-2"
                        disabled={deleting}
                        onClick={() => handleDelete(agent.id)}
                      >
                        {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "删除"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2"
                        onClick={() => setConfirmDelete(null)}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                ) : editingId === agent.id ? (
                  /* Inline edit */
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-[10px] text-muted-foreground">名称</Label>
                        <Input
                          className="h-7 text-xs mt-0.5"
                          placeholder="给 Agent 起个名字"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </div>
                      <div className="w-16">
                        <Label className="text-[10px] text-muted-foreground">Emoji</Label>
                        <Input
                          className="h-7 text-xs mt-0.5 text-center"
                          placeholder="🤖"
                          value={editEmoji}
                          onChange={(e) => setEditEmoji(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        className="h-6 text-xs px-2"
                        disabled={saving}
                        onClick={() => handleSaveIdentity(agent.id)}
                      >
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3 mr-1" />确认</>}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2"
                        onClick={() => setEditingId(null)}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Normal display */
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-bold text-foreground truncate">
                          {agent.id}
                        </span>
                        {agent.id === defaultId && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                            默认
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          title="编辑身份"
                          onClick={() => {
                            setEditingId(agent.id);
                            setEditName("");
                            setEditEmoji("");
                          }}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          title="删除"
                          onClick={() => setConfirmDelete(agent.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span
                        className="font-mono truncate max-w-[200px]"
                        title={agent.workspaceDir}
                      >
                        {truncPath(agent.workspaceDir)}
                      </span>
                      <span className="shrink-0">{agent.sessionsCount} 会话</span>
                      <span className="ml-auto shrink-0 tabular-nums">
                        {formatAge(agent.lastActiveAgeMs)}
                      </span>
                    </div>
                  </>
                )}
              </Card>
            ))
          )}
        </div>

        {/* Add agent form */}
        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col bg-transparent border-t-0">
          {showAdd ? (
            <Card className="p-3 bg-card/50 border-border/30 space-y-2">
              <div>
                <Label className="text-xs">
                  Agent ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  className="h-7 text-xs mt-1"
                  placeholder="例如: work、home、test"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
              </div>
              <div>
                <Label className="text-xs">工作目录</Label>
                <Input
                  className="h-7 text-xs mt-1 font-mono"
                  placeholder="留空使用默认目录"
                  value={newWorkspace}
                  onChange={(e) => setNewWorkspace(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Agent 的独立工作空间路径
                </p>
              </div>
              <div className="flex gap-1 justify-end">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={adding || !newId.trim()}
                  onClick={handleAdd}
                >
                  {adding ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  确认
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    setShowAdd(false);
                    setNewId("");
                    setNewWorkspace("");
                  }}
                >
                  取消
                </Button>
              </div>
            </Card>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              添加 Agent
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
