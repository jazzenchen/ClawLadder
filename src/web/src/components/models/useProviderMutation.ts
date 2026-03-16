// Hook encapsulating provider CRUD operations + loading/error state
import { useState, useCallback } from "react";
import {
  fetchUserModels,
  fetchProviders,
  fetchConfig,
  saveConfig,
  setDefaultModel,
  removeProvider,
  upsertProvider,
  gatewayRestart,
  type UserModelsInfo,
  type CatalogProvider,
} from "@/lib/api";
import { getProviderMeta, PROVIDER_META } from "@/components/onboarding/providerMeta";
import type { ProviderFormPayload } from "./ProviderForm";

// ---------------------------------------------------------------------------
// ENV → provider mapping (shared)
// ---------------------------------------------------------------------------

const ENV_TO_PROVIDER: Record<string, { id: string; envKey: string }> = {};
for (const m of PROVIDER_META) {
  if (m.envKey) ENV_TO_PROVIDER[m.envKey] = { id: m.id, envKey: m.envKey };
}

export function deriveBuiltinProviders(
  userModels: UserModelsInfo | null,
): { id: string; envKey: string }[] {
  const explicitKeys = new Set(userModels?.providers.map((p) => p.key) ?? []);
  const result: { id: string; envKey: string }[] = [];
  for (const ek of userModels?.envKeys ?? []) {
    const info = ENV_TO_PROVIDER[ek];
    if (info && !explicitKeys.has(info.id)) result.push(info);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProviderMutation(onRefresh?: () => void) {
  const [userModels, setUserModels] = useState<UserModelsInfo | null>(null);
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);

  // ── Load ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [um, cat] = await Promise.all([
        fetchUserModels(),
        fetchProviders().catch(() => ({ providers: [], totalModels: 0 })),
      ]);
      setUserModels(um);
      setCatalog(cat.providers);
    } catch (e) {
      console.error("[useProviderMutation] load failed:", e);
      setError("加载模型信息失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Set default ─────────────────────────────────────────────────────────
  const handleSetDefault = useCallback(async (modelPath: string) => {
    setSettingDefault(true);
    try {
      await setDefaultModel(modelPath);
      await gatewayRestart();
      await load();
      onRefresh?.();
    } catch (e) {
      console.error("[useProviderMutation] setDefault failed:", e);
      setError("设置默认模型失败");
    } finally {
      setSettingDefault(false);
    }
  }, [load, onRefresh]);

  // ── Pick next default after removing the current default provider ────────
  const pickNextDefault = useCallback(async (removedKey: string) => {
    // Only act if the removed provider was the current default
    const currentDefault = userModels?.defaultPrimary ?? "";
    const currentDefaultKey = currentDefault.split("/")[0];
    if (currentDefaultKey !== removedKey) return;

    // Reload to get the updated provider list
    const um = await fetchUserModels();
    const builtins = deriveBuiltinProviders(um);

    // Try first explicit provider
    for (const p of um.providers) {
      const modelId = p.models?.[0]?.id;
      if (modelId) {
        await setDefaultModel(`${p.key}/${modelId}`);
        return;
      }
      // provider with no models — use exampleModel from meta
      const meta = getProviderMeta(p.key);
      if (meta?.exampleModel) {
        await setDefaultModel(`${p.key}/${meta.exampleModel}`);
        return;
      }
    }

    // Try first builtin provider
    for (const bp of builtins) {
      const meta = getProviderMeta(bp.id);
      if (meta?.exampleModel) {
        await setDefaultModel(`${bp.id}/${meta.exampleModel}`);
        return;
      }
    }

    // No providers left — clear default
    await setDefaultModel("");
  }, [userModels]);

  // ── Remove explicit provider ────────────────────────────────────────────
  const handleRemove = useCallback(async (providerKey: string) => {
    try {
      await removeProvider(providerKey);
      await pickNextDefault(providerKey);
      try { await gatewayRestart(); } catch { /* ignore */ }
      await load();
      onRefresh?.();
    } catch (e) {
      console.error("[useProviderMutation] remove failed:", e);
      setError("删除失败");
    }
  }, [load, onRefresh, pickNextDefault]);

  // ── Remove builtin (env key) ───────────────────────────────────────────
  const handleRemoveBuiltin = useCallback(async (envKey: string) => {
    try {
      // Resolve the provider id from envKey
      const providerInfo = ENV_TO_PROVIDER[envKey];
      const config = (await fetchConfig()) as Record<string, unknown> | null;
      if (!config) return;
      const envObj = { ...(config.env as Record<string, string>) ?? {} };
      delete envObj[envKey];
      config.env = envObj;
      await saveConfig(config);
      if (providerInfo) await pickNextDefault(providerInfo.id);
      try { await gatewayRestart(); } catch { /* ignore */ }
      await load();
      onRefresh?.();
    } catch (e) {
      console.error("[useProviderMutation] remove builtin failed:", e);
      setError("删除失败");
    }
  }, [load, onRefresh, pickNextDefault]);

  // ── Save (unified — works for add / edit / editBuiltin) ────────────────
  const handleSave = useCallback(async (data: ProviderFormPayload) => {
    setSaving(true);
    try {
      if (data.isBuiltin) {
        const config = (await fetchConfig()) as Record<string, unknown> | null;
        if (!config) throw new Error("Config not found");
        if (data.envKey && data.envValue) {
          const envObj = { ...(config.env as Record<string, string>) ?? {} };
          envObj[data.envKey] = data.envValue;
          config.env = envObj;
        }
        if ((data.setAsDefault || data.modelPath) && data.modelPath) {
          const agents = (config.agents as Record<string, unknown>) ?? {};
          const defaults = (agents.defaults as Record<string, unknown>) ?? {};
          const modelDefaults = (defaults.model as Record<string, unknown>) ?? {};
          config.agents = {
            ...agents,
            defaults: { ...defaults, model: { ...modelDefaults, primary: data.modelPath } },
          };
        }
        await saveConfig(config);
      } else {
        if (data.entry) {
          await upsertProvider(data.providerKey, data.entry as Parameters<typeof upsertProvider>[1], data.envKey, data.envValue);
        }
        if (data.setAsDefault && data.modelPath) {
          await setDefaultModel(data.modelPath);
        }
      }
      await gatewayRestart();
      await load();
      onRefresh?.();
    } catch (e) {
      console.error("[useProviderMutation] save failed:", e);
      setError("保存失败");
    } finally {
      setSaving(false);
    }
  }, [load, onRefresh]);

  return {
    userModels,
    catalog,
    loading,
    error,
    saving,
    settingDefault,
    load,
    handleSetDefault,
    handleRemove,
    handleRemoveBuiltin,
    handleSave,
    setError,
  };
}
