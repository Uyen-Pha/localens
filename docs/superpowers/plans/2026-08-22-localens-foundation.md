# LocalLens Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a reproducible Next.js 16 static-export foundation with bilingual routes, validated public configuration, Supabase browser boundary, accessibility-ready shell, and CI gates.

**Architecture:** The browser is a statically exported Next.js App Router application. Public content is generated at build time while authenticated and mutable behavior calls Supabase from client components or Edge Functions; no Next.js runtime server feature is allowed.

**Tech Stack:** Node.js 24, pnpm 11, Next.js 16.3.2, React 19.2.8, TypeScript 6.0.3, Tailwind CSS 4, Supabase JS 2.112.3, Zod 4.4.3, Vitest 4.1.11, Testing Library, Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-08-22-localens-mvp-design.md`

## Global Constraints

- Production code lives only in the `localens` repository; Lovable remains UI-only.
- Next.js uses `output: "export"`, `images.unoptimized: true`, and no SSR, ISR, middleware, Server Actions, or runtime Next.js API routes.
- Public locales are exactly `en` and `vi`; unknown locales return a static 404.
- Private runtime records will use query parameters, not unbounded dynamic route segments.
- All TypeScript uses strict mode and all new behavior follows RED-GREEN-REFACTOR.
- Secrets never use a `NEXT_PUBLIC_` prefix; only publishable Supabase and Turnstile values may enter the browser bundle.
- Commands must pass on Windows PowerShell and in Linux CI.

---

### Task 1: Reproducible static-export toolchain

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`
- Create: `.nvmrc`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `eslint.config.mjs`
- Create: `postcss.config.mjs`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `app/(root)/layout.tsx`
- Create: `app/(root)/page.tsx`
- Create: `app/globals.css`
- Create: `public/.gitkeep`
- Create: `pnpm-lock.yaml`

**Interfaces:**
- Produces: scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:run`, `test:e2e`, and `check`.
- Produces: an `out/` directory from `pnpm build`.

- [ ] **Step 1: Create package and runtime configuration**

Use these exact runtime dependencies:

```json
{
  "engines": { "node": ">=24 <25", "pnpm": ">=11 <12" },
  "dependencies": {
    "@supabase/supabase-js": "2.112.3",
    "next": "16.3.2",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "zod": "4.4.3"
  }
}
```

Add scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "playwright test",
    "check": "pnpm lint && pnpm typecheck && pnpm test:run && pnpm build"
  }
}
```

Use these exact dev dependencies:

```json
{
  "devDependencies": {
    "@playwright/test": "1.62.1",
    "@tailwindcss/postcss": "4.3.3",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.2",
    "@types/node": "26.2.0",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.4",
    "eslint": "10.9.0",
    "eslint-config-next": "16.3.2",
    "jsdom": "30.0.1",
    "tailwindcss": "4.3.3",
    "typescript": "6.0.3",
    "vite-tsconfig-paths": "6.1.1",
    "vitest": "4.1.11"
  }
}
```

- [ ] **Step 2: Configure static export**

`next.config.ts` must export:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
```

Use `@/*` mapped to the repository root, strict TypeScript, and a jsdom Vitest environment with `vitest.setup.ts` loading `@testing-library/jest-dom/vitest`.

- [ ] **Step 3: Create the minimal buildable application shell**

The `(root)` root layout sets `lang="en"`, imports `globals.css`, and exports LocalLens metadata. The root page renders a `main` landmark, an `h1` named `LocalLens`, and links to `/en/` and `/vi/`. It must not redirect because redirects require a runtime server. Do not create a top-level `app/layout.tsx`; localized routes need their own root layout so exported Vietnamese HTML has `lang="vi"`.

- [ ] **Step 4: Install and lock dependencies**

Run: `pnpm install`

Expected: exit 0 and a committed `pnpm-lock.yaml` with no peer dependency error.

- [ ] **Step 5: Verify the initial static export**

Run: `pnpm lint`

Expected: exit 0 with zero warnings.

Run: `pnpm typecheck`

Expected: exit 0.

Run: `pnpm build`

Expected: exit 0 and `out/index.html` exists.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .nvmrc tsconfig.json next.config.ts eslint.config.mjs postcss.config.mjs vitest.config.ts vitest.setup.ts app public
git commit -m "chore: scaffold Next.js static export"
```

### Task 2: Bilingual static route contract

**Files:**
- Create: `lib/i18n/config.ts`
- Create: `lib/i18n/dictionaries.ts`
- Create: `messages/en.json`
- Create: `messages/vi.json`
- Create: `app/[locale]/layout.tsx`
- Create: `app/[locale]/page.tsx`
- Create: `tests/unit/i18n/config.test.ts`
- Create: `tests/unit/i18n/dictionaries.test.ts`

**Interfaces:**
- Produces: `LOCALES`, `DEFAULT_LOCALE`, `Locale`, `isLocale(value)`, and `getDictionary(locale)`.
- Produces: static pages `/en/` and `/vi/` and static 404 behavior for all other locale segments.

- [ ] **Step 1: Write failing locale tests**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, LOCALES } from "@/lib/i18n/config";

describe("locale contract", () => {
  it("accepts only the two published locales", () => {
    expect(LOCALES).toEqual(["en", "vi"]);
    expect(DEFAULT_LOCALE).toBe("en");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("vi")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(1)).toBe(false);
  });
});
```

Run: `pnpm test:run tests/unit/i18n/config.test.ts`

Expected: FAIL because `@/lib/i18n/config` does not exist.

- [ ] **Step 2: Implement the locale type and guard**

```ts
export const LOCALES = ["en", "vi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale);
}
```

Run: `pnpm test:run tests/unit/i18n/config.test.ts`

Expected: PASS.

- [ ] **Step 3: Write failing dictionary tests**

Assert literal English and Vietnamese values for `home.title`, `home.subtitle`, `navigation.explore`, and `navigation.planTrip`. Assert that unsupported input is rejected by TypeScript rather than silently falling back.

Run: `pnpm test:run tests/unit/i18n/dictionaries.test.ts`

Expected: FAIL because dictionaries do not exist.

- [ ] **Step 4: Implement dictionaries and localized pages**

`getDictionary(locale)` returns the matching JSON module. The locale layout is a root layout containing `<html lang={locale}>` and `<body>`. It exports `generateStaticParams()` returning exactly `[{ locale: "en" }, { locale: "vi" }]`, exports `dynamicParams = false`, validates params with `isLocale`, and calls `notFound()` for invalid input. Localized pages render the translated literal headings and links.

Run: `pnpm test:run tests/unit/i18n`

Expected: PASS.

- [ ] **Step 5: Verify generated locale HTML**

Run: `pnpm build`

Expected: exit 0 and both `out/en/index.html` and `out/vi/index.html` exist.

- [ ] **Step 6: Commit**

```bash
git add lib/i18n messages app/[locale] tests/unit/i18n
git commit -m "feat: add bilingual static routes"
```

### Task 3: Validated browser environment and Supabase boundary

**Files:**
- Create: `.env.example`
- Create: `lib/env/public.ts`
- Create: `lib/supabase/client.ts`
- Create: `tests/unit/env/public.test.ts`
- Create: `tests/unit/supabase/client.test.ts`

**Interfaces:**
- Produces: `parsePublicEnv(source): PublicEnv`.
- Produces: `createBrowserSupabaseClient(env)` using only URL and publishable key.

- [ ] **Step 1: Write failing environment tests**

Test that valid HTTPS app/Supabase URLs and non-empty publishable/site keys return a normalized object. Test literal failures for missing key and non-HTTP URL.

Run: `pnpm test:run tests/unit/env/public.test.ts`

Expected: FAIL because `parsePublicEnv` does not exist.

- [ ] **Step 2: Implement environment validation**

Use Zod with exact keys:

```ts
{
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1)
}
```

`.env.example` contains safe placeholders only and documents that Stripe,
Gemini, Turnstile secret, Supabase service role, HMAC, and webhook secrets are
Edge Function secrets, never browser variables.

Run: `pnpm test:run tests/unit/env/public.test.ts`

Expected: PASS.

- [ ] **Step 3: Write the failing Supabase client boundary test**

Mock only `@supabase/supabase-js` network construction, then assert that the function passes the validated URL and publishable key and sets `persistSession: true`, `autoRefreshToken: true`, and `detectSessionInUrl: true`. Do not expose or accept a service-role parameter.

Run: `pnpm test:run tests/unit/supabase/client.test.ts`

Expected: FAIL because the factory does not exist.

- [ ] **Step 4: Implement the browser client factory**

Use `createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: ... })`. The module must not parse process environment at import time so tests and static builds remain deterministic.

Run: `pnpm test:run tests/unit/env tests/unit/supabase`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .env.example lib/env lib/supabase tests/unit/env tests/unit/supabase
git commit -m "feat: validate public Supabase configuration"
```

### Task 4: Accessible responsive application shell

**Files:**
- Create: `components/layout/site-header.tsx`
- Create: `components/layout/site-footer.tsx`
- Create: `components/i18n/locale-switcher.tsx`
- Create: `components/ui/service-status.tsx`
- Modify: `app/[locale]/layout.tsx`
- Modify: `app/globals.css`
- Create: `tests/components/layout/site-header.test.tsx`
- Create: `tests/components/ui/service-status.test.tsx`

**Interfaces:**
- Produces: keyboard-accessible header/navigation and locale switcher.
- Produces: `ServiceStatus` states `available | degraded | unavailable` without color-only meaning.

- [ ] **Step 1: Write failing header behavior tests**

Render the English header and assert a named navigation landmark, links for Explore, Fixed tours, Plan my trip, and Sign in, plus a language control linking to the equivalent Vietnamese path. Assert focusable links and visible text labels rather than test IDs.

Run: `pnpm test:run tests/components/layout/site-header.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 2: Implement the shell and design tokens**

Use semantic HTML and CSS custom properties for forest green brand, vermilion CTA, neutral surfaces, focus ring, spacing, and 44px minimum interactive size. The component consumes translated labels rather than containing hard-coded bilingual conditionals.

Run: `pnpm test:run tests/components/layout/site-header.test.tsx`

Expected: PASS.

- [ ] **Step 3: Write failing service-state tests**

Assert each state has an icon-hidden-from-assistive-tech plus a visible localized label, uses `role="status"` for degraded/unavailable, and never communicates state only through a CSS class.

Run: `pnpm test:run tests/components/ui/service-status.test.tsx`

Expected: FAIL because `ServiceStatus` does not exist.

- [ ] **Step 4: Implement service status and integrate the layout**

Implement the smallest typed component satisfying the tests. Add header, `main`, and footer to the locale layout, with a skip link as the first focusable element.

Run: `pnpm test:run tests/components`

Expected: PASS.

Run: `pnpm build`

Expected: exit 0 with English and Vietnamese pages exported.

- [ ] **Step 5: Commit**

```bash
git add components app/[locale]/layout.tsx app/globals.css tests/components
git commit -m "feat: add accessible LocalLens application shell"
```

### Task 5: CI and foundation acceptance

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `playwright.config.ts`
- Create: `tests/e2e/static-shell.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: a CI gate running install, lint, typecheck, unit/component tests, static build, and Playwright smoke tests.

- [ ] **Step 1: Write the failing static-shell E2E test**

The test opens `/en/` and `/vi/`, asserts the localized `h1`, asserts the primary navigation and skip link, then opens `/fr/` and asserts the static 404 page. Use Playwright's `webServer` with `pnpm dev` locally and a CI base URL override.

Run: `pnpm test:e2e tests/e2e/static-shell.spec.ts`

Expected: FAIL until Playwright and the web server configuration exist.

- [ ] **Step 2: Configure Playwright and make the smoke test pass**

Use Chromium, one retry only in CI, trace on first retry, and no screenshots on successful tests. Do not install or test WebKit/Firefox in the zero-cost MVP foundation.

Run: `pnpm exec playwright install chromium`

Run: `pnpm test:e2e tests/e2e/static-shell.spec.ts`

Expected: PASS for English, Vietnamese, and invalid-locale cases.

- [ ] **Step 3: Add GitHub Actions CI**

Use Ubuntu, Node 24, pnpm 11 with frozen lockfile, Playwright Chromium cache/install, and the exact sequence `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, `pnpm build`, `pnpm test:e2e`. No production secrets are required for foundation CI.

- [ ] **Step 4: Run the complete local gate**

Run: `pnpm check`

Expected: lint, typecheck, unit/component tests, and static export all pass.

Run: `pnpm test:e2e`

Expected: all smoke tests pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml playwright.config.ts tests/e2e package.json pnpm-lock.yaml
git commit -m "ci: enforce LocalLens foundation quality gates"
```
