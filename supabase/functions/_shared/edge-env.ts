import { z } from "zod";

import { GEMINI_MODEL } from "@/supabase/functions/_shared/gemini-ranker";

export interface ItineraryEdgeEnv {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly supabaseServiceRoleKey: string;
  readonly quotaHmacKey: string;
  readonly allowedOrigins: string[];
  readonly geminiEnabled: boolean;
  readonly geminiApiKey?: string;
  readonly geminiModel: typeof GEMINI_MODEL;
}

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MAX_SECRET_LENGTH = 4096;
const MAX_URL_LENGTH = 2048;
const MAX_ALLOWED_ORIGINS = 8;
const MAX_ALLOWED_ORIGINS_LENGTH = 4096;

function isTrimmedControlFree(value: string): boolean {
  return value === value.trim() && !CONTROL_CHARACTER_PATTERN.test(value);
}

function normalizedEndpoint(value: string): string | null {
  if (
    value.length === 0
    || value.length > MAX_URL_LENGTH
    || !isTrimmedControlFree(value)
  ) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.username !== ""
      || parsed.password !== ""
      || parsed.pathname !== "/"
      || parsed.search !== ""
      || parsed.hash !== ""
      || (parsed.protocol !== "https:"
        && !(parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname)))
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

const endpointSchema = z.string()
  .refine((value) => normalizedEndpoint(value) !== null, "URL must be an HTTPS or loopback HTTP origin")
  .transform((value) => normalizedEndpoint(value)!);

const serverValueSchema = z.string()
  .min(1)
  .max(MAX_SECRET_LENGTH)
  .refine(isTrimmedControlFree, "Server value must be trimmed and control-free");

const quotaKeySchema = serverValueSchema.min(32);

const allowedOriginsSchema = z.string()
  .min(1)
  .max(MAX_ALLOWED_ORIGINS_LENGTH)
  .refine(isTrimmedControlFree, "Origin list must be trimmed and control-free")
  .transform((value, context) => {
    const rawOrigins = value.split(",");
    if (rawOrigins.length === 0 || rawOrigins.length > MAX_ALLOWED_ORIGINS) {
      context.addIssue({ code: "custom", message: "Origin list is outside the supported bounds" });
      return z.NEVER;
    }
    const origins: string[] = [];
    for (const rawOrigin of rawOrigins) {
      const origin = normalizedEndpoint(rawOrigin.trim());
      if (origin === null || origins.includes(origin)) {
        context.addIssue({ code: "custom", message: "Origin list contains an invalid or duplicate origin" });
        return z.NEVER;
      }
      origins.push(origin);
    }
    return origins;
  });

const sourceSchema = z.object({
  SUPABASE_URL: endpointSchema,
  SUPABASE_ANON_KEY: serverValueSchema,
  SUPABASE_SERVICE_ROLE_KEY: serverValueSchema,
  LOCALLENS_QUOTA_HMAC_KEY: quotaKeySchema,
  ALLOWED_ORIGINS: allowedOriginsSchema,
  LOCALLENS_GEMINI_ENABLED: z.enum(["0", "1"]),
  GEMINI_API_KEY: serverValueSchema.optional(),
  GEMINI_MODEL: z.literal(GEMINI_MODEL).optional(),
}).superRefine((value, context) => {
  if (value.LOCALLENS_GEMINI_ENABLED === "1" && value.GEMINI_API_KEY === undefined) {
    context.addIssue({
      code: "custom",
      message: "Gemini API key is required while Gemini is enabled",
      path: ["GEMINI_API_KEY"],
    });
  }
});

/** Parse only the server-side values needed by the itinerary Edge runtime. */
export function parseItineraryEdgeEnv(source: unknown): ItineraryEdgeEnv {
  const parsed = sourceSchema.parse(source);
  const geminiEnabled = parsed.LOCALLENS_GEMINI_ENABLED === "1";
  return {
    supabaseUrl: parsed.SUPABASE_URL,
    supabaseAnonKey: parsed.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    quotaHmacKey: parsed.LOCALLENS_QUOTA_HMAC_KEY,
    allowedOrigins: [...parsed.ALLOWED_ORIGINS],
    geminiEnabled,
    ...(geminiEnabled ? { geminiApiKey: parsed.GEMINI_API_KEY! } : {}),
    geminiModel: GEMINI_MODEL,
  };
}
