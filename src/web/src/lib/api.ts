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
}

export async function fetchStatus(): Promise<StatusInfo> {
  const res = await fetch(`${BASE}/api/status`);
  if (!res.ok) throw new Error("Failed to fetch status");
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

export async function gatewayOpenDashboard(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${BASE}/api/gateway/open-dashboard`, { method: "POST" });
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
// Doctor
// ---------------------------------------------------------------------------

export async function runDoctor(): Promise<{ ok: boolean; output: string; exit_code?: number }> {
  const res = await fetch(`${BASE}/api/doctor`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Doctor failed");
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

export interface SkillInfo {
  name: string;
  description?: string;
  emoji?: string;
  eligible: boolean;
  disabled: boolean;
  source: string;
  bundled: boolean;
}

export interface SkillsResponse {
  skills: SkillInfo[];
  /** Legacy fields kept for backward compat */
  summary?: { total: number; eligible: number; disabled: number; blocked: number; missingRequirements: number };
  eligible?: string[];
}

export async function fetchSkills(): Promise<SkillsResponse> {
  const res = await fetch(`${BASE}/api/skills/list`);
  if (!res.ok) throw new Error("Failed to fetch skills");
  return res.json();
}

// ---------------------------------------------------------------------------
// ClawHub
// ---------------------------------------------------------------------------

export interface ClawHubStatus {
  installed: boolean;
  version?: string;
}

export async function fetchClawHubStatus(): Promise<ClawHubStatus> {
  const res = await fetch(`${BASE}/api/clawhub/status`);
  if (!res.ok) throw new Error("Failed to check clawhub status");
  return res.json();
}

export async function installClawHub(): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/clawhub/install`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to install clawhub");
  }
  return res.json();
}

export async function installClawHubSkill(url: string): Promise<{ ok: boolean; output?: string }> {
  const res = await fetch(`${BASE}/api/clawhub/skill-install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to install skill");
  }
  return res.json();
}

export async function uninstallClawHubSkill(slug: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/clawhub/skill-uninstall`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to uninstall skill");
  }
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
// OpenClaw Status (token usage, sessions, agents)
// ---------------------------------------------------------------------------

export interface OpenClawSession {
  agentId: string;
  key: string;
  kind: string;
  sessionId: string;
  updatedAt: number;
  age: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  model: string;
  contextTokens: number;
  flags: string[];
}

export interface OpenClawAgent {
  id: string;
  workspaceDir: string;
  bootstrapPending: boolean;
  sessionsCount: number;
  lastUpdatedAt: number | null;
  lastActiveAgeMs: number | null;
}

export interface OpenClawStatus {
  runtimeVersion: string;
  sessions: {
    count: number;
    defaults: { model: string; contextTokens: number };
    recent: OpenClawSession[];
  };
  agents: {
    defaultId: string;
    agents: OpenClawAgent[];
    totalSessions: number;
  };
  gateway: {
    mode: string;
    url: string;
    reachable: boolean;
    connectLatencyMs: number;
    self?: { host: string; version: string; platform: string };
  };
  gatewayService: {
    installed: boolean;
    runtimeShort: string;
  };
  channelSummary: string[];
  securityAudit: {
    summary: { critical: number; warn: number; info: number };
  };
  memory: {
    files: number;
    chunks: number;
    backend: string;
  };
  usage: {
    providers: unknown[];
  };
}

export async function fetchOpenClawStatus(): Promise<OpenClawStatus> {
  const res = await fetch(`${BASE}/api/openclaw/status`);
  if (!res.ok) throw new Error("Failed to fetch OpenClaw status");
  return res.json();
}

// ---------------------------------------------------------------------------
// Usage Stats (JSONL scan)
// ---------------------------------------------------------------------------

export interface DailyUsage {
  date: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_read: number;
  cache_write: number;
  cost: number;
  requests: number;
}

export interface GroupedUsage {
  key: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
  requests: number;
}

export interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_read: number;
  cache_write: number;
  cost: number;
  requests: number;
  sessions_scanned: number;
  days: number;
}

export interface UsageStats {
  daily: DailyUsage[];
  by_agent: GroupedUsage[];
  by_provider: GroupedUsage[];
  by_model: GroupedUsage[];
  totals: UsageTotals;
}

export async function fetchUsageStats(days: number = 30): Promise<UsageStats> {
  const res = await fetch(`${BASE}/api/usage?days=${days}`);
  if (!res.ok) throw new Error("Failed to fetch usage stats");
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

