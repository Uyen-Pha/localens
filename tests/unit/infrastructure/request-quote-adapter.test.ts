// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  mapAdminCustomRequest,
  mapCustomerCustomQuote,
  mapCustomerCustomRequest,
  toCreateCustomQuote,
  toReviewCustomRequest,
  toSubmitCustomRequest,
} from "@/lib/infrastructure/supabase/request-quote-adapter";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260823101000_requests_quotes.sql"),
  "utf8",
);
const foodPersistenceMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260828123000_food_plan_quote_snapshots.sql"),
  "utf8",
);
const pgTap = readFileSync(
  join(process.cwd(), "supabase", "tests", "database", "requests_quotes_test.sql"),
  "utf8",
);

const ids = {
  request: "00000000-0000-0000-0000-000000000801",
  plan: "00000000-0000-0000-0000-000000000802",
  owner: "00000000-0000-0000-0000-000000000803",
  quote: "00000000-0000-0000-0000-000000000804",
};

const requestRow = {
  id: ids.request,
  plan_id: ids.plan,
  revision_no: 3,
  status: "pending_review",
  submitted_at: "2026-08-24T10:00:00+07:00",
  updated_at: "2026-08-24T10:00:00+07:00",
};

const adminRequestRow = {
  ...requestRow,
  owner_user_id: ids.owner,
  latest_decision_at: null,
};

const quoteRow = {
  id: ids.quote,
  request_id: ids.request,
  status: "active",
  title: "Cho Lon food and heritage walk",
  amount_vnd_minor: "2500000",
  currency: "usd",
  amount_minor: "10000",
  policy: "Cancel up to 48 hours before the start.",
  valid_until: "2026-08-26T10:00:00+07:00",
  food_snapshot: [{
    vendor_id: "00000000-0000-0000-0000-000000000807",
    vendor_name_en: "Bình Tây noodle stall",
    vendor_name_vi: "Quầy mì Bình Tây",
    menu_item_id: "00000000-0000-0000-0000-000000000808",
    menu_item_name_en: "Signature noodle bowl",
    menu_item_name_vi: "Tô mì đặc trưng",
    quantity: 2,
    price_vnd_min: "35000",
    price_vnd_max: "45000",
    payment_mode: "pay_at_vendor",
    evidence_date: "2026-08-20",
  }],
  food_estimate_min_vnd: "70000",
  food_estimate_max_vnd: "90000",
  pay_at_vendor_min_vnd: "70000",
  pay_at_vendor_max_vnd: "90000",
};

describe("request and quote adapter contracts", () => {
  it("maps the three guarded RPC inputs without accepting authority or server-owned fields", () => {
    expect(toSubmitCustomRequest({ planId: ids.plan, revisionNo: 3 })).toEqual({
      ok: true,
      value: { planId: ids.plan, revisionNo: 3 },
    });
    expect(toReviewCustomRequest({
      requestId: ids.request,
      decision: "changes_requested",
      note: "Please adjust the afternoon stop.",
    })).toEqual({
      ok: true,
      value: { requestId: ids.request, decision: "changes_requested", note: "Please adjust the afternoon stop." },
    });
    expect(toCreateCustomQuote({
      requestId: ids.request,
      amountVndMinor: "2500000",
      checkoutCurrency: "usd",
      titleEn: "Cho Lon food and heritage walk",
      titleVi: "Đi bộ ẩm thực và di sản Chợ Lớn",
      policy: "Cancel up to 48 hours before the start.",
    })).toEqual({
      ok: true,
      value: {
        requestId: ids.request,
        amountVndMinor: "2500000",
        checkoutCurrency: "usd",
        titleEn: "Cho Lon food and heritage walk",
        titleVi: "Đi bộ ẩm thực và di sản Chợ Lớn",
        policy: "Cancel up to 48 hours before the start.",
      },
    });

    for (const invalid of [
      { planId: ids.plan, revisionNo: 3, actorUserId: ids.owner },
      { planId: ids.plan, revisionNo: 3, status: "approved" },
      { requestId: ids.request, decision: "approved", note: null, validUntil: "2026-08-26T10:00:00+07:00" },
      {
        requestId: ids.request,
        amountVndMinor: "2500000",
        checkoutCurrency: "usd",
        titleEn: "Title",
        titleVi: "Tiêu đề",
        policy: "Policy",
        fxVndPerUsd: "25000.00000000",
      },
    ]) {
      const result = "actorUserId" in invalid || "status" in invalid
        ? toSubmitCustomRequest(invalid as never)
        : "validUntil" in invalid
          ? toReviewCustomRequest(invalid as never)
          : toCreateCustomQuote(invalid as never);
      expect(result).toMatchObject({ ok: false, error: { code: "UNKNOWN_FIELD" } });
    }
  });

  it("enforces UUID, revision, decision, note, title, currency, and safe money boundaries", () => {
    expect(toSubmitCustomRequest({ planId: "not-a-uuid", revisionNo: 1 })).toMatchObject({ ok: false });
    expect(toSubmitCustomRequest({ planId: ids.plan, revisionNo: 0 })).toMatchObject({ ok: false });
    expect(toSubmitCustomRequest({ planId: ids.plan, revisionNo: 1.5 })).toMatchObject({ ok: false });
    expect(toReviewCustomRequest({ requestId: ids.request, decision: "draft", note: null } as never)).toMatchObject({ ok: false });
    expect(toReviewCustomRequest({ requestId: ids.request, decision: "changes_requested", note: "" })).toMatchObject({ ok: false });
    expect(toReviewCustomRequest({ requestId: ids.request, decision: "rejected", note: null })).toMatchObject({ ok: false });
    expect(toReviewCustomRequest({ requestId: ids.request, decision: "approved", note: "Approval note" })).toMatchObject({ ok: false });
    expect(toReviewCustomRequest({ requestId: ids.request, decision: "changes_requested", note: "x".repeat(1001) })).toMatchObject({ ok: false });
    expect(toReviewCustomRequest({ requestId: ids.request, decision: "rejected", note: "bad\ncontrol" })).toMatchObject({ ok: false });
    expect(toReviewCustomRequest({ requestId: ids.request, decision: "approved", note: 1 } as never)).toMatchObject({ ok: false });
    expect(toReviewCustomRequest({ requestId: ids.request, decision: "rejected", note: "bad\u0085control" })).toMatchObject({ ok: false });
    expect(toCreateCustomQuote({
      requestId: ids.request,
      amountVndMinor: "0",
      checkoutCurrency: "vnd",
      titleEn: "Title",
      titleVi: "Tiêu đề",
      policy: "Policy",
    })).toMatchObject({ ok: false });
    expect(toCreateCustomQuote({
      requestId: ids.request,
      amountVndMinor: "1",
      checkoutCurrency: "vnd",
      titleEn: "Title",
      titleVi: "Tiêu đề",
      policy: "Bad\u0085Policy",
    })).toMatchObject({ ok: false });
    expect(toCreateCustomQuote({
      requestId: ids.request,
      amountVndMinor: "01",
      checkoutCurrency: "vnd",
      titleEn: "Title",
      titleVi: "Tiêu đề",
      policy: "Policy",
    })).toMatchObject({ ok: false });
    expect(toCreateCustomQuote({
      requestId: ids.request,
      amountVndMinor: String(Number.MAX_SAFE_INTEGER + 1),
      checkoutCurrency: "vnd",
      titleEn: "Title",
      titleVi: "Tiêu đề",
      policy: "Policy",
    })).toMatchObject({ ok: false, error: { code: "UNSAFE_DB_INTEGER" } });
    expect(toCreateCustomQuote({
      requestId: ids.request,
      amountVndMinor: 2500000 as never,
      checkoutCurrency: "vnd",
      titleEn: "Title",
      titleVi: "Tiêu đề",
      policy: "Policy",
    })).toMatchObject({ ok: false });
    expect(toCreateCustomQuote({
      requestId: ids.request,
      amountVndMinor: "2500000",
      checkoutCurrency: "EUR" as never,
      titleEn: "Title",
      titleVi: "Tiêu đề",
      policy: "Policy",
    })).toMatchObject({ ok: false });
  });

  it("maps exact customer/admin request projections and the localized quote projection", () => {
    expect(mapCustomerCustomRequest(requestRow)).toEqual({
      ok: true,
      value: {
        id: ids.request,
        planId: ids.plan,
        revisionNo: 3,
        status: "pending_review",
        submittedAt: "2026-08-24T10:00:00+07:00",
        updatedAt: "2026-08-24T10:00:00+07:00",
      },
    });
    expect(mapAdminCustomRequest(adminRequestRow)).toEqual({
      ok: true,
      value: {
        id: ids.request,
        planId: ids.plan,
        revisionNo: 3,
        status: "pending_review",
        submittedAt: "2026-08-24T10:00:00+07:00",
        updatedAt: "2026-08-24T10:00:00+07:00",
        ownerUserId: ids.owner,
        latestDecisionAt: null,
      },
    });
    expect(mapCustomerCustomQuote(quoteRow)).toEqual({
      ok: true,
      value: {
        id: ids.quote,
        requestId: ids.request,
        status: "active",
        title: "Cho Lon food and heritage walk",
        amountVndMinor: "2500000",
        currency: "usd",
        amountMinor: "10000",
        policy: "Cancel up to 48 hours before the start.",
        validUntil: "2026-08-26T10:00:00+07:00",
        foodSnapshot: [{
          vendorId: "00000000-0000-0000-0000-000000000807",
          vendorNameEn: "Bình Tây noodle stall",
          vendorNameVi: "Quầy mì Bình Tây",
          menuItemId: "00000000-0000-0000-0000-000000000808",
          menuItemNameEn: "Signature noodle bowl",
          menuItemNameVi: "Tô mì đặc trưng",
          quantity: 2,
          priceVndMin: "35000",
          priceVndMax: "45000",
          paymentMode: "pay_at_vendor",
          evidenceDate: "2026-08-20",
        }],
        foodEstimateMinVnd: "70000",
        foodEstimateMaxVnd: "90000",
        payAtVendorMinVnd: "70000",
        payAtVendorMaxVnd: "90000",
      },
    });

    expect(mapCustomerCustomRequest({ ...requestRow, owner_user_id: ids.owner })).toMatchObject({ ok: false, error: { code: "UNKNOWN_FIELD" } });
    expect(mapAdminCustomRequest({ ...adminRequestRow, admin_note: "private" })).toMatchObject({ ok: false, error: { code: "UNKNOWN_FIELD" } });
    expect(mapCustomerCustomQuote({ ...quoteRow, fx_snapshot_id: "00000000-0000-0000-0000-000000000805" })).toMatchObject({ ok: false, error: { code: "UNKNOWN_FIELD" } });
    expect(mapCustomerCustomQuote({ ...quoteRow, amount_minor: "9007199254740992" })).toMatchObject({ ok: false, error: { code: "UNSAFE_DB_INTEGER" } });
    expect(mapCustomerCustomQuote({ ...quoteRow, valid_until: "2026-02-30T10:00:00+07:00" })).toMatchObject({ ok: false, error: { code: "INVALID_TIMESTAMP" } });
    expect(mapCustomerCustomQuote({ ...quoteRow, food_snapshot: [{ ...quoteRow.food_snapshot[0], payment_mode: "included_in_quote" }] })).toMatchObject({ ok: false });
    expect(mapCustomerCustomRequest({ ...requestRow, status: "checkout_pending" })).toMatchObject({ ok: false });
  });
});

describe("Task 8 SQL contract", () => {
  it("derives an immutable quote food snapshot from the selected revision and keeps pay-at-vendor costs out of payable amount", () => {
    expect(foodPersistenceMigration).toMatch(/food_snapshot jsonb NOT NULL/);
    expect(foodPersistenceMigration).toMatch(/food_estimate_min_vnd bigint/);
    expect(foodPersistenceMigration).toMatch(/pay_at_vendor_max_vnd bigint/);
    expect(foodPersistenceMigration).toMatch(/CREATE OR REPLACE FUNCTION private\.create_custom_quote/);
    expect(foodPersistenceMigration).toMatch(/FROM jsonb_array_elements\(revision_row\.result_json->'items'\)/);
    expect(foodPersistenceMigration).toMatch(/paymentMode.*pay_at_vendor/);
    expect(foodPersistenceMigration).toMatch(/food quote snapshot source unavailable/);
    expect(foodPersistenceMigration).toMatch(/food quote total mismatch/);
    expect(foodPersistenceMigration).toMatch(/quote amount must equal LocalLens payable amount/);
    expect(foodPersistenceMigration).toMatch(/items\.available\s+IS\s+TRUE/);
    expect(foodPersistenceMigration).toMatch(/food_total_material boolean/);
    expect(foodPersistenceMigration).toMatch(/food_total_keys constant text\[\]/);
    expect(foodPersistenceMigration).toMatch(/IS DISTINCT FROM localens_payable/);
    expect(foodPersistenceMigration).toMatch(/OLD\.food_snapshot IS DISTINCT FROM NEW\.food_snapshot/);
    expect(foodPersistenceMigration).toMatch(/food_snapshot,[\s\S]*food_estimate_min_vnd/);
    expect(foodPersistenceMigration).toMatch(/CREATE OR REPLACE VIEW public\.customer_custom_quotes_v/);
  });

  it("defines immutable requests, append-only events, and server-owned quotes", () => {
    expect(migration).toMatch(/CREATE TABLE public\.custom_requests/);
    expect(migration).toMatch(/CREATE TABLE private\.custom_request_events/);
    expect(migration).toMatch(/CREATE TABLE public\.custom_quotes/);
    expect(migration).toMatch(/plan_id uuid NOT NULL REFERENCES public\.trip_plans\(id\) ON DELETE RESTRICT/);
    expect(migration).toMatch(/revision_id uuid NOT NULL REFERENCES public\.trip_plan_revisions\(id\) ON DELETE RESTRICT/);
    expect(migration).toMatch(/UNIQUE INDEX custom_requests_one_active_per_plan[\s\S]*status IN \('draft', 'pending_review', 'changes_requested', 'approved'\)/);
    expect(migration).toMatch(/UNIQUE INDEX custom_quotes_one_sellable_per_request[\s\S]*status IN \('active', 'checkout_pending'\)/);
    expect(migration).toMatch(/valid_until[\s\S]*created_at[\s\S]*48 hours/);
    expect(migration).toMatch(/checkout_amount_minor[\s\S]*amount_vnd_minor/);
    expect(migration).toMatch(/amount_vnd_minor bigint NOT NULL CHECK \(amount_vnd_minor BETWEEN 1 AND 9007199254740991\)/);
    expect(migration).toMatch(/fx_vnd_per_usd numeric\(20,8\)/);
    expect(migration).toMatch(/revision_id uuid NOT NULL REFERENCES public\.trip_plan_revisions\(id\) ON DELETE RESTRICT,[\s\S]*revision_no integer NOT NULL/);
    expect(migration).toMatch(/FOREIGN KEY \(revision_id, plan_id, revision_no\)[\s\S]*REFERENCES public\.trip_plan_revisions\(id, plan_id, revision_no\)/);
    expect(migration).toMatch(/FOREIGN KEY \(plan_id, owner_user_id\)[\s\S]*REFERENCES public\.trip_plans\(id, owner_user_id\)/);
    expect(migration).toMatch(/FOREIGN KEY \(revision_id, revision_no\)[\s\S]*REFERENCES public\.trip_plan_revisions\(id, revision_no\)/);
    expect(migration).toMatch(/event_type IN \([\s\S]*request_submitted[\s\S]*request_changes_requested[\s\S]*request_approved[\s\S]*request_rejected/);
    expect(migration).toMatch(/OLD\.status = 'changes_requested'[\s\S]*NEW\.status = 'pending_review'/);
    expect(migration).toMatch(/request_row\.owner_user_id IS DISTINCT FROM actor_user_id/);
    expect(migration).toMatch(/request_row\.owner_user_id IS DISTINCT FROM actor_user_id[\s\S]*p_revision_no <= request_row\.revision_no/);
    expect(migration).toMatch(/status = 'draft'[\s\S]*status = 'pending_review'/);
    expect(migration).toMatch(/OLD\.id IS DISTINCT FROM NEW\.id[\s\S]*custom request facts are immutable/);
    expect(migration).toMatch(/CREATE ROLE localens_request_customer_rpc_owner NOLOGIN NOINHERIT NOBYPASSRLS/);
    expect(migration).toMatch(/CREATE ROLE localens_request_admin_rpc_owner NOLOGIN NOINHERIT NOBYPASSRLS/);
    expect(migration).toMatch(/CREATE ROLE localens_request_guard_owner NOLOGIN NOINHERIT NOBYPASSRLS/);
    expect(migration).toMatch(/localens_request_customer_rpc_owner[\s\S]*localens_request_admin_rpc_owner[\s\S]*localens_request_guard_owner/);
    expect(migration).toMatch(/localens_request_customer_rpc_owner[\s\S]*localens_request_admin_rpc_owner[\s\S]*localens_request_guard_owner[\s\S]*protected_roles constant text\[\]/);
    expect(migration).toMatch(/ALTER ROLE localens_request_customer_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS/);
    expect(migration).toMatch(/ALTER ROLE localens_request_admin_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS/);
    expect(migration).toMatch(/ALTER ROLE localens_request_guard_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS/);
    expect(migration).toMatch(/ALTER ROLE localens_guest_executor NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION LOGIN NOBYPASSRLS/);
    expect(migration).toMatch(/ALTER ROLE localens_quota_executor NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION LOGIN NOBYPASSRLS/);
    expect(migration).toMatch(/GRANT UPDATE \(revision_id, revision_no, status, submitted_at, updated_at\)[\s\S]*ON TABLE public\.custom_requests TO localens_request_customer_rpc_owner/);
    expect(migration).toMatch(/GRANT UPDATE \(status, latest_decision_at, updated_at\)[\s\S]*ON TABLE public\.custom_requests TO localens_request_admin_rpc_owner/);
    expect(migration).toMatch(/GRANT UPDATE \(id\) ON TABLE public\.trip_plans TO localens_request_customer_rpc_owner/);
    expect(migration).toMatch(/GRANT UPDATE \(id\) ON TABLE public\.trip_plan_revisions TO localens_request_customer_rpc_owner/);
    expect(migration).toMatch(/GRANT UPDATE \(id\) ON TABLE public\.trip_plans TO localens_request_admin_rpc_owner/);
    expect(migration).toMatch(/GRANT UPDATE \(id\) ON TABLE public\.trip_plan_revisions TO localens_request_admin_rpc_owner/);
    expect(migration).toMatch(/GRANT UPDATE \(id\) ON TABLE public\.custom_quotes TO localens_request_admin_rpc_owner/);
    expect(migration).toMatch(/GRANT UPDATE \(id\) ON TABLE public\.fx_snapshots TO localens_request_admin_rpc_owner/);
    expect(migration).toMatch(/CREATE POLICY trip_plans_request_customer_rpc_lock ON public\.trip_plans[\s\S]*FOR UPDATE TO localens_request_customer_rpc_owner/);
    expect(migration).toMatch(/CREATE POLICY trip_plan_revisions_request_customer_rpc_lock ON public\.trip_plan_revisions[\s\S]*FOR UPDATE TO localens_request_customer_rpc_owner/);
    expect(migration).toMatch(/CREATE POLICY trip_plans_request_admin_rpc_lock ON public\.trip_plans[\s\S]*FOR UPDATE TO localens_request_admin_rpc_owner/);
    expect(migration).toMatch(/CREATE POLICY trip_plan_revisions_request_admin_rpc_lock ON public\.trip_plan_revisions[\s\S]*FOR UPDATE TO localens_request_admin_rpc_owner/);
    expect(migration).toMatch(/CREATE POLICY fx_snapshots_request_admin_rpc_lock ON public\.fx_snapshots[\s\S]*FOR UPDATE TO localens_request_admin_rpc_owner/);
    expect(migration).toMatch(/reject_trip_plan_id_mutation/);
    expect(migration).toMatch(/OLD\.id IS DISTINCT FROM NEW\.id/);
    expect(migration).toMatch(/CREATE TRIGGER trip_plans_request_id_immutable[\s\S]*BEFORE UPDATE OF id ON public\.trip_plans/);
    expect(migration).toMatch(/OLD\.status = 'active'[\s\S]*NEW\.status IN \([\s\S]*'checkout_pending'[\s\S]*'expired'[\s\S]*'revoked'/);
    expect(migration).toMatch(/OLD\.status = 'checkout_pending'[\s\S]*NEW\.status IN \([\s\S]*'accepted'[\s\S]*'active'[\s\S]*'expired'[\s\S]*'revoked'/);
    expect(migration).toMatch(/custom quote state transition is invalid/);
    expect(migration).toMatch(/fx_row\.observed_at > authority_time[\s\S]*fx_row\.observed_at < authority_time - interval '7 days'/);
    const adminSourceGrant = migration.match(/GRANT SELECT ON TABLE public\.trip_plans, public\.trip_plan_revisions,[\s\S]*?TO localens_request_admin_rpc_owner;/)?.[0] ?? "";
    expect(adminSourceGrant).not.toContain("catalog_snapshot_places");
    expect(adminSourceGrant).not.toContain("catalog_snapshots");
    expect(adminSourceGrant).not.toContain("travel_snapshots");
    expect(migration).toMatch(/CREATE POLICY custom_request_events_customer_rpc_owner_insert[\s\S]*FOR INSERT TO localens_request_customer_rpc_owner/);
    expect(migration).toMatch(/CREATE POLICY custom_request_events_admin_rpc_owner_insert[\s\S]*FOR INSERT TO localens_request_admin_rpc_owner/);
    expect(migration).not.toMatch(/CREATE POLICY custom_request_events_customer_rpc_owner_all/);
    expect(migration).not.toMatch(/GRANT SELECT, INSERT ON TABLE private\.custom_request_events/);
    expect(migration).not.toMatch(/CREATE POLICY catalog_snapshots_request_customer_rpc_select/);
    expect(migration).not.toMatch(/CREATE POLICY travel_snapshots_request_customer_rpc_select/);
    expect(migration).not.toMatch(/CREATE POLICY fx_snapshots_request_customer_rpc_select/);
    expect(migration).not.toMatch(/CREATE POLICY catalog_snapshots_request_admin_rpc_select/);
    expect(migration).not.toMatch(/CREATE POLICY travel_snapshots_request_admin_rpc_select/);
    expect(migration).toMatch(/ALTER TABLE public\.custom_requests ENABLE ROW LEVEL SECURITY[\s\S]*ALTER TABLE public\.custom_requests FORCE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/ALTER TABLE private\.custom_request_events ENABLE ROW LEVEL SECURITY[\s\S]*ALTER TABLE private\.custom_request_events FORCE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/ALTER TABLE public\.custom_quotes ENABLE ROW LEVEL SECURITY[\s\S]*ALTER TABLE public\.custom_quotes FORCE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/custom_request_events_append_only_truncate/);
    expect(migration).toMatch(/custom_quotes_append_only_truncate/);
  });

  it("defines guarded wrappers, fixed search paths, explicit grants, and safe projections", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.submit_custom_request\(\s*plan_id uuid,\s*revision_no integer\s*\)[\s\S]*auth\.uid\(\)/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.review_custom_request\(\s*request_id uuid,\s*decision public\.request_status,\s*note text\s*\)/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.create_custom_quote\([\s\S]*amount_vnd_minor bigint[\s\S]*checkout_currency public\.checkout_currency/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION private\.record_request_quote_audit_event/);
    expect(migration).toMatch(/ALTER FUNCTION private\.record_request_quote_audit_event\([^;]+ OWNER TO localens_identity_rpc_owner/);
    expect(migration).toMatch(/REVOKE INSERT ON TABLE private\.audit_events FROM localens_request_customer_rpc_owner, localens_request_admin_rpc_owner/);
    expect(migration).toMatch(/ALTER TABLE public\.profiles[\s\S]*ADD COLUMN IF NOT EXISTS language public\.locale NOT NULL DEFAULT 'en'/);
    expect(migration).toMatch(/owners\.language[\s\S]*title_vi[\s\S]*title_en/);
    expect(migration).not.toMatch(/auth\.jwt\(\)|request\.jwt\.claims|request\.headers/);
    expect(migration).toMatch(/environment = 'demo'[\s\S]*is_demo = true|is_demo = true[\s\S]*environment = 'demo'/);
    expect(migration).toMatch(/interval '7 days'/);
    expect(migration).toMatch(/ceil\(p_amount_vnd_minor::numeric \* 100 \/ fx_row\.vnd_per_usd/);
    expect(migration).toMatch(/created_at, valid_until|created_at[\s\S]*authority_time/);
    expect(migration).toMatch(/created_quote\.checkout_amount_minor/);
    expect(migration).toMatch(/title_en text NOT NULL CHECK [\s\S]*cntrl/);
    expect(migration).toMatch(/title_vi text NOT NULL CHECK [\s\S]*cntrl/);
    expect(migration).toMatch(/policy text NOT NULL CHECK [\s\S]*cntrl/);
    expect(migration).toMatch(/title_en text NOT NULL CHECK \(title_en = btrim\(title_en\)/);
    expect(migration).toMatch(/title_vi text NOT NULL CHECK \(title_vi = btrim\(title_vi\)/);
    expect(migration).toMatch(/policy text NOT NULL CHECK \(policy = btrim\(policy\)/);
    expect(migration).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = ''/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.(?:submit_custom_request|review_custom_request|create_custom_quote)/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.submit_custom_request[\s\S]*TO authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.review_custom_request[\s\S]*TO authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_custom_quote[\s\S]*TO authenticated/);
    expect(migration).toMatch(/SET search_path = ''[\s\S]*CREATE OR REPLACE FUNCTION public\.submit_custom_request/);
    expect(migration).toMatch(/CREATE OR REPLACE VIEW public\.customer_custom_requests_v/);
    expect(migration).toMatch(/CREATE OR REPLACE VIEW public\.admin_custom_request_queue_v/);
    expect(migration).toMatch(/CREATE OR REPLACE VIEW public\.customer_custom_quotes_v/);
    const views = migration.slice(migration.indexOf("CREATE OR REPLACE VIEW public.customer_custom_requests_v"), migration.indexOf("-- Task 8 RPC owners"));
    expect(views).not.toMatch(/SELECT \*/);
    expect(migration).toMatch(/admin_note|note/);
    expect(migration).toMatch(/request_submitted|request_changes_requested|request_approved|request_rejected|quote_created/);
  });

  it("contains the executable pgTAP contract with a mechanically exact plan", () => {
    expect(pgTap).toMatch(/BEGIN;/);
    expect(pgTap).toMatch(/SELECT plan\(\d+\);/);
    const assertions = pgTap.match(/^SELECT (?:ok|is|isnt|like|unlike|throws_ok|has_table_privilege|has_function_privilege)\(/gim) ?? [];
    const planned = Number(pgTap.match(/SELECT plan\((\d+)\);/)?.[1]);
    expect(assertions.length).toBe(planned);
    expect(pgTap).toMatch(/SET LOCAL ROLE authenticated/);
    expect(pgTap).toMatch(/hostile search_path|search_path/i);
    expect(pgTap).toMatch(/pg_catalog\.pg_attribute[\s\S]*pg_catalog\.pg_attrdef[\s\S]*pg_get_expr\(defs\.adbin, defs\.adrelid\)\s*~[\s\S]*48 hours[\s\S]*48:00:00[\s\S]*created_at/);
    expect(pgTap).toMatch(/one active request|one sellable quote/i);
  });
});
