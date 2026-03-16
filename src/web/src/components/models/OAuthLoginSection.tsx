// Shared OAuth / plugin-oauth login section
import { useState } from "react";
import { Loader2, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { pluginsEnable, modelsAuthLoginPty } from "@/lib/api";
import { getAuthMethods, type ProviderMeta } from "@/components/onboarding/providerMeta";

export interface OAuthLoginSectionProps {
  meta: ProviderMeta;
  providerId: string;
  authenticated: boolean;
  onAuthenticated: () => void;
}

export function OAuthLoginSection({
  meta,
  providerId,
  authenticated,
  onAuthenticated,
}: OAuthLoginSectionProps) {
  const methods = getAuthMethods(meta);
  const [selectedMethod, setSelectedMethod] = useState(methods[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleLogin = async () => {
    setLoading(true);
    setMsg("");
    try {
      if (meta.pluginName) {
        try { await pluginsEnable(meta.pluginName); } catch { /* ignore */ }
      }
      const { promise } = modelsAuthLoginPty(
        { provider: providerId, auth_method: selectedMethod || methods[0]?.id || "" },
        (text) => console.log("[auth pty]", text),
      );
      const res = await promise;
      if (res.ok) {
        onAuthenticated();
        setMsg("✓ 认证成功");
      } else {
        setMsg(res.output || "认证失败");
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "认证失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {methods.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">登录方式</Label>
          <Select value={selectedMethod} onValueChange={(v) => v && setSelectedMethod(v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue>
                {methods.find((m) => m.id === selectedMethod)?.label ?? "选择"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {methods.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex items-center gap-2">
        {authenticated ? (
          <Badge variant="secondary" className="text-xs shrink-0">✓ 已认证</Badge>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={handleLogin}
            className="gap-1.5 shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                等待中…
              </>
            ) : (
              <>
                <Globe className="w-3.5 h-3.5" />
                🔐 登录
              </>
            )}
          </Button>
        )}
        {msg && (
          <span className={cn("text-xs truncate", msg.startsWith("✓") ? "text-green-500" : "text-destructive")}>
            {msg}
          </span>
        )}
        {!loading && !authenticated && meta.oauthNote && (
          <span className="text-[10px] text-muted-foreground truncate">{meta.oauthNote}</span>
        )}
      </div>
    </div>
  );
}
