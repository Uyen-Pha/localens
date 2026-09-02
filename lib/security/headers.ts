export interface SecurityHeaderInput {
  runtime: "demo" | "supabase";
  supabaseUrl?: string;
  vercelEnvironment?: "development" | "preview" | "production";
}

export function buildSecurityHeaders(
  input: SecurityHeaderInput,
): ReadonlyArray<{ key: string; value: string }> {
  const connectSources = ["'self'"];

  if (input.runtime === "supabase") {
    connectSources.push(canonicalSupabaseOrigin(input.supabaseUrl));
  }

  const scriptSources = ["'self'", "'unsafe-inline'"];
  if (input.vercelEnvironment === "development") {
    scriptSources.push("'unsafe-eval'");
  }

  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
  ].join("; ");

  const headers: Array<{ key: string; value: string }> = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    },
  ];

  if (input.vercelEnvironment === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }

  return headers;
}

function canonicalSupabaseOrigin(value: string | undefined): string {
  let url: URL;
  try {
    if (!value) throw new Error("missing");
    url = new URL(value);
  } catch {
    throw new Error("Supabase URL must be a valid HTTP(S) URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Supabase URL must be a valid HTTP(S) URL.");
  }

  if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) {
    throw new Error("Public Supabase URL must use HTTPS.");
  }

  return url.origin;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname === "[::1]";
}
