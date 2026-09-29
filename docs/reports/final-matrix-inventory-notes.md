# Final matrix inventory notes

Analysis snapshot: 2026-09-29. Scope: read-only source/catalog inspection; this report is the only file created. No Git commands, database writes, SQL edits, or manifest edits were performed. The concurrent permissions implementation remains with its owning agent.

## Evidence boundary

- Source scan tip: `20260929030000_reviewed_rpc_permissions.sql`; pending 20260929040000 was not included. Recompute after that migration lands.
- Ran `node scripts/check-supabase-artifacts.mjs` without write options: failed. Current calculated explicit grants: 765; declared manifest: 695. Dynamic policy definitions: 45. Do not stamp these as final post-040000 counts.
- Queried `supabase_db_localens-release-20260929-verified` using `BEGIN READ ONLY`, catalog SELECTs, COMMIT. No application data was queried.
- Migration-history relation `supabase_migrations.schema_migrations` does not exist. Do not assert a migration version from container name. Live reviewed functions still belong to postgres without 5s timeout; reviewed tables still lack FORCE RLS and new reviewed policies. Source 030000 explicitly changes those facts, so live catalog is NOT final candidate-state evidence.

## Exact missing inventory

33 function names/signatures absent from the matrix: 27 DEFINER and 6 INVOKER. The JSON below gives every exact identity, observed mode, owner, settings, ACL and destination. Public trigger `public.reviewed_payment_sync()` belongs in internal inventory, not browser RPC inventory. Public maintenance `public.reviewed_demo_expire()` requires explicit maintenance-only exposure (030000 grants postgres); do not invent authenticated access to satisfy nonempty reader roles.

Missing tables and candidate policies through 030000:

| Table | Policies | FORCE RLS |
| --- | --- | --- |
| public.reviewed_demo_departures | reviewed_departures_read; reviewed_rpc_departures; reviewed_rpc_departure_lock | true in source 030000; false live |
| public.reviewed_demo_bookings | reviewed_bookings_own_read; reviewed_rpc_select; reviewed_rpc_insert; reviewed_rpc_update | true in source 030000; false live |
| private.guide_demo_schedule | guide_demo_schedule_projection_select | true live |

All three observed table owners are postgres. Add accurate exposure/reader/grant descriptions from ordered SQL; do not copy table ownership into RPC ownership. Add the localens_reviewed_rpc_owner role profile from 030000 (NOLOGIN/NOBYPASSRLS and validated membership), plus any new owner profiles actually introduced by 040000.

Four observed policyless tables: research_demo_catalog_versions, research_demo_places, research_demo_stops, research_demo_revision_links (all private). RLS is enabled on all; FORCE RLS is true on the first three and false on revision_links. Empty policies means default deny for roles subject to RLS, not universal denial: superuser/BYPASSRLS still bypass, and unforced owners can bypass. A proposed `policyMode: "deny-all"` is valid only while the FINAL policy set stays empty. Recheck after 040000; new owner policies mean ordinary policy inventory instead. Do not create permissive placeholder policies or mark revision_links forceRls=true without SQL evidence.

## Minimal checker corrections, preserving strictness and SQL history

Controller update received after the initial scan: exact CREATE-signature and security-mode discovery has now been implemented in databaseInventory. Item 2 below records the initial diagnosis, not an outstanding request to duplicate that fix. Remaining matrix decisions: explicit invoker owner exceptions, policyless deny-all representation, and reconciling the final 040000 snapshot.

Suggested matrix fields (proposal names, adapt to controller schema): `functionSecurityModes` keyed by exact normalized signature; `invokerOwnerExceptions` keyed by exact signature with `{ owner, reason }`; and per-table `policyMode: "deny-all"` with `policies: []`. An invoker exception must require matching source INVOKER mode and exact actual owner; never exempt a DEFINER from owner/timeout/search_path rules. The six missing INVOKER entries below currently have owner postgres and can each receive an explicit exception if 040000 leaves ownership unchanged. Ten existing INVOKER entries already have named owners and need mode classification, not a postgres exception. Deny-all requires an actually empty final policy set and verified RLS/FORCE RLS; do not exempt all empty arrays globally.

1. **Unify lexical source of truth.** In `databaseInventory` (around lines 515-607), object, owner, policy and view regexes run over raw SQL; grants/timeout use masked top-level statements. Raw scanning admits comments, strings and conditional DO bodies as facts. Reuse lexSql/splitStatements for top-level inventory. For known DO forms, implement a narrowly validated literal expansion and fail closed on unsupported control flow; never count arbitrary dynamic text as executed DDL.
2. **Build signatures from CREATE, not OWNER.** `functionSignatures` currently comes only from ALTER FUNCTION ... OWNER (around 535, 562). Thus 23 of these 33 missing functions are absent from exact-signature inventory even though CREATE exists. Populate a signature-keyed state from CREATE/REPLACE, track owner independently, and preserve unaffected overloads on DROP of one signature. Normalize type aliases (timestamptz versus timestamp with time zone, schema-qualified user types) without conflating quoted identifiers. Use token-balanced arguments/defaults, not first-closing-parenthesis regex. Keep bidirectional matrix comparison.
3. **Separate invoker and definer rules.** Internal validation (around 663) labels every function an internal definer, and generated Markdown claims all internal functions need named safe definer owners and timeout. Introduce explicit per-signature securityMode metadata (or a separate exact invoker collection). Require matching actual mode; apply privileged-owner/search_path/timeout rules to DEFINER, keep precise ACL, exposure and identity validation for INVOKER. Do not change SQL to DEFINER merely to match documentation. The JSON includes ten already-inventoried INVOKER functions needing accurate classification in addition to the six missing INVOKER entries.
4. **Resolve DO ambiguity without weakening hardening.** The scanner reports private.research_demo_actor(boolean) missing 5s timeout, but live pg_proc has statement_timeout=5s and owner localens_identity_rpc_owner. Explicit ALTER lines 318-320 in 020000 reside inside a DO block: raw owner parsing accepts them while applyDefinerState masks the block. This is an unproven-static-state finding, not proof of missing live hardening. Prefer a narrow proven DO recognizer, or the other agent's forward-only explicit top-level assertions in the new migration. Preserve older SQL. Do not globally waive later-definer timeout checks.
5. **Support explicit policyless deny-all.** Replace the unconditional nonempty-policies check (around 628) with an explicit deny-all declaration, exact empty actual set, verified enabled RLS, required FORCE RLS, and an exposure/owner-bypass explanation. Ordinary tables must still enumerate exact policy names. revision_links FORCE deficiency is real in this snapshot and belongs to the permissions agent, not a parser exemption.
6. **Keep policy manifest scope honest.** policies-manifest.json currently describes only dynamic catalog/tour policies, not all policies. policyDefinitions is append-only dynamic expansion; static policy predicates and later DROP/ALTER are not modeled. If retaining that manifest scope, label it clearly. For a complete semantic inventory, maintain a keyed ordered CREATE/ALTER/DROP policy state, including command, roles, permissive/restrictive, USING and WITH CHECK; do not just append more names or delete strict comparison.
7. **Keep explicit-grant inventory distinct from effective ACLs.** Current grants model excludes DO grants/default privileges/implicit owner rights and role inheritance. Reconcile against ordered SQL after pending permissions changes; use live ACLs only from the matching candidate database. Do not replace final source manifests with this lagging database snapshot. Preserve Auth boundary checks and exact column grants.
8. **Historical wrapper error is real, separate from inventory.** 20260911120000_reviewed_checkout.sql starts with ALTER TABLE, not BEGIN, and lacks COMMIT. A new permissions migration cannot retroactively wrap it. Preserve history: if policy permits legacy exceptions, use a single reviewed filename+content-hash exception with explicit reason, keeping strict wrappers for all other/new migrations. Otherwise retain the failure as unresolved. Never skip all older migrations.

## Final integration sequence for the owning agent

Finish 040000 first; then rescan final signatures/modes/owners/policies/grants, add missing tables/RPCs/internal functions and role profiles, reconcile exact ACL roles (service_role only for persist and persist_edit among missing research RPCs), regenerate manifests and Markdown, rerun static tests. Validate parser changes with focused cases: fake DDL in comments/strings, unsupported conditional DO, named/default/OUT args, overload-specific DROP, invoker with postgres owner, definer with unsafe owner, explicit empty-policy deny-all, policy removal/replacement, and timeout reset after a valid pin. Keep actual missing security controls failing. A static pass is not live DB/RPC acceptance.

## Machine-readable proposal

This is proposal data, not a drop-in production matrix. observed* fields describe the catalog snapshot; candidateOwnerThrough030000 derives only the reviewed-owner changes inspected in source. Final permissions/owner/policy values must be taken from completed 040000 and verified candidate catalog.

```json
{
  "snapshotDate": "2026-09-29",
  "sourceTip": "20260929030000_reviewed_rpc_permissions.sql",
  "pendingMigration": "20260929040000 (not inspected; owned by another agent)",
  "missingFunctions": [
    {
      "name": "private.guard_guide_company_fields",
      "signature": "private.guard_guide_company_fields()",
      "securityMode": "DEFINER",
      "inventoryClass": "internal",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "private.guard_personalized_quote_deadline",
      "signature": "private.guard_personalized_quote_deadline()",
      "securityMode": "INVOKER",
      "inventoryClass": "internal",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "private.guard_personalized_request_deadline",
      "signature": "private.guard_personalized_request_deadline()",
      "securityMode": "INVOKER",
      "inventoryClass": "internal",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "private.guard_research_demo_revision_locks",
      "signature": "private.guard_research_demo_revision_locks()",
      "securityMode": "INVOKER",
      "inventoryClass": "internal",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "private.guard_research_resubmitted_snapshot",
      "signature": "private.guard_research_resubmitted_snapshot()",
      "securityMode": "INVOKER",
      "inventoryClass": "internal",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "private.prevent_customer_email_change",
      "signature": "private.prevent_customer_email_change()",
      "securityMode": "DEFINER",
      "inventoryClass": "internal",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "private.reject_research_demo_catalog_mutation",
      "signature": "private.reject_research_demo_catalog_mutation()",
      "securityMode": "INVOKER",
      "inventoryClass": "internal",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.get_guide_schedule",
      "signature": "public.get_guide_schedule(uuid)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "localens_guide_projection_owner",
      "observedSettings": [
        "search_path=\"\"",
        "statement_timeout=5s"
      ],
      "observedAcl": "{localens_guide_projection_owner=X/localens_guide_projection_owner,authenticated=X/localens_guide_projection_owner}",
      "candidateOwnerThrough030000": "localens_guide_projection_owner",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.get_own_guide_profile",
      "signature": "public.get_own_guide_profile()",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.get_research_demo_catalog",
      "signature": "public.get_research_demo_catalog(text)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.research_demo_begin_revision",
      "signature": "public.research_demo_begin_revision(uuid,uuid)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.research_demo_create_quote",
      "signature": "public.research_demo_create_quote(uuid,text,numeric,text,text)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.research_demo_decide",
      "signature": "public.research_demo_decide(uuid,text,text)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.research_demo_edit_context",
      "signature": "public.research_demo_edit_context(uuid)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.research_demo_list",
      "signature": "public.research_demo_list(boolean)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.research_demo_persist",
      "signature": "public.research_demo_persist(uuid,text,jsonb,jsonb)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,service_role=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.research_demo_persist_edit",
      "signature": "public.research_demo_persist_edit(uuid,uuid,text,text,jsonb,jsonb)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,service_role=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.research_demo_resubmit",
      "signature": "public.research_demo_resubmit(uuid,uuid,uuid)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.research_demo_resume",
      "signature": "public.research_demo_resume(uuid)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.research_demo_resume_latest",
      "signature": "public.research_demo_resume_latest(uuid)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.research_demo_submit",
      "signature": "public.research_demo_submit(uuid)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.reviewed_demo_availability",
      "signature": "public.reviewed_demo_availability()",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "localens_reviewed_rpc_owner",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.reviewed_demo_begin",
      "signature": "public.reviewed_demo_begin(uuid,integer,text)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "localens_reviewed_rpc_owner",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.reviewed_demo_cancel",
      "signature": "public.reviewed_demo_cancel(uuid)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "localens_reviewed_rpc_owner",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.reviewed_demo_checkout",
      "signature": "public.reviewed_demo_checkout(uuid,jsonb)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "localens_reviewed_rpc_owner",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.reviewed_demo_expire",
      "signature": "public.reviewed_demo_expire()",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres}",
      "candidateOwnerThrough030000": "localens_reviewed_rpc_owner",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.reviewed_demo_moderate_review",
      "signature": "public.reviewed_demo_moderate_review(uuid,boolean)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "localens_reviewed_rpc_owner",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.reviewed_demo_pay",
      "signature": "public.reviewed_demo_pay(uuid)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "localens_reviewed_rpc_owner",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.reviewed_demo_public_reviews",
      "signature": "public.reviewed_demo_public_reviews(uuid)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "localens_reviewed_rpc_owner",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.reviewed_demo_read",
      "signature": "public.reviewed_demo_read(uuid)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "localens_reviewed_rpc_owner",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.reviewed_demo_review",
      "signature": "public.reviewed_demo_review(uuid,integer,text)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "localens_reviewed_rpc_owner",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.reviewed_payment_sync",
      "signature": "public.reviewed_payment_sync()",
      "securityMode": "INVOKER",
      "inventoryClass": "internal",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    },
    {
      "name": "public.update_own_guide_profile",
      "signature": "public.update_own_guide_profile(text,text)",
      "securityMode": "DEFINER",
      "inventoryClass": "rpc",
      "observedOwner": "postgres",
      "observedSettings": [
        "search_path=\"\""
      ],
      "observedAcl": "{postgres=X/postgres,authenticated=X/postgres}",
      "candidateOwnerThrough030000": "postgres",
      "needsFinalPermissionRecheck": true
    }
  ],
  "existingInvokerCorrections": [
    {
      "signature": "private.checkout_canonical_payload(uuid, text, uuid, integer, locale)",
      "securityMode": "INVOKER",
      "observedOwner": "localens_checkout_rpc_owner"
    },
    {
      "signature": "private.checkout_hash_equal(text, text)",
      "securityMode": "INVOKER",
      "observedOwner": "localens_checkout_rpc_owner"
    },
    {
      "signature": "private.content_url_is_safe(text)",
      "securityMode": "INVOKER",
      "observedOwner": "localens_content_guard_owner"
    },
    {
      "signature": "private.research_demo_booking_payload(private.research_demo_bookings)",
      "securityMode": "INVOKER",
      "observedOwner": "localens_checkout_rpc_owner"
    },
    {
      "signature": "private.research_demo_cancellation_allowed(text, text, timestamp with time zone, timestamp with time zone, timestamp with time zone)",
      "securityMode": "INVOKER",
      "observedOwner": "localens_checkout_rpc_owner"
    },
    {
      "signature": "private.research_demo_trip_start(private.research_demo_bookings)",
      "securityMode": "INVOKER",
      "observedOwner": "localens_checkout_rpc_owner"
    },
    {
      "signature": "private.set_trip_plan_updated_at()",
      "securityMode": "INVOKER",
      "observedOwner": "localens_plan_guard_owner"
    },
    {
      "signature": "private.set_updated_at()",
      "securityMode": "INVOKER",
      "observedOwner": "localens_identity_rpc_owner"
    },
    {
      "signature": "private.valid_guide_requirement_flags(text[], text)",
      "securityMode": "INVOKER",
      "observedOwner": "localens_guide_assignment_guard_owner"
    },
    {
      "signature": "private.valid_tour_copy_array(text[])",
      "securityMode": "INVOKER",
      "observedOwner": "localens_tour_guard_owner"
    }
  ],
  "missingTablePolicies": [
    "public.profiles:profiles_self_update",
    "public.reviewed_demo_departures:reviewed_departures_read",
    "public.reviewed_demo_bookings:reviewed_bookings_own_read",
    "public.tour_version_stops:tour_stops_guide_schedule_select",
    "public.catalog_snapshot_place_translations:snapshot_translations_guide_schedule_select",
    "private.guide_demo_schedule:guide_demo_schedule_projection_select",
    "public.tour_version_translations:tour_copy_guide_schedule_select",
    "public.reviewed_demo_bookings:reviewed_rpc_select",
    "public.reviewed_demo_bookings:reviewed_rpc_insert",
    "public.reviewed_demo_bookings:reviewed_rpc_update",
    "public.reviewed_demo_departures:reviewed_rpc_departures",
    "public.reviewed_demo_departures:reviewed_rpc_departure_lock",
    "private.user_roles:reviewed_rpc_actor_role"
  ],
  "policylessTables": [
    {
      "name": "private.research_demo_catalog_versions",
      "policies": [],
      "proposedPolicyMode": "deny-all",
      "observedRlsEnabled": true,
      "observedForceRls": true,
      "requiresRecheckAfter040000": true
    },
    {
      "name": "private.research_demo_places",
      "policies": [],
      "proposedPolicyMode": "deny-all",
      "observedRlsEnabled": true,
      "observedForceRls": true,
      "requiresRecheckAfter040000": true
    },
    {
      "name": "private.research_demo_stops",
      "policies": [],
      "proposedPolicyMode": "deny-all",
      "observedRlsEnabled": true,
      "observedForceRls": true,
      "requiresRecheckAfter040000": true
    },
    {
      "name": "private.research_demo_revision_links",
      "policies": [],
      "proposedPolicyMode": "deny-all",
      "observedRlsEnabled": true,
      "observedForceRls": false,
      "requiresRecheckAfter040000": true
    }
  ]
}
```
