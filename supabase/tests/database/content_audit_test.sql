-- Runtime execution is deferred to the container-backed Task 16 gate. This
-- executable suite keeps the publication fixture rollback-safe and exercises
-- the role, provenance, capability, pointer, and audit boundaries together.
BEGIN;

SELECT plan(100);

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
  ('00000000-0000-0000-0000-000000001202'::uuid, 'authenticated', 'authenticated', 'task12-customer@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000001203'::uuid, 'authenticated', 'authenticated', 'task12-public@example.invalid', '', '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO private.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000001201'::uuid, 'admin'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;
INSERT INTO private.content_source_domains (hostname, purpose)
VALUES ('example.org', 'demo'), ('images.example.org', 'demo')
ON CONFLICT (hostname) DO NOTHING;

CREATE TEMP TABLE task12_publish (
  release_id uuid, build_id text, capability_nonce text,
  expires_at timestamptz, read_scope text
) ON COMMIT DROP;
CREATE TEMP TABLE task12_finalize (
  release_id uuid, status public.content_status, published_at timestamptz
) ON COMMIT DROP;
CREATE TEMP TABLE task12_failed (release_id uuid, status public.content_status) ON COMMIT DROP;
GRANT SELECT, INSERT ON task12_publish, task12_finalize, task12_failed TO authenticated, localens_content_build_executor;

-- Catalog, state, and privilege surface.
SELECT ok(to_regclass('public.content_drafts') IS NOT NULL, 'draft table exists');
SELECT ok(to_regclass('public.seo_releases') IS NOT NULL, 'release table exists');
SELECT ok(to_regclass('private.content_release_copies') IS NOT NULL, 'immutable copies exist');
SELECT ok(to_regclass('private.seo_build_capabilities') IS NOT NULL, 'build capabilities exist');
SELECT ok(to_regclass('private.content_source_domains') IS NOT NULL, 'source allowlist exists');
SELECT ok(to_regclass('private.seo_live_pointer') IS NOT NULL, 'singleton live pointer exists');
SELECT ok(to_regprocedure('public.publish_seo(text,text)') IS NOT NULL, 'publish RPC exists');
SELECT ok(to_regprocedure('public.read_seo_build_release(uuid,text,text)') IS NOT NULL, 'build read RPC exists');
SELECT ok(to_regprocedure('public.finalize_seo_publish(uuid,text,text,text,text)') IS NOT NULL, 'finalize RPC exists');
SELECT ok(to_regprocedure('public.fail_seo_publish(uuid,text,text,text)') IS NOT NULL, 'failure RPC exists');
SELECT is((SELECT string_agg(e.enumlabel, '|' ORDER BY e.enumsortorder) FROM pg_catalog.pg_enum e JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'content_status'), 'draft|publishing|published|failed', 'content status vocabulary is exact');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.content_drafts'::regclass), 'drafts enable RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.content_drafts'::regclass), 'drafts force RLS');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.seo_releases'::regclass), 'releases enable RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.seo_releases'::regclass), 'releases force RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.content_release_copies'::regclass), 'copies force RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.seo_build_capabilities'::regclass), 'capabilities force RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.seo_live_pointer'::regclass), 'live pointer force RLS');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE indexname = 'seo_releases_one_publishing' AND indexdef ~ $$status = 'publishing'$$), 'only one publishing release');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'private.seo_live_pointer'::regclass AND contype = 'p' AND pg_get_constraintdef(oid) ~* 'id'), 'singleton live pointer has one-row key');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'content_drafts_json_safety'), 'draft provenance trigger exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'content_release_copies_append_only'), 'copy immutability trigger exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'seo_release_state_guard'), 'release state trigger exists');

-- Every definer is pinned, named, and separated from the login executor.
SELECT ok((SELECT bool_and(NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolbypassrls) FROM pg_catalog.pg_roles WHERE rolname IN ('localens_content_admin_owner', 'localens_content_public_owner', 'localens_content_build_owner', 'localens_content_guard_owner', 'localens_content_audit_owner', 'localens_content_build_executor')), 'content roles are hardened');
SELECT ok((SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname = 'localens_content_build_executor'), 'build executor is a login role');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid = m.roleid JOIN pg_catalog.pg_roles u ON u.oid = m.member WHERE r.rolname LIKE 'localens_content_%' OR u.rolname LIKE 'localens_content_%'), 'content roles have no memberships');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid = 'public.publish_seo(text,text)'::regprocedure), 'localens_content_admin_owner', 'publish owner is named');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid = 'public.finalize_seo_publish(uuid,text,text,text,text)'::regprocedure), 'localens_content_build_owner', 'finalize owner is named');
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.publish_seo(text,text)'::regprocedure), 'publish is SECURITY DEFINER');
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.read_seo_build_release(uuid,text,text)'::regprocedure), 'read is SECURITY DEFINER');
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.finalize_seo_publish(uuid,text,text,text,text)'::regprocedure), 'finalize is SECURITY DEFINER');
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.fail_seo_publish(uuid,text,text,text)'::regprocedure), 'failure is SECURITY DEFINER');
SELECT ok((SELECT proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc WHERE oid = 'public.publish_seo(text,text)'::regprocedure), 'publish pins empty search_path');
SELECT ok((SELECT proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc WHERE oid = 'public.finalize_seo_publish(uuid,text,text,text,text)'::regprocedure), 'finalize pins empty search_path');
SELECT ok((SELECT proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc WHERE oid = 'public.fail_seo_publish(uuid,text,text,text)'::regprocedure), 'failure pins empty search_path');
SELECT ok(has_function_privilege('authenticated', 'public.publish_seo(text,text)', 'EXECUTE'), 'authenticated can request guarded publish');
SELECT ok(has_function_privilege('localens_content_build_executor', 'public.read_seo_build_release(uuid,text,text)', 'EXECUTE'), 'build can call read RPC');
SELECT ok(has_function_privilege('localens_content_build_executor', 'public.finalize_seo_publish(uuid,text,text,text,text)', 'EXECUTE'), 'build can call finalize RPC');
SELECT ok(has_function_privilege('localens_content_build_executor', 'public.fail_seo_publish(uuid,text,text,text)', 'EXECUTE'), 'build can call failure RPC');
SELECT ok(NOT has_function_privilege('anon', 'public.finalize_seo_publish(uuid,text,text,text,text)', 'EXECUTE'), 'anonymous cannot finalize');
SELECT ok(NOT has_table_privilege('anon', 'public.content_drafts', 'SELECT'), 'anonymous cannot read drafts');
SELECT ok(NOT has_table_privilege('authenticated', 'public.content_drafts', 'INSERT'), 'authenticated cannot write draft base table');
SELECT ok(NOT has_table_privilege('authenticated', 'private.content_release_copies', 'SELECT'), 'authenticated cannot read copies');
SELECT ok(NOT has_table_privilege('anon', 'private.seo_build_capabilities', 'SELECT'), 'anonymous cannot read capabilities');
SELECT ok(NOT has_table_privilege('localens_content_build_executor', 'public.content_drafts', 'SELECT'), 'build cannot read arbitrary drafts');
SELECT ok(pg_catalog.pg_get_viewdef('public.published_content_release_v'::regclass) !~* 'build_id|nonce|capabilit|failure_code', 'public view omits build secrets');
SELECT ok(pg_catalog.pg_get_viewdef('public.admin_audit_events_v'::regclass) ~* 'jsonb_build_object', 'audit view exposes mapped metadata');

-- Non-admin context cannot write the base table or see admin drafts.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001202', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000001202', 'role', 'authenticated')::text, true);
SELECT throws_ok($$INSERT INTO public.content_drafts (locale, slug, title, description, body, source_urls, verified_at, image_attributions, created_by, updated_by) VALUES ('en'::public.locale, 'task12-denied', 'Denied', 'Denied', 'Denied', '["https://example.org/denied"]'::jsonb, DATE '2026-08-25', '[]'::jsonb, '00000000-0000-0000-0000-000000001202'::uuid, '00000000-0000-0000-0000-000000001202'::uuid)$$, '42501', NULL, 'customer cannot write drafts');
SELECT is((SELECT count(*)::integer FROM public.admin_content_drafts_v), 0, 'customer sees no admin drafts');
RESET ROLE;

-- Owner context writes exactly one EN/VI pair; malformed provenance is
-- rejected by the trigger before the publication RPC can see it.
SET LOCAL ROLE localens_content_admin_owner;
INSERT INTO public.content_drafts (id, locale, slug, title, description, body, source_urls, verified_at, image_attributions, created_by, updated_by)
VALUES
  ('00000000-0000-0000-0000-000000001211'::uuid, 'en'::public.locale, 'task12-market', 'Task 12 Market', 'English market guide', 'Walk through the market with a local guide.', '["https://example.org/task12-market"]'::jsonb, DATE '2026-08-25', '[{"imageUrl":"https://images.example.org/task12-market.jpg","sourceUrl":"https://example.org/task12-market","creator":"LocalLens","license":"CC BY 4.0"}]'::jsonb, '00000000-0000-0000-0000-000000001201'::uuid, '00000000-0000-0000-0000-000000001201'::uuid),
  ('00000000-0000-0000-0000-000000001212'::uuid, 'vi'::public.locale, 'task12-market', 'Chợ Task 12', 'Hướng dẫn chợ bằng tiếng Việt', 'Khám phá chợ cùng hướng dẫn viên địa phương.', '["https://example.org/task12-market-vi"]'::jsonb, DATE '2026-08-25', '[{"imageUrl":"https://images.example.org/task12-market-vi.jpg","sourceUrl":"https://example.org/task12-market-vi","creator":"LocalLens","license":"CC BY 4.0"}]'::jsonb, '00000000-0000-0000-0000-000000001201'::uuid, '00000000-0000-0000-0000-000000001201'::uuid);
SELECT is((SELECT count(*)::integer FROM public.content_drafts WHERE slug = 'task12-market'), 2, 'owner writes bilingual pair');
SELECT throws_ok($$INSERT INTO public.content_drafts (locale, slug, title, description, body, source_urls, verified_at, image_attributions, created_by, updated_by) VALUES ('en'::public.locale, 'task12-http', 'Unsafe', 'Unsafe', 'Unsafe', '["http://example.org/no-tls"]'::jsonb, DATE '2026-08-25', '[]'::jsonb, '00000000-0000-0000-0000-000000001201'::uuid, '00000000-0000-0000-0000-000000001201'::uuid)$$, '23514', NULL, 'non-HTTPS source is rejected');
SELECT throws_ok($$INSERT INTO public.content_drafts (locale, slug, title, description, body, source_urls, verified_at, image_attributions, created_by, updated_by) VALUES ('en'::public.locale, 'task12-image', 'Unsafe', 'Unsafe', 'Unsafe', '["https://example.org/image"]'::jsonb, DATE '2026-08-25', '[{"imageUrl":"https://images.example.org/a#fragment","sourceUrl":"https://example.org/a","creator":"LocalLens","license":"CC BY 4.0"}]'::jsonb, '00000000-0000-0000-0000-000000001201'::uuid, '00000000-0000-0000-0000-000000001201'::uuid)$$, '23514', NULL, 'unsafe image URL is rejected');
SELECT throws_ok($$INSERT INTO public.content_drafts (locale, slug, title, description, body, source_urls, verified_at, image_attributions, created_by, updated_by) VALUES ('en'::public.locale, 'task12-attribution', 'Unsafe', 'Unsafe', 'Unsafe', '["https://example.org/attribution"]'::jsonb, DATE '2026-08-25', '[{"imageUrl":"https://images.example.org/a","sourceUrl":"https://example.org/a","creator":"LocalLens"}]'::jsonb, '00000000-0000-0000-0000-000000001201'::uuid, '00000000-0000-0000-0000-000000001201'::uuid)$$, '23514', NULL, 'incomplete image attribution is rejected');
RESET ROLE;

-- Admin publish snapshots both locales and issues a short-lived capability.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000001201', 'role', 'authenticated')::text, true);
INSERT INTO task12_publish SELECT * FROM public.publish_seo('task12-commit-001', 'task12-build-001');
SELECT is((SELECT count(*)::integer FROM task12_publish), 1, 'publish returns one capability');
SELECT is((SELECT count(*)::integer FROM public.seo_releases WHERE status = 'publishing'::public.content_status), 1, 'candidate enters publishing state');
SELECT is((SELECT count(*)::integer FROM private.content_release_copies WHERE release_id = (SELECT release_id FROM task12_publish)), 2, 'publish snapshots EN and VI copies');
SELECT is((SELECT count(DISTINCT locale)::integer FROM private.content_release_copies WHERE release_id = (SELECT release_id FROM task12_publish)), 2, 'release has both locales');
SELECT is((SELECT read_scope FROM task12_publish), 'published_content_release', 'capability scope is exact');
SELECT ok((SELECT expires_at > clock_timestamp() AND expires_at <= clock_timestamp() + interval '16 minutes' FROM task12_publish), 'capability expires in fifteen minutes');
SELECT ok((SELECT length(capability_nonce) = 64 AND capability_nonce ~ '^[0-9a-f]+$' FROM task12_publish), 'capability nonce is opaque hex');
SELECT ok((SELECT nonce_hash = digest(capability_nonce, 'sha256') FROM private.seo_build_capabilities c JOIN task12_publish p ON p.release_id = c.release_id AND p.build_id = c.build_id), 'only nonce digest is stored');
SELECT is((SELECT count(*)::integer FROM private.audit_events WHERE event_type = 'content_publish_started'::public.audit_event_type AND target_id = (SELECT release_id FROM task12_publish)), 1, 'publish creates start audit event');
SELECT is((SELECT count(*)::integer FROM public.admin_content_drafts_v), 2, 'admin projection returns both drafts');
RESET ROLE;

-- Missing locale/provenance is rejected before a second release is allocated.
SET LOCAL ROLE localens_content_admin_owner;
UPDATE public.content_drafts SET source_urls = '["https://unknown.example.net/task12"]'::jsonb WHERE locale = 'en'::public.locale AND slug = 'task12-market';
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);
SELECT throws_ok($$SELECT * FROM public.publish_seo('task12-unlisted-source', 'task12-build-unlisted-source')$$, '23514', NULL, 'publish rejects source outside allowlist');
RESET ROLE;
SET LOCAL ROLE localens_content_admin_owner;
UPDATE public.content_drafts SET source_urls = '["https://example.org/task12-market"]'::jsonb WHERE locale = 'en'::public.locale AND slug = 'task12-market';
RESET ROLE;
SET LOCAL ROLE localens_content_admin_owner;
UPDATE public.content_drafts SET status = 'published'::public.content_status WHERE locale = 'vi'::public.locale AND slug = 'task12-market';
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);
SELECT throws_ok($$SELECT * FROM public.publish_seo('task12-missing-vi', 'task12-build-missing-vi')$$, '23514', NULL, 'publish rejects missing locale');
RESET ROLE;
SET LOCAL ROLE localens_content_admin_owner;
UPDATE public.content_drafts SET status = 'draft'::public.content_status WHERE locale = 'vi'::public.locale AND slug = 'task12-market';
SELECT throws_ok($$UPDATE public.content_drafts SET image_attributions = '[{"imageUrl":"https://images.example.org/a","sourceUrl":"https://example.org/a","creator":"LocalLens"}]'::jsonb WHERE locale = 'vi'::public.locale AND slug = 'task12-market'$$, '23514', NULL, 'draft update rejects incomplete attribution');
RESET ROLE;

-- Public sees no publishing candidate; build reads only its own capability.
SET LOCAL ROLE localens_content_public_owner;
SELECT is((SELECT count(*)::integer FROM public.published_content_release_v), 0, 'public hides publishing candidate');
RESET ROLE;
SET LOCAL ROLE localens_content_build_executor;
SELECT is((SELECT count(*)::integer FROM public.read_seo_build_release((SELECT release_id FROM task12_publish), (SELECT build_id FROM task12_publish), (SELECT capability_nonce FROM task12_publish))), 2, 'correct nonce reads two copies');
SELECT throws_ok($$SELECT * FROM public.read_seo_build_release((SELECT release_id FROM task12_publish), (SELECT build_id FROM task12_publish), repeat('d', 64))$$, '42501', NULL, 'wrong nonce is rejected');
SELECT throws_ok($$SELECT * FROM public.content_drafts$$, '42501', NULL, 'build cannot read drafts directly');
RESET ROLE;

-- Finalize is CAS and consumes the capability; exact replay is safe while a
-- mismatched nonce cannot mutate the release.
SET LOCAL ROLE localens_content_build_executor;
INSERT INTO task12_finalize SELECT * FROM public.finalize_seo_publish((SELECT release_id FROM task12_publish), (SELECT build_id FROM task12_publish), repeat('a', 64), 'task12-commit-001', (SELECT capability_nonce FROM task12_publish));
SELECT is((SELECT status FROM task12_finalize), 'published'::public.content_status, 'finalize publishes exact candidate');
SELECT is((SELECT status FROM public.seo_releases WHERE id = (SELECT release_id FROM task12_publish)), 'published'::public.content_status, 'release state is published');
SELECT is((SELECT artifact_hash FROM public.seo_releases WHERE id = (SELECT release_id FROM task12_publish)), repeat('a', 64), 'artifact hash is server-bound');
SELECT ok((SELECT published_at IS NOT NULL FROM public.seo_releases WHERE id = (SELECT release_id FROM task12_publish)), 'published timestamp is stored');
SELECT is((SELECT count(*)::integer FROM public.published_content_release_v), 2, 'public exposes only published bilingual copies');
SELECT is((SELECT count(*)::integer FROM private.seo_build_capabilities WHERE release_id = (SELECT release_id FROM task12_publish) AND consumed_at IS NOT NULL), 1, 'finalize consumes nonce');
SELECT throws_ok($$SELECT * FROM public.read_seo_build_release((SELECT release_id FROM task12_publish), (SELECT build_id FROM task12_publish), (SELECT capability_nonce FROM task12_publish))$$, '42501', NULL, 'consumed nonce cannot be read');
SELECT lives_ok($$SELECT * FROM public.finalize_seo_publish((SELECT release_id FROM task12_publish), (SELECT build_id FROM task12_publish), repeat('a', 64), 'task12-commit-001', (SELECT capability_nonce FROM task12_publish))$$, 'exact finalize replay is idempotent');
SELECT throws_ok($$SELECT * FROM public.finalize_seo_publish((SELECT release_id FROM task12_publish), (SELECT build_id FROM task12_publish), repeat('a', 64), 'task12-commit-001', repeat('e', 64))$$, '42501', NULL, 'finalize nonce mismatch is rejected');
RESET ROLE;

-- The second candidate fails and leaves the old published pointer active.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);
INSERT INTO task12_publish SELECT * FROM public.publish_seo('task12-commit-002', 'task12-build-002');
SELECT is((SELECT count(*)::integer FROM public.seo_releases WHERE status = 'published'::public.content_status), 1, 'old live release remains during second build');
SELECT is((SELECT count(*)::integer FROM public.seo_releases WHERE status = 'publishing'::public.content_status), 1, 'second candidate is sole publishing row');
RESET ROLE;
SET LOCAL ROLE localens_content_build_executor;
UPDATE private.seo_build_capabilities SET expires_at = clock_timestamp() - interval '1 minute' WHERE release_id = (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-002') AND build_id = 'task12-build-002';
SELECT throws_ok($$SELECT * FROM public.read_seo_build_release((SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-002'), 'task12-build-002', (SELECT capability_nonce FROM task12_publish WHERE build_id = 'task12-build-002'))$$, '42501', NULL, 'expired capability is rejected');
SELECT is((SELECT status FROM public.seo_releases WHERE build_id = 'task12-build-002'), 'publishing'::public.content_status, 'expired read does not mutate candidate');
UPDATE private.seo_build_capabilities SET expires_at = clock_timestamp() + interval '15 minutes' WHERE release_id = (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-002') AND build_id = 'task12-build-002';
INSERT INTO task12_failed SELECT * FROM public.fail_seo_publish((SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-002'), 'task12-build-002', (SELECT capability_nonce FROM task12_publish WHERE build_id = 'task12-build-002'), 'artifact_invalid');
SELECT is((SELECT status FROM task12_failed), 'failed'::public.content_status, 'failed candidate is marked failed');
SELECT is((SELECT count(*)::integer FROM public.seo_releases WHERE status = 'published'::public.content_status), 1, 'failure does not replace old live release');
SELECT is((SELECT release_id FROM public.published_content_release_v LIMIT 1), (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-001'), 'public pointer remains old release');
SELECT is((SELECT failure_code FROM public.seo_releases WHERE build_id = 'task12-build-002'), 'artifact_invalid', 'failure code is stored');
SELECT lives_ok($$SELECT * FROM public.fail_seo_publish((SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-002'), 'task12-build-002', (SELECT capability_nonce FROM task12_publish WHERE build_id = 'task12-build-002'), 'artifact_invalid')$$, 'exact failure replay is idempotent');
SELECT throws_ok($$SELECT * FROM public.fail_seo_publish((SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-002'), 'task12-build-002', repeat('1', 64), 'artifact_invalid')$$, '42501', NULL, 'failure nonce mismatch is rejected');
RESET ROLE;

-- Guard helpers remain safe under a hostile search_path and the allowlist
-- fails closed for an unknown origin.
SET LOCAL ROLE localens_content_guard_owner;
SET LOCAL search_path TO pg_temp, public, private;
SELECT ok(private.content_url_is_safe('https://example.org/clean') IS TRUE, 'safe URL survives hostile search_path');
SELECT ok(private.content_url_is_safe('http://example.org/no-tls') IS FALSE, 'URL helper rejects HTTP');
SELECT ok(private.content_url_is_safe('https://example.org/a#fragment') IS FALSE, 'URL helper rejects fragments');
SELECT ok(private.content_url_is_safe('https://example.org/a?utm_source=secret') IS FALSE, 'URL helper rejects tracking query');
SELECT ok(private.content_url_is_allowlisted('https://example.org/clean') IS TRUE, 'allowlisted URL passes');
SELECT ok(private.content_url_is_allowlisted('https://unknown.example.net/clean') IS FALSE, 'unknown URL fails closed');
RESET ROLE;

-- Audit helper emits only the closed event vocabulary and admin projection
-- returns safe metadata rather than raw notes/tokens/secrets.
SET LOCAL ROLE localens_content_audit_owner;
SELECT lives_ok($$SELECT private.record_content_audit_event('content_published'::public.audit_event_type, '00000000-0000-0000-0000-000000001201'::uuid, (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-001'), 'publishing', 'published', 'source'::public.audit_metadata_key, 'build', NULL, NULL)$$, 'audit owner appends safe publication event');
SELECT throws_ok($$SELECT private.record_content_audit_event('role_provisioned'::public.audit_event_type, '00000000-0000-0000-0000-000000001201'::uuid, (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-001'), 'publishing', 'published', 'source'::public.audit_metadata_key, 'build', NULL, NULL)$$, '42501', NULL, 'audit helper rejects unrelated event');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);
SELECT is((SELECT metadata FROM public.admin_audit_events_v WHERE event_type = 'content_published'::public.audit_event_type ORDER BY created_at DESC LIMIT 1), '{"source":"build"}'::jsonb, 'audit projection exposes safe metadata');
SELECT ok((SELECT count(*)::integer FROM public.admin_audit_events_v WHERE target_type = 'content_release'::public.audit_target_type) >= 3, 'admin sees content audit history');
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, actor_user_id, target_type, target_id, metadata_key, metadata_text) VALUES ('content_published'::public.audit_event_type, '00000000-0000-0000-0000-000000001201'::uuid, 'content_release'::public.audit_target_type, (SELECT release_id FROM task12_publish WHERE build_id = 'task12-build-001'), 'source'::public.audit_metadata_key, 'email@example.invalid')$$, '42501', NULL, 'authenticated cannot insert audit facts directly');
RESET ROLE;

-- Anonymous reads only the named public projection, not any base table.
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.published_content_release_v), 2, 'anonymous sees current bilingual release');
SELECT throws_ok($$SELECT * FROM public.content_drafts$$, '42501', NULL, 'anonymous cannot read draft base table');
SELECT throws_ok($$SELECT * FROM private.content_release_copies$$, '42501', NULL, 'anonymous cannot read release copies directly');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
