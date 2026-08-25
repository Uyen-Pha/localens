// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  mapAdminAuditEvent,
  mapAdminContentDraft,
  mapPublishedContent,
  toContentDraftRpcArgs,
  toContentDraft,
} from "@/lib/infrastructure/supabase/content-contracts";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260823105000_content_audit.sql"),
  "utf8",
);
const pgTap = readFileSync(
  join(process.cwd(), "supabase", "tests", "database", "content_audit_test.sql"),
  "utf8",
);

const ids = {
  draft: "00000000-0000-0000-0000-000000001201",
  release: "00000000-0000-0000-0000-000000001202",
  actor: "00000000-0000-0000-0000-000000001203",
  audit: "00000000-0000-0000-0000-000000001204",
  correlation: "00000000-0000-0000-0000-000000001205",
};

const attribution = {
  imageUrl: "https://images.example.org/market.jpg",
  sourceUrl: "https://example.org/market",
  creator: "LocalLens editorial",
  license: "CC BY 4.0",
};

const draftInput = {
  locale: "en" as const,
  slug: "cho-lon-market",
  title: "Cho Lon Market",
  description: "A short guide to a traditional market.",
  body: "Visit the market with a local guide.",
  sourceUrls: ["https://example.org/market"],
  verifiedAt: "2026-08-24",
  imageAttributions: [attribution],
};

const adminRow = {
  id: ids.draft,
  locale: "en",
  slug: "cho-lon-market",
  title: "Cho Lon Market",
  description: "A short guide to a traditional market.",
  body: "Visit the market with a local guide.",
  source_urls: ["https://example.org/market"],
  verified_at: "2026-08-24",
  image_attributions: [attribution],
  status: "draft",
  updated_at: "2026-08-24T08:00:00.000Z",
};

const publicRow = {
  release_id: ids.release,
  locale: "en",
  slug: "cho-lon-market",
  title: "Cho Lon Market",
  description: "A short guide to a traditional market.",
  body: "Visit the market with a local guide.",
  source_urls: ["https://example.org/market"],
  verified_at: "2026-08-24",
  image_attributions: [attribution],
  published_at: "2026-08-24T08:00:00.000Z",
};

const auditRow = {
  id: ids.audit,
  event_type: "content_published",
  actor_user_id: ids.actor,
  actor_role: "admin",
  target_type: "content_release",
  target_id: ids.release,
  from_state: "publishing",
  to_state: "published",
  correlation_id: ids.correlation,
  metadata: { source: "build", is_demo: true },
  created_at: "2026-08-24T08:00:00.000Z",
};

describe("content contract adapters", () => {
  it("accepts only sanitized bilingual draft input and strips no server authority", () => {
    expect(toContentDraft(draftInput)).toEqual({ ok: true, value: draftInput });
    expect(toContentDraftRpcArgs(draftInput)).toEqual({
      ok: true,
      value: {
        p_locale: "en",
        p_slug: "cho-lon-market",
        p_title: "Cho Lon Market",
        p_description: "A short guide to a traditional market.",
        p_body: "Visit the market with a local guide.",
        p_source_urls: ["https://example.org/market"],
        p_verified_at: "2026-08-24",
        p_image_attributions: [attribution],
      },
    });
    expect(toContentDraft({ ...draftInput, id: ids.draft } as never)).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_FIELD" },
    });
    expect(toContentDraftRpcArgs({ ...draftInput, createdBy: ids.actor })).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_FIELD" },
    });
    expect(toContentDraft({ ...draftInput, sourceUrls: ["http://example.org/source"] })).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(toContentDraft({ ...draftInput, imageAttributions: [{ ...attribution, imageUrl: "https://images.example.org/a#fragment" }] })).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
  });

  it("maps exact admin, public, and audit projections with canonical field names", () => {
    expect(mapAdminContentDraft(adminRow)).toEqual({
      ok: true,
      value: {
        id: ids.draft,
        locale: "en",
        slug: "cho-lon-market",
        title: "Cho Lon Market",
        description: "A short guide to a traditional market.",
        body: "Visit the market with a local guide.",
        sourceUrls: ["https://example.org/market"],
        verifiedAt: "2026-08-24",
        imageAttributions: [attribution],
        status: "draft",
        updatedAt: "2026-08-24T08:00:00.000Z",
      },
    });
    expect(mapPublishedContent(publicRow)).toEqual({
      ok: true,
      value: {
        releaseId: ids.release,
        locale: "en",
        slug: "cho-lon-market",
        title: "Cho Lon Market",
        description: "A short guide to a traditional market.",
        body: "Visit the market with a local guide.",
        sourceUrls: ["https://example.org/market"],
        verifiedAt: "2026-08-24",
        imageAttributions: [attribution],
        publishedAt: "2026-08-24T08:00:00.000Z",
      },
    });
    expect(mapAdminAuditEvent(auditRow)).toEqual({
      ok: true,
      value: {
        id: ids.audit,
        eventType: "content_published",
        actorUserId: ids.actor,
        actorRole: "admin",
        targetType: "content_release",
        targetId: ids.release,
        fromState: "publishing",
        toState: "published",
        correlationId: ids.correlation,
        metadata: { source: "build", is_demo: true },
        createdAt: "2026-08-24T08:00:00.000Z",
      },
    });
  });

  it("rejects extras, unsafe URLs, invalid dates, control characters, and unsafe audit metadata", () => {
    expect(mapAdminContentDraft({ ...adminRow, body_html: "<script>alert(1)</script>" })).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_FIELD" },
    });
    expect(mapPublishedContent({ ...publicRow, status: "published" })).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_FIELD" },
    });
    expect(mapPublishedContent({ ...publicRow, verified_at: "2026-02-30" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(mapAdminAuditEvent({ ...auditRow, metadata: { note: "private" } })).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(mapAdminAuditEvent({ ...auditRow, actor_user_id: null })).toMatchObject({ ok: true });
    expect(mapAdminAuditEvent({ ...auditRow, actor_role: null })).toMatchObject({ ok: true });
  });
});

describe("Task 12 SQL contract", () => {
  it("defines immutable drafts, release copies, one publishing release, and a singleton live pointer", () => {
    expect(migration).toMatch(/CREATE TABLE public\.content_drafts/);
    expect(migration).toMatch(/CREATE TABLE private\.content_release_copies/);
    expect(migration).toMatch(/CREATE TABLE public\.seo_releases/);
    expect(migration).toMatch(/CREATE TABLE private\.seo_build_capabilities/);
    expect(migration).toMatch(/CREATE TABLE private\.seo_live_pointer/);
    expect(migration).toMatch(/UNIQUE INDEX seo_releases_one_publishing[\s\S]*status = 'publishing'/);
    expect(migration).not.toMatch(/seo_releases_one_published/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.publish_seo\(p_source_commit text, p_build_id text\)/);
    expect(migration).toMatch(/nonce_hash bytea NOT NULL/);
    expect(migration).toMatch(/read_scope text NOT NULL/);
    expect(migration).toMatch(/consumed_at timestamptz/);
    expect(migration).toMatch(/release_id uuid NOT NULL REFERENCES public\.seo_releases\(id\) ON DELETE RESTRICT/);
    expect(migration).toMatch(/source_commit text NOT NULL/);
    expect(migration).toMatch(/artifact_hash text CHECK \(artifact_hash IS NULL OR artifact_hash/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.upsert_content_draft\([\s\S]*p_locale public\.locale[\s\S]*p_image_attributions jsonb/);
    expect(migration).toMatch(/private\.assert_content_admin\(\)/);
    expect(migration).toMatch(/ON CONFLICT ON CONSTRAINT content_drafts_locale_slug_key DO UPDATE/);
    expect(migration).toMatch(/RETURNING drafts\.id, drafts\.locale, drafts\.slug, drafts\.title/);
    expect(migration).not.toMatch(/SET ROLE|service_role/i);
  });

  it("enforces source and attribution completeness and safe publish/finalize transitions", () => {
    expect(migration).toMatch(/source_urls jsonb NOT NULL/);
    expect(migration).toMatch(/image_attributions jsonb NOT NULL/);
    expect(migration).toMatch(/complete.*en.*vi|en.*vi.*complete/i);
    expect(migration).toMatch(/https:\/\//);
    expect(migration).toMatch(/content_publish_started[\s\S]*content_published[\s\S]*content_publish_failed/);
    expect(migration).toMatch(/assert_content_json_safe[\s\S]*content_provenance_is_allowlisted\(NEW\.source_urls, NEW\.image_attributions\)/);
    expect(migration).toMatch(/FOR UPDATE[\s\S]*nonce_hash[\s\S]*consumed_at/);
    expect(migration).toMatch(/previous.*published|published.*active|prior.*published/i);
    expect(migration).toMatch(/ON CONFLICT \(id\) DO UPDATE[\s\S]*release_id = EXCLUDED\.release_id/);
    expect(migration).not.toMatch(/'archived'::public\.content_status/);
    expect(migration).toMatch(/purpose = 'approved_source'/);
    expect(migration).toMatch(/failure_code IS DISTINCT FROM p_failure_code|failure_code = p_failure_code/);
    expect(migration).toMatch(/publishing[\s\S]*FOR UPDATE|FOR UPDATE[\s\S]*publishing/i);
    expect(migration).toMatch(/URLs are provenance links|never fetch/i);
  });

  it("exposes strict admin/public/audit projections without build facts", () => {
    expect(migration).toMatch(/CREATE OR REPLACE VIEW public\.admin_content_drafts_v/);
    expect(migration).toMatch(/CREATE OR REPLACE VIEW public\.published_content_release_v/);
    expect(migration).toMatch(/CREATE OR REPLACE VIEW public\.admin_audit_events_v/);
    expect(migration).toMatch(/security_barrier\s*=\s*true/i);
    expect(migration).not.toMatch(/published_content_release_v[\s\S]{0,500}build_id/);
    expect(migration).not.toMatch(/published_content_release_v[\s\S]{0,500}nonce/);
    expect(migration).toMatch(/REVOKE ALL ON TABLE private\.content_release_copies, private\.seo_build_capabilities/);
  });

  it("contains executable pgTAP with an exact assertion plan and hostile path coverage", () => {
    expect(pgTap).toMatch(/BEGIN;/);
    expect(pgTap).toMatch(/SELECT plan\(\d+\);/);
    const assertions = pgTap.match(/^SELECT (?:ok|is|isnt|like|unlike|throws_ok|lives_ok|has_table_privilege|has_function_privilege)\(/gim) ?? [];
    const planned = Number(pgTap.match(/SELECT plan\((\d+)\);/)?.[1]);
    expect(assertions.length).toBe(planned);
    expect(pgTap).toMatch(/search_path/i);
    expect(pgTap).toMatch(/nonce|capabilit/i);
    expect(pgTap).toMatch(/previous.*published|published.*failed/i);
  });
});
