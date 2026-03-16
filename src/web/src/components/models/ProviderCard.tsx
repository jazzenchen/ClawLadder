// Provider cards — user-registered and builtin (env-detected)
import { useState } from "react";
import { Cpu, Star, Trash2, Globe, Key, Pencil, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { getProviderMeta, type ProviderMeta } from "@/components/onboarding/providerMeta";
import type { UserProvider } from "@/lib/api";

// ---------------------------------------------------------------------------
// Shared label map
// ---------------------------------------------------------------------------

import { PROVIDER_META } from "@/components/onboarding/providerMeta";

const PROVIDER_LABELS: Record<string, string> = {};
for (const m of PROVIDER_META) {
  PROVIDER_LABELS[m.id] = m.label;
}

export function providerLabel(key: string, meta?: ProviderMeta) {
  return meta?.label ?? PROVIDER_LABELS[key] ?? key;
}

// ---------------------------------------------------------------------------
// ConfirmDeleteDialog — shared confirm + loading
// ---------------------------------------------------------------------------

function ConfirmDeleteDialog({
  open,
  label,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  label: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v && !deleting) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除 <span className="font-medium text-foreground">{label}</span> 吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleConfirm(); }}
            disabled={deleting}
            variant="destructive"
          >
            {deleting ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                删除中…
              </span>
            ) : "删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// UserProviderCard
// ---------------------------------------------------------------------------

export function UserProviderCard({
  provider,
  isDefault,
  onSetDefault,
  onRemove,
  onEdit,
  settingDefault,
}: {
  provider: UserProvider;
  isDefault: boolean;
  onSetDefault: () => void;
  onRemove: () => Promise<void>;
  onEdit: () => void;
  settingDefault: boolean;
}) {
  const meta = getProviderMeta(provider.key);
  const label = providerLabel(provider.key, meta);
  const modelIds = provider.models?.map((m) => m.name || m.id) ?? [];
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Card className={cn("p-3", isDefault && "ring-1 ring-primary/40")}>
        <div className="flex items-center gap-3">
          <Cpu className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm">{label}</span>
              {isDefault && (
                <Badge className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30">
                  默认
                </Badge>
              )}
              {provider.api && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {provider.api}
                </Badge>
              )}
            </div>
            {provider.baseUrl && (
              <p className="text-[10px] text-muted-foreground mt-0.5 font-mono flex items-center gap-1">
                <Globe className="w-2.5 h-2.5" />
                {provider.baseUrl}
              </p>
            )}
            {provider.apiKey && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Key className="w-2.5 h-2.5" />
                {provider.apiKey}
              </p>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={onEdit} title="编辑">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {!isDefault && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={onSetDefault} disabled={settingDefault} title="设为默认">
                <Star className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setConfirmOpen(true)} title="删除">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        {modelIds.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/30 space-y-0.5">
            {modelIds.map((name, i) => (
              <div key={i} className="text-xs font-mono text-muted-foreground pl-6">
                {name}
              </div>
            ))}
          </div>
        )}
      </Card>
      <ConfirmDeleteDialog
        open={confirmOpen}
        label={label}
        onConfirm={async () => { await onRemove(); setConfirmOpen(false); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// BuiltinProviderCard
// ---------------------------------------------------------------------------

export function BuiltinProviderCard({
  providerKey,
  envKey,
  isDefault,
  defaultPrimary,
  onSetDefault,
  onRemove,
  onEdit,
  settingDefault,
}: {
  providerKey: string;
  envKey: string;
  isDefault: boolean;
  defaultPrimary: string;
  onSetDefault: (modelPath: string) => void;
  onRemove: () => Promise<void>;
  onEdit: () => void;
  settingDefault: boolean;
}) {
  const meta = getProviderMeta(providerKey);
  const label = providerLabel(providerKey, meta);
  const modelId = isDefault ? defaultPrimary.split("/").slice(1).join("/") : meta?.exampleModel ?? "";
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Card className={cn("p-3", isDefault && "ring-1 ring-primary/40")}>
        <div className="flex items-center gap-3">
          <Cpu className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm">{label}</span>
              {isDefault && (
                <Badge className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30">
                  默认
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">内置</Badge>
            </div>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Key className="w-2.5 h-2.5" />
              {envKey} ✓
            </p>
            {modelId && (
              <p className="text-xs font-mono text-muted-foreground mt-1 pl-0">
                {modelId}
              </p>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={onEdit} title="编辑">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {!isDefault && meta?.exampleModel && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => onSetDefault(`${providerKey}/${meta.exampleModel}`)} disabled={settingDefault} title="设为默认">
                <Star className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setConfirmOpen(true)} title="移除">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </Card>
      <ConfirmDeleteDialog
        open={confirmOpen}
        label={label}
        onConfirm={async () => { await onRemove(); setConfirmOpen(false); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
