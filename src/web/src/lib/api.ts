// API client for ClawLadder backend

const BASE = "";

// ---------------------------------------------------------------------------
// Shared fetch helper — reduces repetitive error handling
// ---------------------------------------------------------------------------

async function apiFetch<T>(
  url: string,
  init?: RequestInit,
  errorMsg = "API request failed",
): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || errorMsg);
  }
  // Handle 204 No Content or empty body
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text);
}

function apiPost<T>(url: string, body?: unknown, errorMsg?: string): Promise<T> {
  return apiFetch<T>(
    url,
    {
      method: "POST",
      ...(body != null && {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    },
    errorMsg,
  );
}

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
  return apiFetch("/api/status");
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export async function fetchConfig(): Promise<unknown | null> {
  return apiFetch("/api/config");
}

export async function saveConfig(config: unknown): Promise<void> {
  await apiPost("/api/config", config, "Failed to save config");
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
  return apiFetch("/api/gateway/status");
}

export interface GatewayUrl {
  httpUrl: string;
  wsUrl: string;
  port: number;
  token: string;
}

export async function fetchGatewayUrl(): Promise<GatewayUrl> {
  return apiFetch("/api/gateway/url");
}

export async function gatewayInstall(): Promise<{ ok: boolean; message: string }> {
  return apiPost("/api/gateway/install");
}

export async function gatewayStart(): Promise<{ ok: boolean; message: string }> {
  return apiPost("/api/gateway/start");
}

export async function gatewayRestart(): Promise<{ ok: boolean; message: string }> {
  return apiPost("/api/gateway/restart");
}

export async function gatewayStop(): Promise<{ ok: boolean; message: string }> {
  return apiPost("/api/gateway/stop");
}

export async function gatewayUninstall(): Promise<{ ok: boolean; message: string }> {
  return apiPost("/api/gateway/uninstall");
}

export async function gatewayOpenDashboard(): Promise<{ ok: boolean; message: string }> {
  return apiPost("/api/gateway/open-dashboard");
}

// ---------------------------------------------------------------------------
// Install (existing)
// ---------------------------------------------------------------------------

export async function validateSudo(password: string): Promise<boolean> {
  try {
    await apiFetch<unknown>("/api/sudo/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function startInstall(
  password: string,
  verbose: boolean,
  useHomebrew: boolean = false,
  useChinaMirror: boolean = true,
): Promise<string> {
  const data = await apiPost<{ session_id: string }>("/api/install", {
    password,
    verbose,
    use_homebrew: useHomebrew,
    use_china_mirror: useChinaMirror,
  });
  return data.session_id;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await apiFetch<unknown>(`/api/sessions/${sessionId}`, { method: "DELETE" }, "Failed to delete session");
}

// ---------------------------------------------------------------------------
// Device Info
// ---------------------------------------------------------------------------

export interface DeviceInfo {
  serial: string;
  hardwareUUID: string;
}

export async function fetchDeviceSerial(): Promise<DeviceInfo> {
  return apiFetch("/api/device/serial");
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
  return apiPost("/api/onboard", req, "Onboard failed");
}

export async function configSet(path: string, value: string): Promise<{ ok: boolean }> {
  return apiPost("/api/config/set", { path, value }, "Config set failed");
}

// ---------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------

export async function runDoctor(): Promise<{ ok: boolean; output: string; exit_code?: number }> {
  return apiPost("/api/doctor", undefined, "Doctor failed");
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
  return apiFetch("/api/models/providers");
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
  return apiFetch("/api/skills/list");
}

// ---------------------------------------------------------------------------
// ClawHub
// ---------------------------------------------------------------------------

export interface ClawHubStatus {
  installed: boolean;
  version?: string;
}

export async function fetchClawHubStatus(): Promise<ClawHubStatus> {
  return apiFetch("/api/clawhub/status");
}

export async function installClawHub(): Promise<{ ok: boolean }> {
  return apiPost("/api/clawhub/install", undefined, "Failed to install clawhub");
}

export async function installClawHubSkill(url: string): Promise<{ ok: boolean; output?: string }> {
  return apiPost("/api/clawhub/skill-install", { url }, "Failed to install skill");
}

export async function uninstallClawHubSkill(slug: string): Promise<{ ok: boolean }> {
  return apiPost("/api/clawhub/skill-uninstall", { slug }, "Failed to uninstall skill");
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
  return apiFetch("/api/hooks/list");
}

export async function enableHook(name: string): Promise<{ ok: boolean }> {
  return apiPost("/api/hooks/enable", { name });
}

export async function disableHook(name: string): Promise<{ ok: boolean }> {
  return apiPost("/api/hooks/disable", { name });
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
  return apiPost("/api/models/auth/login", req);
}

export interface AuthStatusResponse {
  provider: string;
  authenticated: boolean;
  raw: unknown;
}

export async function modelsAuthStatus(provider: string): Promise<AuthStatusResponse> {
  return apiFetch(`/api/models/auth/status?provider=${encodeURIComponent(provider)}`);
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
  return apiFetch("/api/openclaw/status");
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
  return apiFetch(`/api/usage?days=${days}`);
}

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

export async function pluginsEnable(name: string): Promise<{ ok: boolean; output: string }> {
  return apiPost("/api/plugins/enable", { name });
}

