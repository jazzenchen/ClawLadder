// API client for ClawLadder backend

const BASE = "";

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface StatusInfo {
  installed: boolean;
  version?: string;
  configured: boolean;
  running: boolean;
  clawladder_status?: string | null; // null = no config file, "none" = config exists but no ClawLadder key, "installed", "configured"
}

export async function fetchStatus(): Promise<StatusInfo> {
  const res = await fetch(`${BASE}/api/status`);
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
}

// ---------------------------------------------------------------------------
// ClawLadder status
// ---------------------------------------------------------------------------

export async function setClawLadderStatus(status: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/clawladder/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to set ClawLadder status");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export async function fetchConfig(): Promise<unknown | null> {
  const res = await fetch(`${BASE}/api/config`);
  if (!res.ok) throw new Error("Failed to fetch config");
  const data = await res.json();
  return data; // null if no config file yet
}

export async function saveConfig(config: unknown): Promise<void> {
  const res = await fetch(`${BASE}/api/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to save config: ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

export interface GatewayStatus {
  installed: boolean;
  running: boolean;
  pid?: number;
  address?: string;
  port?: number;
  version?: string;
  rpc_ok?: boolean;
  raw?: unknown;
}

export async function fetchGatewayStatus(): Promise<GatewayStatus> {
  const res = await fetch(`${BASE}/api/gateway/status`);
  if (!res.ok) throw new Error("Failed to fetch gateway status");
  return res.json();
}

export interface GatewayUrl {
  httpUrl: string;
  wsUrl: string;
  port: number;
  token: string;
}

export async function fetchGatewayUrl(): Promise<GatewayUrl> {
  const res = await fetch(`${BASE}/api/gateway/url`);
  if (!res.ok) throw new Error("Failed to fetch gateway URL");
  return res.json();
}

export async function gatewayInstall(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${BASE}/api/gateway/install`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  return res.json();
}

export async function gatewayStart(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${BASE}/api/gateway/start`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  return res.json();
}

export async function gatewayRestart(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${BASE}/api/gateway/restart`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  return res.json();
}

export async function gatewayStop(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${BASE}/api/gateway/stop`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  return res.json();
}

export async function gatewayUninstall(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${BASE}/api/gateway/uninstall`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Install (existing)
// ---------------------------------------------------------------------------

export async function validateSudo(password: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/sudo/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return res.ok;
}

export async function startInstall(
  password: string,
  verbose: boolean,
  useHomebrew: boolean = false,
): Promise<string> {
  const res = await fetch(`${BASE}/api/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, verbose, use_homebrew: useHomebrew }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  const data = await res.json();
  return data.session_id;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`${BASE}/api/sessions/${sessionId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export interface OnboardRequest {
  auth_choice?: string;
  api_key?: string;
  model?: string;
  install_daemon?: boolean;
  skip_channels?: boolean;
  skip_skills?: boolean;
  skip_search?: boolean;
  skip_health?: boolean;
  skip_ui?: boolean;
}

export async function runOnboard(req: OnboardRequest): Promise<{ ok: boolean; output: string }> {
  const res = await fetch(`${BASE}/api/onboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Onboard failed");
  }
  return res.json();
}

export async function configSet(path: string, value: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/config/set`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, value }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Config set failed");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Models / Providers
// ---------------------------------------------------------------------------

export interface CatalogModel {
  id: string;
  key: string;
  name: string;
  input: string;
  contextWindow: number;
  available: boolean;
  local: boolean;
  tags: string[];
}

export interface CatalogProvider {
  id: string;
  label: string;
  builtin: boolean;
  modelCount: number;
  models: CatalogModel[];
}

export interface ProvidersResponse {
  providers: CatalogProvider[];
  totalModels: number;
}

export async function fetchProviders(): Promise<ProvidersResponse> {
  const res = await fetch(`${BASE}/api/models/providers`);
  if (!res.ok) throw new Error("Failed to fetch providers");
  return res.json();
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export interface SkillsResponse {
  summary?: { total: number; eligible: number; disabled: number; blocked: number; missingRequirements: number };
  eligible: string[];
  disabled: string[];
  blocked: string[];
  /** API returns missing as object { bins?, config?, env? }; legacy or fallback may be string[] */
  missingRequirements: { name: string; missing: string[] | { bins?: string[]; config?: string[]; env?: string[] } }[];
}

export async function fetchSkills(): Promise<SkillsResponse> {
  const res = await fetch(`${BASE}/api/skills/list`);
  if (!res.ok) throw new Error("Failed to fetch skills");
  return res.json();
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface HookInfo {
  name: string;
  description: string;
  emoji: string;
  eligible: boolean;
  disabled: boolean;
  source: string;
  events: string[];
}

export interface HooksResponse {
  workspaceDir: string;
  managedHooksDir: string;
  hooks: HookInfo[];
}

export async function fetchHooks(): Promise<HooksResponse> {
  const res = await fetch(`${BASE}/api/hooks/list`);
  if (!res.ok) throw new Error("Failed to fetch hooks");
  return res.json();
}

export async function enableHook(name: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/hooks/enable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to enable hook");
  return res.json();
}

export async function disableHook(name: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/hooks/disable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to disable hook");
  return res.json();
}

// ---------------------------------------------------------------------------
// Models Auth (OAuth / setup-token / plugin login)
// ---------------------------------------------------------------------------

export interface AuthLoginRequest {
  provider: string;
  setup_token?: string;
  auth_choice?: string;
}

export interface AuthLoginResponse {
  ok: boolean;
  output: string;
  needsInteraction?: boolean;
}

export async function modelsAuthLogin(req: AuthLoginRequest): Promise<AuthLoginResponse> {
  const res = await fetch(`${BASE}/api/models/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error("Auth login failed");
  return res.json();
}

export interface AuthStatusResponse {
  provider: string;
  authenticated: boolean;
  raw: unknown;
}

export async function modelsAuthStatus(provider: string): Promise<AuthStatusResponse> {
  const res = await fetch(`${BASE}/api/models/auth/status?provider=${encodeURIComponent(provider)}`);
  if (!res.ok) throw new Error("Auth status check failed");
  return res.json();
}

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

export async function pluginsEnable(name: string): Promise<{ ok: boolean; output: string }> {
  const res = await fetch(`${BASE}/api/plugins/enable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Plugin enable failed");
  return res.json();
}

