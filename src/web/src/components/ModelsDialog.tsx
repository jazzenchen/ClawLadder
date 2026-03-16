// ModelsDialog — shows user-registered model providers from config
// Allows: view, add, set default, remove
// Refactored: all sub-components live in ./models/
import { useState, useEffect } from "react";
import { Loader2, Cpu, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { UserProviderCard, BuiltinProviderCard } from "./models/ProviderCard";
import { ProviderForm } from "./models/ProviderForm";
import type { ProviderFormPayload } from "./models/ProviderForm";
import { useProviderMutation, deriveBuiltinProviders } from "./models/useProviderMutation";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ModelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultModel?: string;
  onRefresh?: () => void;
}

// ---------------------------------------------------------------------------
// Main Dialog
// ---------------------------------------------------------------------------

export function ModelsDialog({ open, onOpenChange, defaultModel, onRefresh }: ModelsDialogProps) {
  const {
    userModels, catalog, loading, error, saving, settingDefault,
    load, handleSetDefault, handleRemove, handleRemoveBuiltin, handleSave, setError,
  } = useProviderMutation(onRefresh);

  const [adding, setAdding] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingBuiltinKey, setEditingBuiltinKey] = useState<string | null>(null);

  useEffect(() => { if (open) load(); }, [open, load]);

  const defaultPrimary = userModels?.defaultPrimary ?? "";
  const defaultProviderKey = defaultPrimary.split("/")[0];
  const builtinProviders = deriveBuiltinProviders(userModels);
  const providerCount = (userModels?.providers.length ?? 0) + builtinProviders.length;

  // Wrap handleSave to close forms on success
  const onAddSave = async (payload: ProviderFormPayload) => {
    await handleSave(payload);
    setAdding(false);
  };
  const onEditSave = async (payload: ProviderFormPayload) => {
    await handleSave(payload);
    setEditingKey(null);
  };
  const onEditBuiltinSave = async (payload: ProviderFormPayload) => {
    await handleSave(payload);
    setEditingBuiltinKey(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-2xl max-w-4xl max-h-[85vh] flex flex-col" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            模型管理
          </DialogTitle>
          <DialogDescription>
            {loading ? "加载中…" : `${providerCount} 个已注册的模型接口`}
            {defaultPrimary && (
              <span className="ml-2 font-mono text-[11px] opacity-70">
                默认: {defaultPrimary}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 px-1">
            <div className="space-y-3">
              {/* Explicit providers */}
              {userModels?.providers.map((p) =>
                editingKey === p.key ? (
                  <ProviderForm
                    key={p.key}
                    mode={{ kind: "edit", provider: p }}
                    catalog={catalog}
                    onSave={onEditSave}
                    onCancel={() => setEditingKey(null)}
                    saving={saving}
                  />
                ) : (
                  <UserProviderCard
                    key={p.key}
                    provider={p}
                    isDefault={p.key === defaultProviderKey}
                    onSetDefault={() => {
                      const modelId = p.models?.[0]?.id ?? "";
                      handleSetDefault(modelId ? `${p.key}/${modelId}` : p.key);
                    }}
                    onRemove={async () => { await handleRemove(p.key); }}
                    onEdit={() => { setEditingKey(p.key); setAdding(false); }}
                    settingDefault={settingDefault}
                  />
                ),
              )}

              {/* Builtin providers */}
              {builtinProviders.map((bp) =>
                editingBuiltinKey === bp.id ? (
                  <ProviderForm
                    key={bp.id}
                    mode={{ kind: "editBuiltin", providerKey: bp.id, envKey: bp.envKey, defaultPrimary }}
                    catalog={catalog}
                    onSave={onEditBuiltinSave}
                    onCancel={() => setEditingBuiltinKey(null)}
                    saving={saving}
                  />
                ) : (
                  <BuiltinProviderCard
                    key={bp.id}
                    providerKey={bp.id}
                    envKey={bp.envKey}
                    isDefault={bp.id === defaultProviderKey}
                    defaultPrimary={defaultPrimary}
                    onSetDefault={handleSetDefault}
                    onRemove={async () => { await handleRemoveBuiltin(bp.envKey); }}
                    onEdit={() => { setEditingBuiltinKey(bp.id); setAdding(false); setEditingKey(null); }}
                    settingDefault={settingDefault}
                  />
                ),
              )}

              {providerCount === 0 && !adding && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  暂无已注册的模型接口，点击下方按钮添加。
                </p>
              )}

              {adding && (
                <ProviderForm
                  mode={{ kind: "add" }}
                  catalog={catalog}
                  onSave={onAddSave}
                  onCancel={() => setAdding(false)}
                  saving={saving}
                />
              )}

              {!adding && (
                <Button variant="outline" size="sm" onClick={() => setAdding(true)} className="gap-1.5 mt-3">
                  <Plus className="w-3.5 h-3.5" />
                  添加模型接口
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
