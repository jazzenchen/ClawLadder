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
  pinnedVersion?: string;
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
  model?: string;
  chip?: string;
  memory?: string;
  osVersion?: string;
  disk?: string;
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
// User-configured model providers (from config)
// ---------------------------------------------------------------------------

export interface UserProviderModel {
  id: string;
  name?: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
}

export interface UserProvider {
  key: string;           // provider key in config, e.g. "anthropic", "custom-my-host"
  apiKey?: string;       // masked or present
  baseUrl?: string;
  api?: string;          // protocol
  models?: UserProviderModel[];
}

export interface UserModelsInfo {
  providers: UserProvider[];
  defaultPrimary: string; // e.g. "anthropic/claude-sonnet-4-20250514"
  envKeys: string[];      // env keys that have values (for builtin providers)
}

/** Parse the raw config to extract user-configured model providers */
export async function fetchUserModels(): Promise<UserModelsInfo> {
  const config = (await fetchConfig()) as Record<string, unknown> | null;
  if (!config) return { providers: [], defaultPrimary: "", envKeys: [] };

  const modelsSection = (config.models as Record<string, unknown>) ?? {};
  const providersObj = (modelsSection.providers as Record<string, unknown>) ?? {};
  const envObj = (config.env as Record<string, string>) ?? {};
  const agents = (config.agents as Record<string, unknown>) ?? {};
  const defaults = (agents.defaults as Record<string, unknown>) ?? {};
  const modelDefaults = (defaults.model as Record<string, unknown>) ?? {};
  const defaultPrimary = (modelDefaults.primary as string) ?? "";

  const providers: UserProvider[] = [];

  // Collect env keys that have values (for detecting builtin providers)
  const envKeys = Object.keys(envObj).filter((k) => !!envObj[k]);

  // Parse explicit provider entries
  for (const [key, val] of Object.entries(providersObj)) {
    if (!val || typeof val !== "object") {
      // Empty entry = builtin provider with env key only
      providers.push({ key });
      continue;
    }
    const entry = val as Record<string, unknown>;
    providers.push({
      key,
      apiKey: entry.apiKey ? "••••••" : undefined,
      baseUrl: entry.baseUrl as string | undefined,
      api: entry.api as string | undefined,
      models: Array.isArray(entry.models)
        ? (entry.models as UserProviderModel[])
        : undefined,
    });
  }

  return { providers, defaultPrimary, envKeys };
}

/** Set the default primary model via config set */
export async function setDefaultModel(modelPath: string): Promise<{ ok: boolean }> {
  return configSet("agents.defaults.model.primary", modelPath);
}

/** Remove a provider from the config */
export async function removeProvider(providerKey: string): Promise<void> {
  const config = (await fetchConfig()) as Record<string, unknown> | null;
  if (!config) return;
  const modelsSection = (config.models as Record<string, unknown>) ?? {};
  const providersObj = { ...(modelsSection.providers as Record<string, unknown>) ?? {} };
  delete providersObj[providerKey];
  config.models = { ...modelsSection, mode: "merge", providers: providersObj };

  // Clear default model if it belongs to the removed provider
  const agents = (config.agents as Record<string, unknown>) ?? {};
  const defaults = (agents.defaults as Record<string, unknown>) ?? {};
  const modelDefaults = (defaults.model as Record<string, unknown>) ?? {};
  const primary = (modelDefaults.primary as string) ?? "";
  if (primary.startsWith(providerKey + "/") || primary === providerKey) {
    config.agents = {
      ...agents,
      defaults: { ...defaults, model: { ...modelDefaults, primary: "" } },
    };
  }

  await saveConfig(config);
}

/** Add or update a provider in the config (reuses StepLaunch logic) */
export async function upsertProvider(
  providerKey: string,
  entry: {
    apiKey?: string;
    baseUrl?: string;
    api?: string;
    models?: UserProviderModel[];
  },
  envKey?: string,
  envValue?: string,
): Promise<void> {
  const config = (await fetchConfig()) as Record<string, unknown> | null;
  if (!config) throw new Error("Config not found");
  const modelsSection = (config.models as Record<string, unknown>) ?? {};
  const providersObj = { ...(modelsSection.providers as Record<string, unknown>) ?? {} };
  providersObj[providerKey] = entry;
  config.models = { ...modelsSection, mode: "merge", providers: providersObj };
  if (envKey && envValue) {
    const envObj = { ...(config.env as Record<string, string>) ?? {} };
    envObj[envKey] = envValue;
    config.env = envObj;
  }
  await saveConfig(config);
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
  auth_method?: string;
}

export interface AuthLoginResponse {
  ok: boolean;
  output: string;
  needsInteraction?: boolean;
  session_id?: string;
}

export async function modelsAuthLogin(req: AuthLoginRequest): Promise<AuthLoginResponse> {
  return apiPost("/api/models/auth/login", req);
}

/**
 * OAuth login via PTY session.
 *
 * 1. POST /api/models/auth/login → gets { session_id }
 * 2. Connect WebSocket to monitor PTY output
 * 3. Server opens browser automatically (URL interception in PTY ghost reader)
 * 4. Wait for PTY exit message → resolve with success/failure
 *
 * @param onOutput optional callback for raw PTY output (for UI display)
 */
export function modelsAuthLoginPty(
  req: AuthLoginRequest,
  onOutput?: (text: string) => void,
): { promise: Promise<AuthLoginResponse>; abort: () => void } {
  let ws: WebSocket | null = null;
  let aborted = false;

  const promise = (async () => {
    // Step 1: create PTY session
    const res = await modelsAuthLogin(req);
    if (!res.session_id) {
      // Non-PTY path (setup-token etc.) — return directly
      return res;
    }

    const sessionId = res.session_id;

    // Step 2: connect WebSocket and wait for exit
    return new Promise<AuthLoginResponse>((resolve) => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${location.host}/ws?session_id=${sessionId}`;
      ws = new WebSocket(wsUrl);

      let output = "";
      // 5 minute timeout for OAuth flow
      const timeout = setTimeout(() => {
        ws?.close();
        resolve({ ok: false, output: output || "OAuth 登录超时（5分钟）" });
      }, 5 * 60 * 1000);

      ws.onmessage = (ev) => {
        if (aborted) return;
        const data = ev.data;
        if (typeof data === "string") {
          // Check for exit message
          try {
            const msg = JSON.parse(data);
            if (msg.type === "exit") {
              clearTimeout(timeout);
              ws?.close();
              resolve({
                ok: msg.code === 0,
                output: output || (msg.code === 0 ? "认证成功" : "认证失败"),
              });
              return;
            }
          } catch {
            // Not JSON — treat as text output
          }
          output += data;
          onOutput?.(data);
        } else if (data instanceof Blob) {
          // Binary PTY data
          data.text().then((text) => {
            // Check if it's an exit message embedded in binary
            if (text.startsWith('{"type":"exit"')) {
              try {
                const msg = JSON.parse(text);
                if (msg.type === "exit") {
                  clearTimeout(timeout);
                  ws?.close();
                  resolve({
                    ok: msg.code === 0,
                    output: output || (msg.code === 0 ? "认证成功" : "认证失败"),
                  });
                  return;
                }
              } catch { /* ignore */ }
            }
            output += text;
            onOutput?.(text);
          });
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        resolve({ ok: false, output: output || "WebSocket 连接失败" });
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        // If we haven't resolved yet, treat close as failure
        resolve({ ok: false, output: output || "连接已关闭" });
      };
    });
  })();

  const abort = () => {
    aborted = true;
    ws?.close();
  };

  return { promise, abort };
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
    error?: string;
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

export interface UsageRecord {
  timestamp: string;
  agent_id: string;
  session_id: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
}

export interface HourlyUsage {
  hour: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  requests: number;
}

export interface UsageStats {
  daily: DailyUsage[];
  hourly: HourlyUsage[];
  by_agent: GroupedUsage[];
  by_provider: GroupedUsage[];
  by_model: GroupedUsage[];
  records: UsageRecord[];
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

export async function pluginsDisable(name: string): Promise<{ ok: boolean; output: string }> {
  return apiPost("/api/plugins/disable", { name });
}

export async function fetchPluginsList(): Promise<unknown> {
  return apiFetch("/api/plugins/list");
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function fetchHealth(): Promise<unknown> {
  return apiFetch("/api/health");
}

// ---------------------------------------------------------------------------
// Device Pairing
// ---------------------------------------------------------------------------

export async function devicesAutoApprove(): Promise<{ approved: number; rpcOk: boolean }> {
  return apiPost("/api/devices/auto-approve");
}

// ---------------------------------------------------------------------------
// Channels Status
// ---------------------------------------------------------------------------

export async function fetchChannelsStatus(): Promise<unknown> {
  return apiFetch("/api/channels/status");
}

// ---------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------

export interface PairingRequest {
  code: string;
  channel: string;
  senderId: string;
  senderName?: string;
  requestedAt: number;
}

export async function fetchPairingList(): Promise<{ requests: PairingRequest[] }> {
  return apiFetch("/api/pairing/list");
}

export async function approvePairing(code: string, channel?: string): Promise<{ ok: boolean; output: string }> {
  return apiPost("/api/pairing/approve", { code, channel });
}

// ---------------------------------------------------------------------------
// Agents Management
// ---------------------------------------------------------------------------

export async function fetchAgentsList(): Promise<unknown> {
  return apiFetch("/api/agents/list");
}

export async function addAgent(id: string, workspace?: string): Promise<{ ok: boolean; output: string }> {
  return apiPost("/api/agents/add", { id, workspace });
}

export async function deleteAgent(id: string): Promise<{ ok: boolean; output: string }> {
  return apiPost("/api/agents/delete", { id });
}

export async function setAgentIdentity(id: string, name?: string, emoji?: string): Promise<{ ok: boolean; output: string }> {
  return apiPost("/api/agents/set-identity", { id, name, emoji });
}

// ---------------------------------------------------------------------------
// Memory Status
// ---------------------------------------------------------------------------

export async function fetchMemoryStatus(): Promise<unknown> {
  return apiFetch("/api/memory/status");
}

