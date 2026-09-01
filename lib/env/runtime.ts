export type RuntimeMode = "demo" | "supabase";

export type BrowserRuntimeConfig =
  | { readonly mode: "demo" }
  | {
      readonly mode: "supabase";
      readonly supabaseUrl: string;
      readonly supabasePublishableKey: string;
    };

const RUNTIME_VARIABLE = "NEXT_PUBLIC_LOCALLENS_RUNTIME";
const SUPABASE_URL_VARIABLE = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_KEY_VARIABLE = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

export function parseRuntimeMode(value: unknown): RuntimeMode {
  if (value === "demo" || value === "supabase") return value;

  throw new Error(`${RUNTIME_VARIABLE} must be set explicitly to demo or supabase.`);
}

export function parseBrowserRuntimeConfig(source: Record<string, unknown>): BrowserRuntimeConfig {
  const mode = parseRuntimeMode(source[RUNTIME_VARIABLE]);
  if (mode === "demo") return { mode };

  const supabaseUrl = source[SUPABASE_URL_VARIABLE];
  if (!isHttpUrl(supabaseUrl)) {
    throw new Error(`${SUPABASE_URL_VARIABLE} must be a valid HTTP(S) URL in supabase mode.`);
  }

  const supabasePublishableKey = source[SUPABASE_KEY_VARIABLE];
  if (typeof supabasePublishableKey !== "string" || supabasePublishableKey.trim().length === 0) {
    throw new Error(`${SUPABASE_KEY_VARIABLE} must be non-empty in supabase mode.`);
  }

  return { mode, supabaseUrl, supabasePublishableKey };
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;

  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
