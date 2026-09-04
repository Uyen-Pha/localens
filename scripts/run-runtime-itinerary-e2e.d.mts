export type RuntimeItineraryPorts = {
  api: number;
  database: number;
  shadow: number;
  pooler: number;
  studio: number;
  mailpitHttp: number;
  mailpitSmtp: number;
  mailpitPop3: number;
  analytics: number;
  inspector: number;
  next: number;
};

export function selectRuntimeItineraryBaseEnv(
  env?: Record<string, string | undefined>,
): Record<string, string>;

export function requireLocalDockerContext(options?: {
  env?: Record<string, string | undefined>;
  probe?: (
    command: string,
    args: string[],
    options: { env: Record<string, string | undefined> },
  ) => { status: number | null; stdout?: string; stderr?: string };
}): string;

export function createRuntimeItinerarySecrets(
  env?: Record<string, string | undefined>,
  random?: (length: number) => Buffer,
): {
  customer: string;
  guide: string;
  admin: string;
  otherCustomer: string;
  geminiApiKey: string;
  geminiControlToken: string;
  quotaHmacKey: string;
};

export function buildIsolatedSupabaseConfig(
  source: string,
  options: { projectId: string; ports: RuntimeItineraryPorts },
): string;

export function prepareIsolatedSupabaseProject(options?: {
  cwd?: string;
  projectRoot?: string;
  projectId: string;
  ports: RuntimeItineraryPorts;
  createProjectRoot?: () => string;
  removeProjectRoot?: (target: string) => void;
}): {
  root: string;
  projectId: string;
  ports: RuntimeItineraryPorts;
};

export function startFakeGeminiProvider(options: {
  apiKey: string;
  controlToken: string;
  containerHost: "host.docker.internal" | "host.containers.internal";
  logger?: (message: string) => void;
}): Promise<{
  endpointBase: string;
  controlUrl: string;
  stop: () => Promise<void>;
}>;

export function parseIsolatedRuntimeStatus(
  output: string,
  ports: RuntimeItineraryPorts,
): {
  apiUrl: string;
  databaseUrl: string;
  publishableKey: string;
  anonKey: string;
  serviceRoleKey: string;
};

export function runRuntimeItineraryE2E(
  options?: Record<string, unknown>,
): Promise<{ ok: true }>;

export function runRuntimeItineraryE2EMain(options?: {
  run?: (options: { signal: AbortSignal }) => Promise<unknown>;
  errorLogger?: (message: string) => void;
  signals?: {
    once(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
    removeListener(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  };
}): Promise<number>;
