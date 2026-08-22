import { z } from "zod";

const httpUrl = z.url().refine(
  (value) => value.startsWith("http://") || value.startsWith("https://"),
  "URL must use HTTP or HTTPS",
);

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function parsePublicEnv(source: unknown): PublicEnv {
  return publicEnvSchema.parse(source);
}
