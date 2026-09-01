-- Runtime execution is deferred to the container-backed Task 16 gate. This
-- executable suite keeps the publication fixture rollback-safe and exercises
-- the role, provenance, capability, pointer, and audit boundaries together.
BEGIN;

SELECT plan(122);

GRANT USAGE ON SCHEMA extensions TO localens_content_admin_owner,
  localens_content_public_owner, localens_content_build_owner,
  localens_content_guard_owner, localens_content_build_executor,
  localens_content_audit_owner;
SELECT set_config('search_path', 'public, extensions, pg_catalog', true);

RESET ROLE;
DELETE FROM auth.users
WHERE id IN (
  '00000000-0000-0000-0000-000000001201'::uuid,
  '00000000-0000-0000-0000-000000001202'::uuid,
  '00000000-0000-0000-0000-000000001203'::uuid
);
INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000001201'::uuid, 'authenticated', 'authenticated', 'task12-admin@example.invalid', '', '{}'::jsonb, jsonb_build_object('role', 'admin', 'is_admin', true), now(), now()),
  ('00000000-0000-0000-0000-000000001202'::uuid, 'authenticated', 'authenticated', 'task12-customer@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000001203'::uuid, 'authenticated', 'authenticated', 'task12-public@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO private.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000001201'::uuid, 'admin'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;
INSERT INTO private.content_source_domains (hostname, purpose)
VALUES ('example.org', 'approved_source'), ('images.example.org', 'approved_source'), ('official.example.org', 'approved_source')
ON CONFLICT (hostname) DO NOTHING;

CREATE TEMP TABLE task12_publish (
  release_id uuid, build_id text, capability_nonce text,
  expires_at timestamptz, read_scope text
) ON COMMIT DROP;
CREATE TEMP TABLE task12_finalize (
  release_id uuid, status public.content_status, published_at timestamptz
) ON COMMIT DROP;
CREATE TEMP TABLE task12_failed (release_id uuid, status public.content_status) ON COMMIT DROP;
GRANT SELECT, INSERT ON task12_publish, task12_finalize, task12_failed TO authenticated, localens_content_build_executor, localens_content_admin_owner, localens_content_public_owner, localens_content_audit_owner, localens_content_guard_owner, localens_content_build_owner;

-- Catalog, state, and privilege surface.
SELECT extensions.ok(to_regclass('public.content_drafts') IS NOT NULL, 'draft table exists');
SELECT extensions.ok(to_regclass('public.seo_releases') IS NOT NULL, 'release table exists');
SELECT extensions.ok(to_regclass('private.content_release_copies') IS NOT NULL, 'immutable copies exist');
SELECT extensions.ok(to_regclass('private.seo_build_capabilities') IS NOT NULL, 'build capabilities exist');
SELECT extensions.ok(to_regclass('private.content_source_domains') IS NOT NULL, 'source allowlist exists');
SELECT extensions.ok(to_regclass('private.seo_live_pointer') IS NOT NULL, 'singleton live pointer exists');
SELECT extensions.ok(to_regprocedure('public.upsert_content_draft(public.locale,text,text,text,text,jsonb,date,jsonb)') IS NOT NULL, 'admin draft upsert RPC exists');
SELECT extensions.ok(to_regprocedure('public.publish_seo(text,text)') IS NOT NULL, 'publish RPC exists');
SELECT extensions.ok(to_regprocedure('public.read_seo_build_release(uuid,text,text)') IS NOT NULL, 'build read RPC exists');
SELECT extensions.ok(to_regprocedure('public.finalize_seo_publish(uuid,text,text,text,text)') IS NOT NULL, 'finalize RPC exists');
SELECT extensions.ok(to_regprocedure('public.fail_seo_publish(uuid,text,text,text)') IS NOT NULL, 'failure RPC exists');
SELECT extensions.is((SELECT string_agg(e.enumlabel, '|' ORDER BY e.enumsortorder) FROM pg_catalog.pg_enum e JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'content_status'), 'draft|publishing|published|failed', 'content status vocabulary is exact');
SELECT extensions.ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.content_drafts'::regclass), 'drafts enable RLS');
SELECT extensions.ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.content_drafts'::regclass), 'drafts force RLS');
SELECT extensions.ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.seo_releases'::regclass), 'releases enable RLS');
SELECT extensions.ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.seo_releases'::regclass), 'releases force RLS');
SELECT extensions.ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.content_release_copies'::regclass), 'copies force RLS');
SELECT extensions.ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.seo_build_capabilities'::regclass), 'capabilities force RLS');
SELECT extensions.ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.seo_live_pointer'::regclass), 'live pointer force RLS');
SELECT extensions.ok(EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE indexname = 'seo_releases_one_publishing' AND indexdef ~ $$status = 'publishing'$$), 'only one publishing release');
SELECT extensions.ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'private.seo_live_pointer'::regclass AND contype = 'p' AND pg_get_constraintdef(oid) ~* 'id'), 'singleton live pointer has one-row key');
SELECT extensions.ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'content_drafts_json_safety'), 'draft provenance trigger exists');
SELECT extensions.ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'content_release_copies_append_only'), 'copy immutability trigger exists');
SELECT extensions.ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'seo_release_state_guard'), 'release state trigger exists');

-- Every definer is pinned, named, and separated from the login executor.
SELECT extensions.ok((SELECT bool_and(NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolbypassrls) FROM pg_catalog.pg_roles WHERE rolname IN ('localens_content_admin_owner', 'localens_content_public_owner', 'localens_content_build_owner', 'localens_content_guard_owner', 'localens_content_audit_owner', 'localens_content_build_executor')), 'content roles are hardened');
SELECT extensions.ok((SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname = 'localens_content_build_executor'), 'build executor is a login role');
SELECT extensions.ok(NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_auth_members AS memberships
  JOIN pg_catalog.pg_roles AS granted ON granted.oid = memberships.roleid
  JOIN pg_catalog.pg_roles AS member ON member.oid = memberships.member
  WHERE (granted.rolname LIKE 'localens_content_%' AND (member.rolname <> 'postgres' OR memberships.inherit_option))
     OR member.rolname LIKE 'localens_content_%'
) AND (SELECT bool_and(pg_catalog.pg_has_role('postgres', role_name, 'SET')) FROM unnest(ARRAY(SELECT rolname FROM pg_catalog.pg_roles WHERE rolname LIKE 'localens_content_%')) AS protected(role_name)), 'content memberships are limited to postgres SET access without inheritance');
SELECT extensions.is((SELECT pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid = 'public.publish_seo(text,text)'::regprocedure), 'localens_content_admin_owner', 'publish owner is named');
SELECT extensions.is((SELECT pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid = 'public.finalize_seo_publish(uuid,text,text,text,text)'::regprocedure), 'localens_content_build_owner', 'finalize owner is named');
SELECT extensions.ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.publish_seo(text,text)'::regprocedure), 'publish is SECURITY DEFINER');
SELECT extensions.ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.read_seo_build_release(uuid,text,text)'::regprocedure), 'read is SECURITY DEFINER');
SELECT extensions.ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.finalize_seo_publish(uuid,text,text,text,text)'::regprocedure), 'finalize is SECURITY DEFINER');
SELECT extensions.ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.fail_seo_publish(uuid,text,text,text)'::regprocedure), 'failure is SECURITY DEFINER');
SELECT extensions.ok((SELECT proconfig @> ARRAY['search_path=""'] FROM pg_catalog.pg_proc WHERE oid = 'public.publish_seo(text,text)'::regprocedure), 'publish pins empty search_path');
SELECT extensions.ok((SELECT proconfig @> ARRAY['search_path=""'] FROM pg_catalog.pg_proc WHERE oid = 'public.finalize_seo_publish(uuid,text,text,text,text)'::regprocedure), 'finalize pins empty search_path');
SELECT extensions.ok((SELECT proconfig @> ARRAY['search_path=""'] FROM pg_catalog.pg_proc WHERE oid = 'public.fail_seo_publish(uuid,text,text,text)'::regprocedure), 'failure pins empty search_path');
SELECT extensions.ok(has_function_privilege('authenticated', 'public.publish_seo(text,text)', 'EXECUTE'), 'authenticated can request guarded publish');
SELECT extensions.ok(has_function_privilege('authenticated', 'public.upsert_content_draft(public.locale,text,text,text,text,jsonb,date,jsonb)', 'EXECUTE'), 'authenticated can request guarded draft upsert');
SELECT extensions.ok(has_function_privilege('localens_content_build_executor', 'public.read_seo_build_release(uuid,text,text)', 'EXECUTE'), 'build can call read RPC');
SELECT extensions.ok(has_function_privilege('localens_content_build_executor', 'public.finalize_seo_publish(uuid,text,text,text,text)', 'EXECUTE'), 'build can call finalize RPC');
SELECT extensions.ok(has_function_privilege('localens_content_build_executor', 'public.fail_seo_publish(uuid,text,text,text)', 'EXECUTE'), 'build can call failure RPC');
SELECT extensions.ok(NOT has_function_privilege('anon', 'public.finalize_seo_publish(uuid,text,text,text,text)', 'EXECUTE'), 'anonymous cannot finalize');
SELECT extensions.ok(NOT has_table_privilege('anon', 'public.content_drafts', 'SELECT'), 'anonymous cannot read drafts');
SELECT extensions.ok(NOT has_table_privilege('authenticated', 'public.content_drafts', 'INSERT'), 'authenticated cannot write draft base table');
SELECT extensions.ok(NOT has_table_privilege('authenticated', 'private.content_release_copies', 'SELECT'), 'authenticated cannot read copies');
SELECT extensions.ok(NOT has_table_privilege('anon', 'private.seo_build_capabilities', 'SELECT'), 'anonymous cannot read capabilities');
SELECT extensions.ok(NOT has_table_privilege('localens_content_build_executor', 'public.content_drafts', 'SELECT'), 'build cannot read arbitrary drafts');
SELECT extensions.ok(pg_catalog.pg_get_viewdef('public.published_content_release_v'::regclass) !~* 'build_id|nonce|capabilit|failure_code', 'public view omits build secrets');
SELECT extensions.ok(pg_catalog.pg_get_viewdef('public.admin_audit_events_v'::regclass) ~* 'jsonb_build_object', 'audit view exposes mapped metadata');

-- Non-admin context cannot write the base table or see admin drafts.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001202', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000001202', 'role', 'authenticated')::text, true);
SELECT extensions.throws_ok($$INSERT INTO public.content_drafts (locale, slug, title, description, body, source_urls, verified_at, image_attributions, created_by, updated_by) VALUES ('en'::public.locale, 'task12-denied', 'Denied', 'Denied', 'Denied', '["https://example.org/denied"]'::jsonb, DATE '2026-08-25', '[]'::jsonb, '00000000-0000-0000-0000-000000001202'::uuid, '00000000-0000-0000-0000-000000001202'::uuid)$$::text, '42501'::character(5), NULL::text, 'customer cannot write drafts'::text);
SELECT extensions.is((SELECT count(*)::integer FROM public.admin_content_drafts_v), 0, 'customer sees no admin drafts');
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000001202', 'role', 'admin')::text, true);
SELECT extensions.throws_ok($$SELECT * FROM public.publish_seo('task12-forged-admin', 'task12-build-forged-admin')$$::text, '42501'::character(5), NULL::text, 'forged admin JWT metadata cannot publish'::text);
RESET ROLE;

-- Owner context writes exactly one EN/VI pair; malformed provenance is
-- rejected by the trigger before the publication RPC can see it.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000001201', 'role', 'authenticated')::text, true);
SELECT extensions.lives_ok($$SELECT * FROM public.upsert_content_draft('en'::public.locale, 'task12-market', 'Task 12 Market', 'English market guide', 'Walk through the market with a local guide.', '["https://example.org/task12-market"]'::jsonb, DATE '2026-08-25', '[{"imageUrl":"https://images.example.org/task12-market.jpg","sourceUrl":"https://example.org/task12-market","creator":"LocalLens","license":"CC BY 4.0"}]'::jsonb)$$, 'admin upsert writes the EN draft through its RPC');
SELECT extensions.lives_ok($$SELECT * FROM public.upsert_content_draft('vi'::public.locale, 'task12-market', 'Chợ Task 12', 'Hướng dẫn chợ bằng tiếng Việt', 'Khám phá chợ cùng hướng dẫn viên địa phương.', '["https://example.org/task12-market-vi"]'::jsonb, DATE '2026-08-25', '[{"imageUrl":"https://images.example.org/task12-market-vi.jpg","sourceUrl":"https://example.org/task12-market-vi","creator":"LocalLens","license":"CC BY 4.0"}]'::jsonb)$$, 'admin upsert writes the VI draft through its RPC');
SELECT extensions.is((SELECT count(*)::integer FROM public.admin_content_drafts_v WHERE slug = 'task12-market'), 2, 'admin upsert creates bilingual pair');
RESET ROLE;
SELECT extensions.throws_ok($$INSERT INTO public.content_drafts (locale, slug, title, description, body, source_urls, verified_at, image_attributions, created_by, updated_by) VALUES ('en'::public.locale, 'task12-http', 'Unsafe', 'Unsafe', 'Unsafe', '["http://example.org/no-tls"]'::jsonb, DATE '2026-08-25', '[]'::jsonb, '00000000-0000-0000-0000-000000001201'::uuid, '00000000-0000-0000-0000-000000001201'::uuid)$$::text, '23514'::character(5), NULL::text, 'non-HTTPS source is rejected'::text);
SELECT extensions.throws_ok($$INSERT INTO public.content_drafts (locale, slug, title, description, body, source_urls, verified_at, image_attributions, created_by, updated_by) VALUES ('en'::public.locale, 'task12-image', 'Unsafe', 'Unsafe', 'Unsafe', '["https://example.org/image"]'::jsonb, DATE '2026-08-25', '[{"imageUrl":"https://images.example.org/a#fragment","sourceUrl":"https://example.org/a","creator":"LocalLens","license":"CC BY 4.0"}]'::jsonb, '00000000-0000-0000-0000-000000001201'::uuid, '00000000-0000-0000-0000-000000001201'::uuid)$$::text, '23514'::character(5), NULL::text, 'unsafe image URL is rejected'::text);
SELECT extensions.throws_ok($$INSERT INTO public.content_drafts (locale, slug, title, description, body, source_urls, verified_at, image_attributions, created_by, updated_by) VALUES ('en'::public.locale, 'task12-attribution', 'Unsafe', 'Unsafe', 'Unsafe', '["https://example.org/attribution"]'::jsonb, DATE '2026-08-25', '[{"imageUrl":"https://images.example.org/a","sourceUrl":"https://example.org/a","creator":"LocalLens"}]'::jsonb, '00000000-0000-0000-0000-000000001201'::uuid, '00000000-0000-0000-0000-000000001201'::uuid)$$::text, '23514'::character(5), NULL::text, 'incomplete image attribution is rejected'::text);

-- Invalid provenance and missing locale are rejected before the first
-- successful candidate is allocated. The upsert RPC owns draft validation;
-- a direct base-table UPDATE is intentionally not used here.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000001201', 'role', 'authenticated')::text, true);
SELECT extensions.throws_ok($$SELECT * FROM public.upsert_content_draft('en'::public.locale, 'task12-market', 'Task 12 Market', 'English market guide', 'Walk through the market with a local guide.', '["https://unknown.example.net/task12"]'::jsonb, DATE '2026-08-25', '[{"imageUrl":"https://images.example.org/task12-market.jpg","sourceUrl":"https://example.org/task12-market","creator":"LocalLens","license":"CC BY 4.0"}]'::jsonb)$$::text, '23514'::character(5), NULL::text, 'upsert rejects source outside allowlist'::text);
RESET ROLE;
SET LOCAL ROLE localens_content_admin_owner;
INSERT INTO public.content_drafts (id, locale, slug, title, description, body, source_urls, verified_at, image_attributions, created_by, updated_by)
VALUES ('00000000-0000-0000-0000-000000001213'::uuid, 'en'::public.locale, 'task12-missing-locale', 'Missing locale', 'Missing locale', 'Missing locale', '["https://example.org/missing-locale"]'::jsonb, DATE '2026-08-25', '[]'::jsonb, '00000000-0000-0000-0000-000000001201'::uuid, '00000000-0000-0000-0000-000000001201'::uuid);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);
SELECT extensions.throws_ok($$SELECT * FROM public.publish_seo('task12-missing-vi', 'task12-build-missing-vi')$$::text, '23514'::character(5), NULL::text, 'publish rejects missing locale'::text);
RESET ROLE;
SET LOCAL ROLE localens_content_admin_owner;
SELECT extensions.throws_ok($$UPDATE public.content_drafts SET image_attributions = '[{"imageUrl":"https://images.example.org/a","sourceUrl":"https://example.org/a","creator":"LocalLens"}]'::jsonb WHERE locale = 'vi'::public.locale AND slug = 'task12-market'$$::text, '23514'::character(5), NULL::text, 'draft update rejects incomplete attribution'::text);
RESET ROLE;
DELETE FROM public.content_drafts WHERE slug = 'task12-missing-locale';
RESET ROLE;

-- Admin publish snapshots both locales and issues a short-lived capability.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000001201', 'role', 'authenticated')::text, true);
INSERT INTO task12_publish SELECT * FROM public.publish_seo('task12-commit-001', 'task12-build-001');
SELECT extensions.is((SELECT count(*)::integer FROM task12_publish), 1, 'publish returns one capability');
SET LOCAL ROLE localens_content_build_owner;
SELECT extensions.is((SELECT count(*)::integer FROM public.seo_releases WHERE status = 'publishing'::public.content_status), 1, 'candidate enters publishing state');
SELECT extensions.is((SELECT count(*)::integer FROM private.content_release_copies WHERE release_id = (SELECT release_id FROM task12_publish)), 2, 'publish snapshots EN and VI copies');
SELECT extensions.is((SELECT count(DISTINCT locale)::integer FROM private.content_release_copies WHERE release_id = (SELECT release_id FROM task12_publish)), 2, 'release has both locales');
RESET ROLE;
SET LOCAL ROLE localens_content_admin_owner;
SELECT extensions.is((SELECT read_scope FROM task12_publish), 'published_content_release', 'capability scope is exact');
SELECT extensions.ok((SELECT expires_at > clock_timestamp() AND expires_at <= clock_timestamp() + interval '16 minutes' FROM task12_publish), 'capability expires in fifteen minutes');
SELECT extensions.ok((SELECT length(capability_nonce) = 64 AND capability_nonce ~ '^[0-9a-f]+$' FROM task12_publish), 'capability nonce is opaque hex');
SET LOCAL ROLE localens_content_build_owner;
SELECT extensions.ok((SELECT nonce_hash = digest(capability_nonce, 'sha256') FROM private.seo_build_capabilities c JOIN task12_publish p ON p.release_id = c.release_id AND p.build_id = c.build_id), 'only nonce digest is stored');
RESET ROLE;
SET LOCAL ROLE localens_content_admin_owner;
SELECT extensions.is((SELECT count(*)::integer FROM private.audit_events WHERE event_type = 'content_publish_started'::public.audit_event_type AND target_id = (SELECT release_id FROM task12_publish)), 1, 'publish creates start audit event');
SELECT extensions.is((SELECT count(*)::integer FROM public.admin_content_drafts_v), 2, 'admin projection returns both drafts');
RESET ROLE;
SET LOCAL ROLE localens_content_guard_owner;
SELECT extensions.is((SELECT purpose FROM private.content_source_domains WHERE hostname = 'official.example.org'), 'approved_source', 'approved source purpose is preserved');
RESET ROLE;

-- Public sees no publishing candidate; build reads only its own capability.
SET LOCAL ROLE localens_content_public_owner;
SELECT extensions.is((SELECT count(*)::integer FROM public.published_content_release_v), 0, 'public hides publishing candidate');
RESET ROLE;
SET LOCAL ROLE localens_content_build_executor;
SELECT extensions.is((SELECT count(*)::integer FROM public.read_seo_build_release((SELECT release_id FROM task12_publish), (SELECT build_id FROM task12_publish), (SELECT capability_nonce FROM task12_publish))), 2, 'correct nonce reads two copies');
SELECT extensions.throws_ok($$SELECT * FROM public.read_seo_build_release((SELECT release_id FROM task12_publish), (SELECT build_id FROM task12_publish), repeat('d', 64))$$::text, '42501'::character(5), NULL::text, 'wrong nonce is rejected'::text);
SELECT extensions.throws_ok($$SELECT * FROM public.content_drafts$$::text, '42501'::character(5), NULL::text, 'build cannot read drafts directly'::text);
RESET ROLE;

-- Finalize is CAS and consumes the capability; exact replay is safe while a
-- mismatched nonce cannot mutate the release.
SET LOCAL ROLE localens_content_build_executor;
INSERT INTO task12_finalize SELECT * FROM public.finalize_seo_publish((SELECT release_id FROM task12_publish), (SELECT build_id FROM task12_publish), repeat('a', 64), 'task12-commit-001', (SELECT capability_nonce FROM task12_publish));
SELECT extensions.is((SELECT status FROM task12_finalize), 'published'::public.content_status, 'finalize publishes exact candidate');
SET LOCAL ROLE localens_content_build_owner;
SELECT extensions.is((SELECT status FROM public.seo_releases WHERE id = (SELECT release_id FROM task12_publish)), 'published'::public.content_status, 'release state is published');
SELECT extensions.is((SELECT artifact_hash FROM public.seo_releases WHERE id = (SELECT release_id FROM task12_publish)), repeat('a', 64), 'artifact hash is server-bound');
SELECT extensions.ok((SELECT publishing_at IS NOT NULL AND published_at IS NOT NULL AND published_at >= publishing_at FROM public.seo_releases WHERE id = (SELECT release_id FROM task12_publish)), 'transition timestamps are database-owned and ordered');
SELECT extensions.is((SELECT count(*)::integer FROM private.seo_build_capabilities WHERE release_id = (SELECT release_id FROM task12_publish) AND consumed_at IS NOT NULL), 1, 'finalize consumes nonce');
RESET ROLE;
SET LOCAL ROLE localens_content_public_owner;
SELECT extensions.is((SELECT count(*)::integer FROM public.published_content_release_v), 2, 'public exposes only published bilingual copies');
RESET ROLE;
SET LOCAL ROLE localens_content_build_executor;
SELECT extensions.throws_ok($$SELECT * FROM public.read_seo_build_release((SELECT release_id FROM task12_publish), (SELECT build_id FROM task12_publish), (SELECT capability_nonce FROM task12_publish))$$::text, '42501'::character(5), NULL::text, 'consumed nonce cannot be read'::text);
SELECT extensions.lives_ok($$SELECT * FROM public.finalize_seo_publish((SELECT release_id FROM task12_publish), (SELECT build_id FROM task12_publish), repeat('a', 64), 'task12-commit-001', (SELECT capability_nonce FROM task12_publish))$$, 'exact finalize replay is idempotent');
SELECT extensions.throws_ok($$SELECT * FROM public.finalize_seo_publish((SELECT release_id FROM task12_publish), (SELECT build_id FROM task12_publish), repeat('a', 64), 'task12-commit-001', repeat('e', 64))$$::text, '42501'::character(5), NULL::text, 'finalize nonce mismatch is rejected'::text);
SELECT extensions.throws_ok($$SELECT * FROM public.fail_seo_publish((SELECT release_id FROM task12_publish), (SELECT build_id FROM task12_publish), (SELECT capability_nonce FROM task12_publish), 'retry_after_publish')$$::text, '42501'::character(5), NULL::text, 'consumed capability cannot recover a published release'::text);
SET LOCAL ROLE localens_content_build_owner;
SELECT extensions.throws_ok($$UPDATE public.seo_releases SET status = 'failed'::public.content_status WHERE id = (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-001')$$::text, '42501'::character(5), NULL::text, 'published release is terminal and immutable'::text);
RESET ROLE;

-- Candidate recovery: a consumed capability on B is atomically failed by the
-- next publish, which then allocates C. C is cleared explicitly before D.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);
INSERT INTO task12_publish SELECT * FROM public.publish_seo('task12-commit-002', 'task12-build-002');
RESET ROLE;
SET LOCAL ROLE localens_content_build_owner;
SELECT extensions.is((SELECT count(*)::integer FROM public.seo_releases WHERE status = 'published'::public.content_status), 1, 'old live release remains during second build');
SELECT extensions.is((SELECT count(*)::integer FROM public.seo_releases WHERE status = 'publishing'::public.content_status), 1, 'second candidate is sole publishing row');
UPDATE private.seo_build_capabilities SET consumed_at = clock_timestamp()
WHERE release_id = (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-002')
  AND build_id = 'task12-build-002';
RESET ROLE;
SET LOCAL ROLE authenticated;
INSERT INTO task12_publish SELECT * FROM public.publish_seo('task12-commit-003', 'task12-build-003');
RESET ROLE;
SET LOCAL ROLE localens_content_build_owner;
SELECT extensions.is((SELECT status FROM public.seo_releases WHERE build_id = 'task12-build-002'), 'failed'::public.content_status, 'consumed candidate is failed by next publish');
SELECT extensions.is((SELECT failure_code FROM public.seo_releases WHERE build_id = 'task12-build-002'), 'capability_expired', 'consumed candidate gets capability expiry failure');
SELECT extensions.is((SELECT count(*)::integer FROM public.seo_releases WHERE status = 'publishing'::public.content_status), 1, 'recovery allocates a new sole candidate');
SELECT extensions.throws_ok($$UPDATE public.seo_releases SET status = 'publishing'::public.content_status WHERE build_id = 'task12-build-002'$$::text, '42501'::character(5), NULL::text, 'failed candidate is terminal and immutable'::text);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT extensions.throws_ok($$SELECT * FROM public.publish_seo('task12-commit-004', 'task12-build-004')$$::text, '55006'::character(5), NULL::text, 'active candidate blocks another publish'::text);
RESET ROLE;
SET LOCAL ROLE localens_content_build_executor;
SELECT extensions.lives_ok($$SELECT * FROM public.fail_seo_publish((SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-002'), 'task12-build-002', (SELECT capability_nonce FROM task12_publish WHERE build_id = 'task12-build-002'), 'capability_expired')$$, 'exact failure replay is idempotent');
SELECT extensions.throws_ok($$SELECT * FROM public.fail_seo_publish((SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-002'), 'task12-build-002', repeat('1', 64), 'capability_expired')$$::text, '42501'::character(5), NULL::text, 'failure nonce mismatch is rejected'::text);
SELECT extensions.throws_ok($$SELECT * FROM public.fail_seo_publish((SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-002'), 'task12-build-002', (SELECT capability_nonce FROM task12_publish WHERE build_id = 'task12-build-002'), 'different_failure')$$::text, '42501'::character(5), NULL::text, 'failure replay rejects different failure code'::text);
SELECT extensions.is((SELECT status FROM public.fail_seo_publish((SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-003'), 'task12-build-003', (SELECT capability_nonce FROM task12_publish WHERE build_id = 'task12-build-003'), 'artifact_invalid')), 'failed'::public.content_status, 'candidate C can be cleared before the next recovery');
RESET ROLE;
SET LOCAL ROLE localens_content_public_owner;
SELECT extensions.is((SELECT release_id FROM private.seo_live_pointer WHERE id = true), (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-001'), 'failure does not replace old live pointer');
SELECT extensions.is((SELECT release_id FROM public.published_content_release_v LIMIT 1), (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-001'), 'public view remains on old pointer');
RESET ROLE;

-- Candidate D has its capability removed by the fixture owner. Its missing
-- capability is rejected, then the next publish fails D and allocates E.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);
INSERT INTO task12_publish SELECT * FROM public.publish_seo('task12-commit-004', 'task12-build-004');
RESET ROLE;
DELETE FROM private.seo_build_capabilities
WHERE release_id = (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-004')
  AND build_id = 'task12-build-004';
SET LOCAL ROLE localens_content_build_executor;
SELECT extensions.throws_ok($$SELECT * FROM public.read_seo_build_release((SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-004'), 'task12-build-004', (SELECT capability_nonce FROM task12_publish WHERE build_id = 'task12-build-004'))$$::text, '42501'::character(5), NULL::text, 'missing capability is rejected'::text);
RESET ROLE;
SET LOCAL ROLE authenticated;
INSERT INTO task12_publish SELECT * FROM public.publish_seo('task12-commit-005', 'task12-build-005');
RESET ROLE;
SET LOCAL ROLE localens_content_build_owner;
SELECT extensions.is((SELECT status FROM public.seo_releases WHERE build_id = 'task12-build-004'), 'failed'::public.content_status, 'missing capability candidate is failed by next publish');
SELECT extensions.is((SELECT failure_code FROM public.seo_releases WHERE build_id = 'task12-build-004'), 'capability_expired', 'missing capability gets capability expiry failure');
RESET ROLE;
SET LOCAL ROLE localens_content_build_executor;
INSERT INTO task12_failed SELECT * FROM public.fail_seo_publish((SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-005'), 'task12-build-005', (SELECT capability_nonce FROM task12_publish WHERE build_id = 'task12-build-005'), 'artifact_invalid');
RESET ROLE;
SET LOCAL ROLE localens_content_public_owner;
SELECT extensions.is((SELECT release_id FROM private.seo_live_pointer WHERE id = true), (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-001'), 'missing capability recovery leaves old live pointer active');
RESET ROLE;

-- An expired capability on an active candidate follows the same guarded
-- recovery path: the next publish fails F and allocates G, while live stays
-- on the original published release.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);
INSERT INTO task12_publish SELECT * FROM public.publish_seo('task12-commit-006', 'task12-build-006');
RESET ROLE;
SET LOCAL ROLE localens_content_build_owner;
UPDATE private.seo_build_capabilities SET expires_at = clock_timestamp() - interval '1 minute'
WHERE release_id = (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-006')
  AND build_id = 'task12-build-006';
RESET ROLE;
SET LOCAL ROLE authenticated;
INSERT INTO task12_publish SELECT * FROM public.publish_seo('task12-commit-007', 'task12-build-007');
RESET ROLE;
SET LOCAL ROLE localens_content_build_owner;
SELECT extensions.is((SELECT status FROM public.seo_releases WHERE build_id = 'task12-build-006'), 'failed'::public.content_status, 'expired candidate is failed by next publish');
SELECT extensions.is((SELECT failure_code FROM public.seo_releases WHERE build_id = 'task12-build-006'), 'capability_expired', 'expired candidate gets capability expiry failure');
SELECT extensions.is((SELECT count(*)::integer FROM public.seo_releases WHERE status = 'publishing'::public.content_status), 1, 'expired recovery allocates a new sole candidate');
RESET ROLE;
SET LOCAL ROLE localens_content_build_executor;
INSERT INTO task12_failed SELECT * FROM public.fail_seo_publish((SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-007'), 'task12-build-007', (SELECT capability_nonce FROM task12_publish WHERE build_id = 'task12-build-007'), 'artifact_invalid');
RESET ROLE;
SET LOCAL ROLE localens_content_public_owner;
SELECT extensions.is((SELECT release_id FROM private.seo_live_pointer WHERE id = true), (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-001'), 'expired capability recovery leaves old live pointer active');
RESET ROLE;

-- Guard helpers remain safe under a hostile search_path and the allowlist
-- fails closed for an unknown origin.
SET LOCAL ROLE localens_content_guard_owner;
SET LOCAL search_path TO pg_temp, public, private, extensions, pg_catalog;
SELECT extensions.ok(private.content_url_is_safe('https://example.org/clean') IS TRUE, 'safe URL survives hostile search_path');
SELECT extensions.ok(private.content_url_is_safe('http://example.org/no-tls') IS FALSE, 'URL helper rejects HTTP');
SELECT extensions.ok(private.content_url_is_safe('https://example.org/a#fragment') IS FALSE, 'URL helper rejects fragments');
SELECT extensions.ok(private.content_url_is_safe('https://example.org/a?utm_source=secret') IS FALSE, 'URL helper rejects tracking query');
SELECT extensions.ok(private.content_url_is_allowlisted('https://example.org/clean') IS TRUE, 'allowlisted URL passes');
SELECT extensions.ok(private.content_url_is_allowlisted('https://unknown.example.net/clean') IS FALSE, 'unknown URL fails closed');
RESET ROLE;
SET LOCAL search_path TO public, extensions, pg_catalog;

-- Audit helper emits only the closed event vocabulary and admin projection
-- returns safe metadata rather than raw notes/tokens/secrets.
SET LOCAL ROLE localens_content_audit_owner;
SELECT extensions.lives_ok($$SELECT private.record_content_audit_event('content_published'::public.audit_event_type, '00000000-0000-0000-0000-000000001201'::uuid, (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-001'), 'publishing', 'published', 'source'::public.audit_metadata_key, 'build', NULL, NULL)$$, 'audit owner appends safe publication event');
SELECT extensions.throws_ok($$SELECT private.record_content_audit_event('role_provisioned'::public.audit_event_type, '00000000-0000-0000-0000-000000001201'::uuid, (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-001'), 'publishing', 'published', 'source'::public.audit_metadata_key, 'build', NULL, NULL)$$::text, '42501'::character(5), NULL::text, 'audit helper rejects unrelated event'::text);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);
SELECT extensions.is((SELECT metadata FROM public.admin_audit_events_v WHERE event_type = 'content_published'::public.audit_event_type ORDER BY created_at DESC LIMIT 1), '{"source":"build"}'::jsonb, 'audit projection exposes safe metadata');
SELECT extensions.ok((SELECT count(*)::integer FROM public.admin_audit_events_v WHERE target_type = 'content_release'::public.audit_target_type) >= 3, 'admin sees content audit history');
SELECT extensions.throws_ok($$INSERT INTO private.audit_events (event_type, actor_user_id, target_type, target_id, metadata_key, metadata_text) VALUES ('content_published'::public.audit_event_type, '00000000-0000-0000-0000-000000001201'::uuid, 'content_release'::public.audit_target_type, (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-001'), 'source'::public.audit_metadata_key, 'email@example.invalid')$$::text, '42501'::character(5), NULL::text, 'authenticated cannot insert audit facts directly'::text);
RESET ROLE;

-- Anonymous reads only the named public projection, not any base table.
SET LOCAL ROLE anon;
SELECT extensions.is((SELECT count(*)::integer FROM public.published_content_release_v), 2, 'anonymous sees current bilingual release');
SELECT extensions.throws_ok($$SELECT * FROM public.content_drafts$$::text, '42501'::character(5), NULL::text, 'anonymous cannot read draft base table'::text);
SELECT extensions.throws_ok($$SELECT * FROM private.content_release_copies$$::text, '42501'::character(5), NULL::text, 'anonymous cannot read release copies directly'::text);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
