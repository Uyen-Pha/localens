BEGIN;

-- Content publication has three separate trust boundaries: administrators
-- author drafts, a build executor reads one capability-scoped release, and
-- the public view exposes only the last successfully published copy.
-- A failed candidate leaves the previous published release active.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_content_admin_owner') THEN
    EXECUTE 'CREATE ROLE localens_content_admin_owner NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_content_public_owner') THEN
    EXECUTE 'CREATE ROLE localens_content_public_owner NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_content_build_owner') THEN
    EXECUTE 'CREATE ROLE localens_content_build_owner NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_content_guard_owner') THEN
    EXECUTE 'CREATE ROLE localens_content_guard_owner NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_content_audit_owner') THEN
    EXECUTE 'CREATE ROLE localens_content_audit_owner NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_content_build_executor') THEN
    EXECUTE 'CREATE ROLE localens_content_build_executor LOGIN NOBYPASSRLS';
  END IF;
END
$roles$;

ALTER ROLE localens_content_admin_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_content_public_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_content_build_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_content_guard_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_content_audit_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_content_build_executor NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION LOGIN NOBYPASSRLS;

DO $memberships$
DECLARE
  membership_record record;
BEGIN
  FOR membership_record IN
    SELECT granted.rolname AS granted_role, member.rolname AS member_role
    FROM pg_catalog.pg_auth_members AS memberships
    JOIN pg_catalog.pg_roles AS granted ON granted.oid = memberships.roleid
    JOIN pg_catalog.pg_roles AS member ON member.oid = memberships.member
    WHERE granted.rolname IN (
      'localens_content_admin_owner', 'localens_content_public_owner',
      'localens_content_build_owner', 'localens_content_guard_owner',
      'localens_content_audit_owner', 'localens_content_build_executor'
    )
    OR member.rolname IN (
      'localens_content_admin_owner', 'localens_content_public_owner',
      'localens_content_build_owner', 'localens_content_guard_owner',
      'localens_content_audit_owner', 'localens_content_build_executor'
    )
  LOOP
    EXECUTE pg_catalog.format('REVOKE %I FROM %I', membership_record.granted_role, membership_record.member_role);
  END LOOP;
END
$memberships$;

REVOKE ALL ON SCHEMA public, private, auth FROM
  localens_content_admin_owner, localens_content_public_owner,
  localens_content_build_owner, localens_content_guard_owner,
  localens_content_audit_owner, localens_content_build_executor;
REVOKE ALL ON ALL TABLES IN SCHEMA public, private, auth FROM
  localens_content_admin_owner, localens_content_public_owner,
  localens_content_build_owner, localens_content_guard_owner,
  localens_content_audit_owner, localens_content_build_executor;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, private, auth FROM
  localens_content_admin_owner, localens_content_public_owner,
  localens_content_build_owner, localens_content_guard_owner,
  localens_content_audit_owner, localens_content_build_executor;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public, private, auth FROM
  localens_content_admin_owner, localens_content_public_owner,
  localens_content_build_owner, localens_content_guard_owner,
  localens_content_audit_owner, localens_content_build_executor;

-- This is a checked-in source-domain registry. Task 14 may extend it from its
-- approved source manifest; callers cannot modify it through PostgREST.
-- SQL and the build never fetch these URLs; they are provenance links only.
CREATE TABLE private.content_source_domains (
  hostname text PRIMARY KEY CHECK (
    hostname = lower(hostname)
    AND hostname = btrim(hostname)
    AND hostname ~ '^[a-z0-9.-]+\.[a-z]{2,}$'
    AND hostname !~ 'xn--'
    AND hostname !~ '[[:cntrl:]]'
  ),
  purpose text NOT NULL CHECK (purpose IN ('demo', 'approved_source'))
);
-- Task 14 inserts only approved source-manifest domains.  No unverified
-- production hostname is invented in this schema migration.
ALTER TABLE private.content_source_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.content_source_domains FORCE ROW LEVEL SECURITY;
CREATE POLICY content_source_domains_admin_select ON private.content_source_domains
  FOR SELECT TO localens_content_admin_owner USING (current_user = 'localens_content_admin_owner');
CREATE POLICY content_source_domains_public_select ON private.content_source_domains
  FOR SELECT TO localens_content_public_owner USING (current_user = 'localens_content_public_owner');
CREATE POLICY content_source_domains_build_select ON private.content_source_domains
  FOR SELECT TO localens_content_build_owner USING (current_user = 'localens_content_build_owner');
CREATE POLICY content_source_domains_guard_select ON private.content_source_domains
  FOR SELECT TO localens_content_guard_owner USING (current_user = 'localens_content_guard_owner');
REVOKE ALL ON TABLE private.content_source_domains FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.content_url_is_safe(p_url text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  host text;
BEGIN
  IF p_url IS NULL OR p_url <> btrim(p_url) OR length(p_url) > 2048
     OR p_url !~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}([/?]|$)'
     OR p_url ~ '[[:cntrl:]]' OR p_url ~ '@' OR p_url ~ '#'
     OR lower(p_url) ~ '[?&](utm_[^=&#]*|fbclid|gclid)(=|&|$)'
     OR lower(p_url) ~ '[?&]([^=&#]*_)?(email|phone|name|token|session|user|customer)(_[^=&#]*)?(=|&|$)'
     OR lower(p_url) ~ '^https://[^/?#]*xn--[^/?#]*([/?]|$)' THEN
    RETURN false;
  END IF;
  host := lower(pg_catalog.regexp_replace(p_url, '^https://([^/?#]+).*$', '\1'));
  RETURN host IS NOT NULL AND host <> ''
    AND host <> 'localhost'
    AND host !~ '^((10|127|0)\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'
    AND host !~ '^\[(::1|fc|fd|fe80:)';
END;
$function$;
ALTER FUNCTION private.content_url_is_safe(text) OWNER TO localens_content_guard_owner;
REVOKE ALL ON FUNCTION private.content_url_is_safe(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.content_url_is_allowlisted(p_url text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.content_url_is_safe(p_url)
    AND EXISTS (
      SELECT 1 FROM private.content_source_domains AS domains
      WHERE domains.hostname = lower(pg_catalog.regexp_replace(p_url, '^https://([^/?#]+).*$', '\1'))
        AND domains.purpose = 'approved_source'
    );
$function$;
ALTER FUNCTION private.content_url_is_allowlisted(text) OWNER TO localens_content_guard_owner;
REVOKE ALL ON FUNCTION private.content_url_is_allowlisted(text) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO localens_content_admin_owner, localens_content_public_owner,
  localens_content_build_owner, localens_content_build_executor;
GRANT USAGE ON SCHEMA private TO localens_content_admin_owner, localens_content_public_owner,
  localens_content_build_owner, localens_content_guard_owner, localens_content_audit_owner,
  localens_content_build_executor;
GRANT SELECT ON TABLE private.content_source_domains TO localens_content_guard_owner;
GRANT EXECUTE ON FUNCTION private.content_url_is_safe(text), private.content_url_is_allowlisted(text)
  TO localens_content_guard_owner, localens_content_admin_owner, localens_content_build_owner;

CREATE OR REPLACE FUNCTION private.content_provenance_is_allowlisted(
  p_source_urls jsonb,
  p_image_attributions jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  source_url text;
  image_row jsonb;
  image_creator text;
  image_license text;
BEGIN
  IF p_source_urls IS NULL OR jsonb_typeof(p_source_urls) <> 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(p_source_urls) < 1 OR jsonb_array_length(p_source_urls) > 32 THEN
    RETURN false;
  END IF;
  FOR source_url IN SELECT value FROM pg_catalog.jsonb_array_elements_text(p_source_urls)
  LOOP
    IF NOT private.content_url_is_allowlisted(source_url) THEN
      RETURN false;
    END IF;
  END LOOP;
  IF p_image_attributions IS NULL OR jsonb_typeof(p_image_attributions) <> 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(p_image_attributions) > 32 THEN
    RETURN false;
  END IF;
  FOR image_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_image_attributions)
  LOOP
    IF jsonb_typeof(image_row) <> 'object'
       OR NOT (image_row ?& ARRAY['imageUrl', 'sourceUrl', 'creator', 'license'])
       OR (SELECT count(*) FROM jsonb_object_keys(image_row)) <> 4
       OR NOT private.content_url_is_allowlisted(image_row ->> 'imageUrl')
       OR NOT private.content_url_is_allowlisted(image_row ->> 'sourceUrl') THEN
      RETURN false;
    END IF;
    image_creator := image_row ->> 'creator';
    image_license := image_row ->> 'license';
    IF image_creator IS NULL OR btrim(image_creator) = ''
       OR image_creator <> btrim(image_creator) OR image_creator ~ '[[:cntrl:]<>]'
       OR image_license IS NULL OR btrim(image_license) = ''
       OR image_license <> btrim(image_license) OR image_license ~ '[[:cntrl:]<>]' THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$function$;
ALTER FUNCTION private.content_provenance_is_allowlisted(jsonb, jsonb) OWNER TO localens_content_guard_owner;
REVOKE ALL ON FUNCTION private.content_provenance_is_allowlisted(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.content_provenance_is_allowlisted(jsonb, jsonb)
  TO localens_content_guard_owner, localens_content_admin_owner, localens_content_build_owner;

CREATE TABLE public.content_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locale public.locale NOT NULL,
  slug text NOT NULL CHECK (slug = btrim(slug) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND length(slug) <= 160),
  title text NOT NULL CHECK (title = btrim(title) AND length(title) BETWEEN 1 AND 240 AND title !~ '[<>]' AND title !~ '[[:cntrl:]]'),
  description text NOT NULL CHECK (description = btrim(description) AND length(description) BETWEEN 1 AND 2000 AND description !~ '[<>]' AND description !~ '[[:cntrl:]]'),
  body text NOT NULL CHECK (body = btrim(body) AND length(body) BETWEEN 1 AND 100000 AND body !~ '[<>]' AND body !~ '[[:cntrl:]]'),
  source_urls jsonb NOT NULL CHECK (jsonb_typeof(source_urls) = 'array' AND jsonb_array_length(source_urls) BETWEEN 1 AND 32),
  verified_at date NOT NULL,
  image_attributions jsonb NOT NULL CHECK (jsonb_typeof(image_attributions) = 'array' AND jsonb_array_length(image_attributions) <= 32),
  status public.content_status NOT NULL DEFAULT 'draft'::public.content_status CHECK (status = 'draft'::public.content_status),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (locale, slug)
);

CREATE TABLE public.seo_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status public.content_status NOT NULL DEFAULT 'draft'::public.content_status,
  source_commit text NOT NULL CHECK (source_commit = btrim(source_commit) AND source_commit ~ '^[A-Za-z0-9._/-]{7,200}$'),
  build_id text NOT NULL CHECK (build_id = btrim(build_id) AND build_id ~ '^[A-Za-z0-9._/-]{1,200}$'),
  artifact_hash text CHECK (artifact_hash IS NULL OR artifact_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  publishing_at timestamptz,
  published_at timestamptz,
  failed_at timestamptz,
  failure_code text CHECK (failure_code IS NULL OR (failure_code = btrim(failure_code) AND failure_code ~ '^[a-z][a-z0-9_]{0,63}$')),
  UNIQUE (id, status)
);

CREATE TABLE private.content_release_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES public.seo_releases(id) ON DELETE RESTRICT,
  locale public.locale NOT NULL,
  slug text NOT NULL CHECK (slug = btrim(slug) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND length(slug) <= 160),
  title text NOT NULL CHECK (title = btrim(title) AND length(title) BETWEEN 1 AND 240 AND title !~ '[<>]' AND title !~ '[[:cntrl:]]'),
  description text NOT NULL CHECK (description = btrim(description) AND length(description) BETWEEN 1 AND 2000 AND description !~ '[<>]' AND description !~ '[[:cntrl:]]'),
  body text NOT NULL CHECK (body = btrim(body) AND length(body) BETWEEN 1 AND 100000 AND body !~ '[<>]' AND body !~ '[[:cntrl:]]'),
  source_urls jsonb NOT NULL CHECK (jsonb_typeof(source_urls) = 'array' AND jsonb_array_length(source_urls) BETWEEN 1 AND 32),
  verified_at date NOT NULL,
  image_attributions jsonb NOT NULL CHECK (jsonb_typeof(image_attributions) = 'array' AND jsonb_array_length(image_attributions) <= 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (release_id, locale, slug)
);

CREATE TABLE private.seo_build_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES public.seo_releases(id) ON DELETE RESTRICT,
  build_id text NOT NULL CHECK (build_id = btrim(build_id) AND build_id ~ '^[A-Za-z0-9._/-]{1,200}$'),
  source_commit text NOT NULL CHECK (source_commit = btrim(source_commit) AND source_commit ~ '^[A-Za-z0-9._/-]{7,200}$'),
  artifact_hash text CHECK (artifact_hash IS NULL OR artifact_hash ~ '^[0-9a-f]{64}$'),
  nonce_hash bytea NOT NULL CHECK (octet_length(nonce_hash) = 32),
  expires_at timestamptz NOT NULL,
  read_scope text NOT NULL CHECK (read_scope IN ('published_content_release')),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (release_id, build_id)
);

-- Published releases are immutable historical records.  This singleton is the
-- only mutable live pointer, so swapping the current release never mutates or
-- archives the previously published release.
CREATE TABLE private.seo_live_pointer (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  release_id uuid NOT NULL REFERENCES public.seo_releases(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.content_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_drafts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.seo_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_releases FORCE ROW LEVEL SECURITY;
ALTER TABLE private.content_release_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.content_release_copies FORCE ROW LEVEL SECURITY;
ALTER TABLE private.seo_build_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.seo_build_capabilities FORCE ROW LEVEL SECURITY;
ALTER TABLE private.seo_live_pointer ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.seo_live_pointer FORCE ROW LEVEL SECURITY;

CREATE POLICY content_drafts_admin_owner_all ON public.content_drafts
  FOR ALL TO localens_content_admin_owner USING (current_user = 'localens_content_admin_owner')
  WITH CHECK (current_user = 'localens_content_admin_owner');
CREATE POLICY seo_releases_admin_owner_all ON public.seo_releases
  FOR ALL TO localens_content_admin_owner USING (current_user = 'localens_content_admin_owner')
  WITH CHECK (current_user = 'localens_content_admin_owner');
CREATE POLICY seo_releases_build_owner_select ON public.seo_releases
  FOR SELECT TO localens_content_build_owner USING (current_user = 'localens_content_build_owner');
CREATE POLICY content_release_copies_public_owner_select ON private.content_release_copies
  FOR SELECT TO localens_content_public_owner USING (
    current_user = 'localens_content_public_owner'
    AND EXISTS (
      SELECT 1 FROM public.seo_releases AS releases
      WHERE releases.id = content_release_copies.release_id
        AND releases.status = 'published'::public.content_status
        AND EXISTS (
          SELECT 1 FROM private.seo_live_pointer AS live
          WHERE live.release_id = content_release_copies.release_id
        )
    )
  );
CREATE POLICY content_release_copies_build_owner_select ON private.content_release_copies
  FOR SELECT TO localens_content_build_owner USING (current_user = 'localens_content_build_owner');
CREATE POLICY content_release_copies_admin_owner_select ON private.content_release_copies
  FOR SELECT TO localens_content_admin_owner USING (current_user = 'localens_content_admin_owner');
CREATE POLICY seo_build_capabilities_build_owner_all ON private.seo_build_capabilities
  FOR ALL TO localens_content_build_owner USING (current_user = 'localens_content_build_owner')
  WITH CHECK (current_user = 'localens_content_build_owner');
CREATE POLICY seo_build_capabilities_admin_owner_select ON private.seo_build_capabilities
  FOR SELECT TO localens_content_admin_owner USING (current_user = 'localens_content_admin_owner');
CREATE POLICY seo_live_pointer_public_owner_select ON private.seo_live_pointer
  FOR SELECT TO localens_content_public_owner USING (current_user = 'localens_content_public_owner');
CREATE POLICY seo_live_pointer_build_owner_all ON private.seo_live_pointer
  FOR ALL TO localens_content_build_owner USING (current_user = 'localens_content_build_owner')
  WITH CHECK (current_user = 'localens_content_build_owner');

REVOKE ALL ON TABLE public.content_drafts, public.seo_releases,
  private.content_release_copies, private.seo_build_capabilities, private.seo_live_pointer
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.content_release_copies, private.seo_build_capabilities, private.seo_live_pointer FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.content_drafts TO localens_content_admin_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE public.seo_releases TO localens_content_admin_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE private.content_release_copies TO localens_content_admin_owner, localens_content_build_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE private.seo_build_capabilities TO localens_content_build_owner;
GRANT SELECT ON TABLE private.seo_build_capabilities TO localens_content_admin_owner;
GRANT SELECT ON TABLE private.seo_live_pointer TO localens_content_public_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE private.seo_live_pointer TO localens_content_build_owner;

CREATE UNIQUE INDEX seo_releases_one_publishing ON public.seo_releases (status)
  WHERE status = 'publishing'::public.content_status;
CREATE INDEX seo_releases_status_created_idx ON public.seo_releases (status, created_at DESC);
CREATE INDEX content_release_copies_release_locale_idx ON private.content_release_copies (release_id, locale, slug);
CREATE INDEX seo_build_capabilities_expiry_idx ON private.seo_build_capabilities (release_id, expires_at);
CREATE INDEX seo_live_pointer_release_idx ON private.seo_live_pointer (release_id);

CREATE OR REPLACE FUNCTION private.assert_content_json_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  source_url text;
  image_row jsonb;
  image_url text;
  image_source_url text;
  image_creator text;
  image_license text;
BEGIN
  IF NEW.source_urls IS NULL OR jsonb_typeof(NEW.source_urls) <> 'array'
     OR jsonb_array_length(NEW.source_urls) < 1 OR jsonb_array_length(NEW.source_urls) > 32 THEN
    RAISE EXCEPTION 'content source completeness failed' USING ERRCODE = '23514';
  END IF;
  FOR source_url IN SELECT value FROM pg_catalog.jsonb_array_elements_text(NEW.source_urls)
  LOOP
    IF NOT private.content_url_is_safe(source_url) THEN
      RAISE EXCEPTION 'content source safety failed' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF NEW.image_attributions IS NULL OR jsonb_typeof(NEW.image_attributions) <> 'array'
     OR jsonb_array_length(NEW.image_attributions) > 32 THEN
    RAISE EXCEPTION 'image attribution completeness failed' USING ERRCODE = '23514';
  END IF;
  FOR image_row IN SELECT value FROM pg_catalog.jsonb_array_elements(NEW.image_attributions)
  LOOP
    IF jsonb_typeof(image_row) <> 'object'
       OR NOT (image_row ?& ARRAY['imageUrl', 'sourceUrl', 'creator', 'license'])
       OR (SELECT count(*) FROM jsonb_object_keys(image_row)) <> 4 THEN
      RAISE EXCEPTION 'image attribution shape failed' USING ERRCODE = '23514';
    END IF;
    image_url := image_row ->> 'imageUrl';
    image_source_url := image_row ->> 'sourceUrl';
    image_creator := image_row ->> 'creator';
    image_license := image_row ->> 'license';
    IF NOT private.content_url_is_safe(image_url)
       OR NOT private.content_url_is_safe(image_source_url)
       OR image_creator IS NULL OR btrim(image_creator) = '' OR image_creator <> btrim(image_creator) OR image_creator ~ '[[:cntrl:]<>]'
       OR image_license IS NULL OR btrim(image_license) = '' OR image_license <> btrim(image_license) OR image_license ~ '[[:cntrl:]<>]' THEN
      RAISE EXCEPTION 'image attribution safety failed' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF NOT private.content_provenance_is_allowlisted(NEW.source_urls, NEW.image_attributions) THEN
    RAISE EXCEPTION 'content provenance allowlist failed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_content_json_safe() OWNER TO localens_content_guard_owner;
REVOKE ALL ON FUNCTION private.assert_content_json_safe() FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO localens_content_guard_owner;
GRANT EXECUTE ON FUNCTION private.content_url_is_allowlisted(text) TO localens_content_guard_owner;
GRANT SELECT ON TABLE private.content_source_domains TO localens_content_guard_owner;
CREATE TRIGGER content_drafts_json_safety BEFORE INSERT OR UPDATE OF source_urls, image_attributions ON public.content_drafts
  FOR EACH ROW EXECUTE FUNCTION private.assert_content_json_safe();
CREATE TRIGGER content_release_copies_json_safety BEFORE INSERT OR UPDATE OF source_urls, image_attributions ON private.content_release_copies
  FOR EACH ROW EXECUTE FUNCTION private.assert_content_json_safe();

CREATE OR REPLACE FUNCTION private.assert_seo_release_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft'::public.content_status OR NEW.artifact_hash IS NOT NULL
       OR NEW.publishing_at IS NOT NULL OR NEW.published_at IS NOT NULL
       OR NEW.failed_at IS NOT NULL OR NEW.failure_code IS NOT NULL THEN
      RAISE EXCEPTION 'invalid initial content release state' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.created_at IS DISTINCT FROM NEW.created_at OR OLD.source_commit IS DISTINCT FROM NEW.source_commit
     OR OLD.build_id IS DISTINCT FROM NEW.build_id
     OR OLD.publishing_at IS DISTINCT FROM NEW.publishing_at AND OLD.status <> 'draft'::public.content_status
     OR NOT ((OLD.status = 'draft'::public.content_status AND NEW.status = 'publishing'::public.content_status)
       OR (OLD.status = 'publishing'::public.content_status AND NEW.status IN ('published'::public.content_status, 'failed'::public.content_status))) THEN
    RAISE EXCEPTION 'content release state transition is invalid' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'draft'::public.content_status THEN
    IF NEW.publishing_at IS NULL OR NEW.artifact_hash IS NOT NULL
       OR NEW.published_at IS NOT NULL OR NEW.failed_at IS NOT NULL OR NEW.failure_code IS NOT NULL THEN
      RAISE EXCEPTION 'draft publishing transition is incomplete' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = 'publishing'::public.content_status AND NEW.status = 'published'::public.content_status THEN
    IF NEW.publishing_at IS DISTINCT FROM OLD.publishing_at
       OR NEW.artifact_hash IS NULL OR NEW.published_at IS NULL
       OR NEW.failed_at IS NOT NULL OR NEW.failure_code IS NOT NULL THEN
      RAISE EXCEPTION 'published release provenance is incomplete' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = 'publishing'::public.content_status AND NEW.status = 'failed'::public.content_status THEN
    IF NEW.publishing_at IS DISTINCT FROM OLD.publishing_at
       OR NEW.artifact_hash IS NOT NULL OR NEW.published_at IS NOT NULL
       OR NEW.failed_at IS NULL OR NEW.failure_code IS NULL THEN
      RAISE EXCEPTION 'failed release transition is incomplete' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_seo_release_transition() OWNER TO localens_content_guard_owner;
REVOKE ALL ON FUNCTION private.assert_seo_release_transition() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER seo_release_state_guard BEFORE INSERT OR UPDATE ON public.seo_releases
  FOR EACH ROW EXECUTE FUNCTION private.assert_seo_release_transition();

CREATE OR REPLACE FUNCTION private.assert_seo_live_pointer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.seo_releases AS releases
    WHERE releases.id = NEW.release_id
      AND releases.status = 'published'::public.content_status
  ) THEN
    RAISE EXCEPTION 'live pointer requires a published release' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_seo_live_pointer() OWNER TO localens_content_build_owner;
REVOKE ALL ON FUNCTION private.assert_seo_live_pointer() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER seo_live_pointer_published_guard
  BEFORE INSERT OR UPDATE ON private.seo_live_pointer
  FOR EACH ROW EXECUTE FUNCTION private.assert_seo_live_pointer();

CREATE OR REPLACE FUNCTION private.reject_content_copy_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'content release copies are immutable' USING ERRCODE = '42501';
END;
$function$;
ALTER FUNCTION private.reject_content_copy_mutation() OWNER TO localens_content_guard_owner;
REVOKE ALL ON FUNCTION private.reject_content_copy_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER content_release_copies_append_only BEFORE UPDATE OR DELETE ON private.content_release_copies
  FOR EACH ROW EXECUTE FUNCTION private.reject_content_copy_mutation();
CREATE TRIGGER content_release_copies_append_only_truncate BEFORE TRUNCATE ON private.content_release_copies
  FOR EACH STATEMENT EXECUTE FUNCTION private.reject_content_copy_mutation();

CREATE OR REPLACE FUNCTION private.record_content_audit_event(
  p_event_type public.audit_event_type,
  p_actor_user_id uuid,
  p_target_id uuid,
  p_from_state text,
  p_to_state text,
  p_metadata_key public.audit_metadata_key DEFAULT NULL,
  p_metadata_text text DEFAULT NULL,
  p_metadata_number numeric DEFAULT NULL,
  p_metadata_boolean boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_event_type NOT IN ('content_publish_started'::public.audit_event_type, 'content_published'::public.audit_event_type, 'content_publish_failed'::public.audit_event_type)
     OR p_actor_user_id IS NULL OR p_target_id IS NULL THEN
    RAISE EXCEPTION 'invalid content audit event' USING ERRCODE = '42501';
  END IF;
  INSERT INTO private.audit_events (event_type, actor_user_id, actor_role, target_type, target_id, from_state, to_state, metadata_key, metadata_text, metadata_number, metadata_boolean, created_at)
  VALUES (p_event_type, p_actor_user_id, 'admin'::public.app_role, 'content_release'::public.audit_target_type, p_target_id, p_from_state, p_to_state, p_metadata_key, p_metadata_text, p_metadata_number, p_metadata_boolean, pg_catalog.clock_timestamp());
END;
$function$;
ALTER FUNCTION private.record_content_audit_event(public.audit_event_type, uuid, uuid, text, text, public.audit_metadata_key, text, numeric, boolean) OWNER TO localens_content_audit_owner;
REVOKE ALL ON FUNCTION private.record_content_audit_event(public.audit_event_type, uuid, uuid, text, text, public.audit_metadata_key, text, numeric, boolean) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO localens_content_audit_owner;
GRANT INSERT ON TABLE private.audit_events TO localens_content_audit_owner;
GRANT EXECUTE ON FUNCTION private.record_content_audit_event(public.audit_event_type, uuid, uuid, text, text, public.audit_metadata_key, text, numeric, boolean) TO localens_content_audit_owner;
CREATE POLICY audit_events_content_owner_insert ON private.audit_events
  FOR INSERT TO localens_content_audit_owner WITH CHECK (current_user = 'localens_content_audit_owner' AND target_type = 'content_release'::public.audit_target_type);
CREATE POLICY audit_events_content_admin_owner_select ON private.audit_events
  FOR SELECT TO localens_content_admin_owner USING (current_user = 'localens_content_admin_owner' AND target_type = 'content_release'::public.audit_target_type);
GRANT SELECT ON TABLE private.audit_events TO localens_content_admin_owner;

CREATE OR REPLACE VIEW public.admin_content_drafts_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT d.id, d.locale, d.slug, d.title, d.description, d.body,
  d.source_urls, d.verified_at::text AS verified_at, d.image_attributions,
  d.status, d.updated_at
FROM public.content_drafts AS d
WHERE EXISTS (
  SELECT 1 FROM private.user_roles AS roles
  WHERE roles.user_id = (SELECT auth.uid())
    AND roles.role = 'admin'::public.app_role
);
ALTER VIEW public.admin_content_drafts_v OWNER TO localens_content_admin_owner;
REVOKE ALL ON public.admin_content_drafts_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_content_drafts_v TO localens_content_admin_owner, authenticated;

CREATE OR REPLACE VIEW public.published_content_release_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT c.release_id, c.locale, c.slug, c.title, c.description, c.body,
  c.source_urls, c.verified_at::text AS verified_at, c.image_attributions,
  r.published_at
FROM private.content_release_copies AS c
JOIN public.seo_releases AS r ON r.id = c.release_id
JOIN private.seo_live_pointer AS live ON live.release_id = c.release_id
WHERE r.status = 'published'::public.content_status;
ALTER VIEW public.published_content_release_v OWNER TO localens_content_public_owner;
REVOKE ALL ON public.published_content_release_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.published_content_release_v TO anon, authenticated;
GRANT SELECT ON TABLE public.seo_releases TO localens_content_public_owner;
CREATE POLICY seo_releases_public_owner_select ON public.seo_releases
  FOR SELECT TO localens_content_public_owner USING (
    status = 'published'::public.content_status
    AND EXISTS (
      SELECT 1 FROM private.seo_live_pointer AS live
      WHERE live.release_id = seo_releases.id
    )
  );

CREATE OR REPLACE VIEW public.admin_audit_events_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT events.id, events.event_type, events.actor_user_id, events.actor_role,
  events.target_type, events.target_id, events.from_state, events.to_state,
  events.correlation_id,
  CASE
    WHEN events.metadata_key IS NULL THEN '{}'::jsonb
    WHEN events.metadata_key IN ('role', 'source', 'status', 'state', 'decision', 'provider', 'currency')
      THEN pg_catalog.jsonb_build_object(events.metadata_key::text, events.metadata_text)
    WHEN events.metadata_key IN ('count', 'revision', 'attempt_no', 'amount_minor')
      THEN pg_catalog.jsonb_build_object(events.metadata_key::text, events.metadata_number)
    ELSE pg_catalog.jsonb_build_object(events.metadata_key::text, events.metadata_boolean)
  END AS metadata,
  events.created_at
FROM private.audit_events AS events
WHERE events.target_type = 'content_release'::public.audit_target_type
  AND EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = (SELECT auth.uid())
      AND roles.role = 'admin'::public.app_role
  );
ALTER VIEW public.admin_audit_events_v OWNER TO localens_content_admin_owner;
REVOKE ALL ON public.admin_audit_events_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_audit_events_v TO localens_content_admin_owner;
GRANT SELECT ON public.admin_audit_events_v TO authenticated;

CREATE OR REPLACE FUNCTION private.assert_content_admin()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE actor uuid;
BEGIN
  actor := (SELECT auth.uid());
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.user_roles AS roles WHERE roles.user_id = actor AND roles.role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;
  RETURN actor;
END;
$function$;
ALTER FUNCTION private.assert_content_admin() OWNER TO localens_content_admin_owner;
REVOKE ALL ON FUNCTION private.assert_content_admin() FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA auth TO localens_content_admin_owner;
GRANT EXECUTE ON FUNCTION auth.uid() TO localens_content_admin_owner;
GRANT SELECT ON TABLE private.user_roles TO localens_content_admin_owner;
GRANT EXECUTE ON FUNCTION private.assert_content_admin() TO localens_content_admin_owner;
CREATE POLICY user_roles_content_admin_select ON private.user_roles
  FOR SELECT TO localens_content_admin_owner USING (current_user = 'localens_content_admin_owner');

CREATE OR REPLACE FUNCTION public.upsert_content_draft(
  p_locale public.locale,
  p_slug text,
  p_title text,
  p_description text,
  p_body text,
  p_source_urls jsonb,
  p_verified_at date,
  p_image_attributions jsonb
)
RETURNS TABLE (
  id uuid,
  locale public.locale,
  slug text,
  title text,
  description text,
  body text,
  source_urls jsonb,
  verified_at text,
  image_attributions jsonb,
  status public.content_status,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid;
  result_id uuid;
  result_locale public.locale;
  result_slug text;
  result_title text;
  result_description text;
  result_body text;
  result_source_urls jsonb;
  result_verified_at date;
  result_image_attributions jsonb;
  result_status public.content_status;
  result_updated_at timestamptz;
BEGIN
  actor := private.assert_content_admin();
  IF NOT private.content_provenance_is_allowlisted(p_source_urls, p_image_attributions) THEN
    RAISE EXCEPTION 'content provenance is not allowlisted' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.content_drafts AS drafts (
    locale, slug, title, description, body, source_urls, verified_at,
    image_attributions, created_by, updated_by
  )
  VALUES (
    p_locale, p_slug, p_title, p_description, p_body, p_source_urls,
    p_verified_at, p_image_attributions, actor, actor
  )
  ON CONFLICT ON CONSTRAINT content_drafts_locale_slug_key DO UPDATE
  SET title = EXCLUDED.title,
      description = EXCLUDED.description,
      body = EXCLUDED.body,
      source_urls = EXCLUDED.source_urls,
      verified_at = EXCLUDED.verified_at,
      image_attributions = EXCLUDED.image_attributions,
      updated_by = actor,
      updated_at = pg_catalog.clock_timestamp()
  RETURNING drafts.id, drafts.locale, drafts.slug, drafts.title, drafts.description,
    drafts.body, drafts.source_urls, drafts.verified_at, drafts.image_attributions,
    drafts.status, drafts.updated_at
  INTO result_id, result_locale, result_slug, result_title, result_description,
    result_body, result_source_urls, result_verified_at, result_image_attributions,
    result_status, result_updated_at;
  id := result_id;
  locale := result_locale;
  slug := result_slug;
  title := result_title;
  description := result_description;
  body := result_body;
  source_urls := result_source_urls;
  verified_at := result_verified_at::text;
  image_attributions := result_image_attributions;
  status := result_status;
  updated_at := result_updated_at;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION public.upsert_content_draft(public.locale, text, text, text, text, jsonb, date, jsonb)
  OWNER TO localens_content_admin_owner;
REVOKE ALL ON FUNCTION public.upsert_content_draft(public.locale, text, text, text, text, jsonb, date, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_content_draft(public.locale, text, text, text, text, jsonb, date, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_seo(p_source_commit text, p_build_id text)
RETURNS TABLE (release_id uuid, build_id text, capability_nonce text, expires_at timestamptz, read_scope text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid;
  release_row public.seo_releases%ROWTYPE;
  active_release public.seo_releases%ROWTYPE;
  active_capability private.seo_build_capabilities%ROWTYPE;
  draft_row record;
  nonce text;
  capability_expiry timestamptz;
  authority_time timestamptz;
BEGIN
  actor := private.assert_content_admin();
  IF p_source_commit IS NULL OR p_source_commit !~ '^[A-Za-z0-9._/-]{7,200}$'
     OR p_build_id IS NULL OR p_build_id !~ '^[A-Za-z0-9._/-]{1,200}$' THEN
    RAISE EXCEPTION 'invalid content release identity' USING ERRCODE = '22023';
  END IF;
  -- A content release is atomic: every complete EN/VI draft slug in this
  -- table forms one content version and is snapshotted together.  Do not
  -- fetch source URLs here or in the build; they are provenance links only.
  SELECT releases.id, releases.status, releases.source_commit, releases.build_id,
    releases.artifact_hash, releases.created_by, releases.created_at,
    releases.publishing_at, releases.published_at, releases.failed_at, releases.failure_code
  INTO active_release
  FROM public.seo_releases AS releases
  WHERE releases.status = 'publishing'::public.content_status
  ORDER BY releases.publishing_at, releases.created_at
  LIMIT 1
  FOR UPDATE;
  IF active_release.id IS NOT NULL THEN
    SELECT capabilities.id, capabilities.release_id, capabilities.build_id, capabilities.source_commit,
      capabilities.artifact_hash, capabilities.nonce_hash, capabilities.expires_at,
      capabilities.read_scope, capabilities.consumed_at, capabilities.created_at
    INTO active_capability
    FROM private.seo_build_capabilities AS capabilities
    WHERE capabilities.release_id = active_release.id
    FOR UPDATE;
    authority_time := pg_catalog.clock_timestamp();
    IF active_capability.id IS NULL
       OR active_capability.consumed_at IS NOT NULL
       OR active_capability.expires_at <= authority_time THEN
      UPDATE public.seo_releases
      SET status = 'failed'::public.content_status,
          failed_at = authority_time,
          failure_code = 'capability_expired'
      WHERE id = active_release.id;
      IF active_capability.id IS NOT NULL AND active_capability.consumed_at IS NULL THEN
        UPDATE private.seo_build_capabilities
        SET consumed_at = authority_time
        WHERE id = active_capability.id;
      END IF;
      PERFORM private.record_content_audit_event(
        'content_publish_failed'::public.audit_event_type,
        active_release.created_by,
        active_release.id,
        'publishing',
        'failed',
        'source'::public.audit_metadata_key,
        'build',
        NULL,
        NULL
      );
    ELSE
      RAISE EXCEPTION 'content release already publishing' USING ERRCODE = '55006';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.content_drafts WHERE status = 'draft'::public.content_status)
     OR EXISTS (
       SELECT 1
       FROM public.content_drafts
       WHERE status = 'draft'::public.content_status
       GROUP BY slug
       HAVING count(*) <> 2
          OR count(*) FILTER (WHERE locale = 'en'::public.locale) <> 1
          OR count(*) FILTER (WHERE locale = 'vi'::public.locale) <> 1
     )
     OR EXISTS (
       SELECT 1
       FROM public.content_drafts AS drafts
       CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(drafts.source_urls) AS unnest_urls(value)
       WHERE drafts.status = 'draft'::public.content_status
         AND NOT private.content_url_is_allowlisted(unnest_urls.value)
     )
     OR EXISTS (
       SELECT 1
       FROM public.content_drafts AS drafts
       CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(drafts.image_attributions) AS images(value)
       WHERE drafts.status = 'draft'::public.content_status
         AND (
           NOT private.content_url_is_allowlisted(images.value ->> 'imageUrl')
           OR NOT private.content_url_is_allowlisted(images.value ->> 'sourceUrl')
         )
     ) THEN
    RAISE EXCEPTION 'content release requires complete en/vi source copies' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.seo_releases (status, source_commit, build_id, created_by)
  VALUES ('draft'::public.content_status, p_source_commit, p_build_id, actor)
  RETURNING id, status, source_commit, build_id, artifact_hash, created_by, created_at,
    publishing_at, published_at, failed_at, failure_code INTO release_row;
  FOR draft_row IN
    SELECT locale, slug, title, description, body, source_urls, verified_at, image_attributions
    FROM public.content_drafts
    WHERE status = 'draft'::public.content_status
    ORDER BY locale, slug
  LOOP
    INSERT INTO private.content_release_copies (release_id, locale, slug, title, description, body, source_urls, verified_at, image_attributions)
    VALUES (release_row.id, draft_row.locale, draft_row.slug, draft_row.title, draft_row.description, draft_row.body, draft_row.source_urls, draft_row.verified_at, draft_row.image_attributions);
  END LOOP;
  UPDATE public.seo_releases
  SET status = 'publishing'::public.content_status, publishing_at = pg_catalog.clock_timestamp()
  WHERE id = release_row.id;
  nonce := pg_catalog.encode(pg_catalog.gen_random_bytes(32), 'hex');
  capability_expiry := pg_catalog.clock_timestamp() + interval '15 minutes';
  INSERT INTO private.seo_build_capabilities (release_id, build_id, source_commit, artifact_hash, nonce_hash, expires_at, read_scope)
  VALUES (release_row.id, p_build_id, p_source_commit, NULL, pg_catalog.digest(pg_catalog.convert_to(nonce, 'utf8'), 'sha256'), capability_expiry, 'published_content_release');
  PERFORM private.record_content_audit_event('content_publish_started'::public.audit_event_type, actor, release_row.id, 'draft', 'publishing', 'source'::public.audit_metadata_key, 'build', NULL, NULL);
  release_id := release_row.id;
  build_id := p_build_id;
  capability_nonce := nonce;
  expires_at := capability_expiry;
  read_scope := 'published_content_release';
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION public.publish_seo(text, text) OWNER TO localens_content_admin_owner;
REVOKE ALL ON FUNCTION public.publish_seo(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_seo(text, text) TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.content_drafts, public.seo_releases TO localens_content_admin_owner;
GRANT INSERT ON TABLE private.content_release_copies, private.seo_build_capabilities TO localens_content_admin_owner;
GRANT UPDATE ON TABLE private.seo_build_capabilities TO localens_content_admin_owner;
GRANT EXECUTE ON FUNCTION private.record_content_audit_event(public.audit_event_type, uuid, uuid, text, text, public.audit_metadata_key, text, numeric, boolean) TO localens_content_admin_owner;
CREATE POLICY content_release_copies_admin_owner_insert ON private.content_release_copies
  FOR INSERT TO localens_content_admin_owner WITH CHECK (current_user = 'localens_content_admin_owner');
CREATE POLICY seo_build_capabilities_admin_owner_insert ON private.seo_build_capabilities
  FOR INSERT TO localens_content_admin_owner WITH CHECK (current_user = 'localens_content_admin_owner');
CREATE POLICY seo_build_capabilities_admin_owner_update ON private.seo_build_capabilities
  FOR UPDATE TO localens_content_admin_owner USING (current_user = 'localens_content_admin_owner')
  WITH CHECK (current_user = 'localens_content_admin_owner');
CREATE POLICY audit_events_content_admin_owner_insert ON private.audit_events
  FOR INSERT TO localens_content_admin_owner WITH CHECK (current_user = 'localens_content_admin_owner' AND target_type = 'content_release'::public.audit_target_type);

CREATE OR REPLACE FUNCTION public.read_seo_build_release(p_release_id uuid, p_build_id text, p_capability_nonce text)
RETURNS TABLE (locale public.locale, slug text, title text, description text, body text, source_urls jsonb, verified_at text, image_attributions jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE capability_row private.seo_build_capabilities%ROWTYPE;
BEGIN
  SELECT capabilities.id, capabilities.release_id, capabilities.build_id, capabilities.source_commit,
    capabilities.artifact_hash, capabilities.nonce_hash, capabilities.expires_at, capabilities.read_scope,
    capabilities.consumed_at, capabilities.created_at
  INTO capability_row FROM private.seo_build_capabilities AS capabilities
  JOIN public.seo_releases AS releases ON releases.id = capabilities.release_id
  WHERE capabilities.release_id = p_release_id
    AND capabilities.build_id = p_build_id
    AND releases.status = 'publishing'::public.content_status
  FOR UPDATE OF capabilities;
  IF NOT FOUND OR capability_row.consumed_at IS NOT NULL OR capability_row.expires_at <= pg_catalog.clock_timestamp()
     OR capability_row.read_scope <> 'published_content_release'
     OR p_capability_nonce IS NULL OR pg_catalog.digest(pg_catalog.convert_to(p_capability_nonce, 'utf8'), 'sha256') <> capability_row.nonce_hash THEN
    RAISE EXCEPTION 'content build capability invalid' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT copies.locale, copies.slug, copies.title, copies.description, copies.body, copies.source_urls,
    copies.verified_at::text, copies.image_attributions
  FROM private.content_release_copies AS copies
  WHERE copies.release_id = p_release_id
  ORDER BY copies.locale, copies.slug;
END;
$function$;
ALTER FUNCTION public.read_seo_build_release(uuid, text, text) OWNER TO localens_content_build_owner;
REVOKE ALL ON FUNCTION public.read_seo_build_release(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_seo_build_release(uuid, text, text) TO localens_content_build_executor;
GRANT SELECT ON TABLE private.seo_build_capabilities TO localens_content_build_owner;
GRANT SELECT ON TABLE private.content_release_copies TO localens_content_build_owner;

CREATE OR REPLACE FUNCTION public.finalize_seo_publish(p_release_id uuid, p_build_id text, p_artifact_hash text, p_source_commit text, p_capability_nonce text)
RETURNS TABLE (release_id uuid, status public.content_status, published_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid;
  release_row public.seo_releases%ROWTYPE;
  capability_row private.seo_build_capabilities%ROWTYPE;
  live_pointer_row private.seo_live_pointer%ROWTYPE;
  authority_time timestamptz;
BEGIN
  IF p_release_id IS NULL OR p_build_id IS NULL OR p_artifact_hash IS NULL
     OR p_source_commit IS NULL OR p_capability_nonce IS NULL
     OR p_artifact_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'content finalization identity invalid' USING ERRCODE = '42501';
  END IF;
  SELECT releases.id, releases.status, releases.source_commit, releases.build_id,
    releases.artifact_hash, releases.created_by, releases.created_at,
    releases.publishing_at, releases.published_at, releases.failed_at, releases.failure_code
  INTO release_row FROM public.seo_releases AS releases WHERE releases.id = p_release_id FOR UPDATE;
  SELECT capabilities.id, capabilities.release_id, capabilities.build_id, capabilities.source_commit,
    capabilities.artifact_hash, capabilities.nonce_hash, capabilities.expires_at, capabilities.read_scope,
    capabilities.consumed_at, capabilities.created_at
  INTO capability_row FROM private.seo_build_capabilities AS capabilities
  WHERE capabilities.release_id = p_release_id AND capabilities.build_id = p_build_id FOR UPDATE;
  SELECT live.id, live.release_id, live.updated_at
  INTO live_pointer_row
  FROM private.seo_live_pointer AS live
  WHERE live.id = true
  FOR UPDATE;
  authority_time := pg_catalog.clock_timestamp();
  IF release_row.status = 'published'::public.content_status
     AND capability_row.consumed_at IS NOT NULL
     AND release_row.artifact_hash = p_artifact_hash
     AND release_row.build_id = p_build_id
     AND release_row.source_commit = p_source_commit
     AND capability_row.source_commit = p_source_commit
     AND capability_row.artifact_hash = p_artifact_hash
     AND capability_row.nonce_hash = pg_catalog.digest(pg_catalog.convert_to(p_capability_nonce, 'utf8'), 'sha256') THEN
    release_id := release_row.id;
    status := release_row.status;
    published_at := release_row.published_at;
    RETURN NEXT;
    RETURN;
  END IF;
  IF release_row.id IS NULL OR capability_row.id IS NULL OR release_row.status <> 'publishing'::public.content_status
     OR capability_row.consumed_at IS NOT NULL OR capability_row.expires_at <= pg_catalog.clock_timestamp()
     OR release_row.build_id IS DISTINCT FROM p_build_id
     OR capability_row.source_commit IS DISTINCT FROM p_source_commit
     OR release_row.source_commit IS DISTINCT FROM p_source_commit
     OR (capability_row.artifact_hash IS NOT NULL AND capability_row.artifact_hash IS DISTINCT FROM p_artifact_hash)
     OR capability_row.nonce_hash IS DISTINCT FROM pg_catalog.digest(pg_catalog.convert_to(p_capability_nonce, 'utf8'), 'sha256') THEN
    RAISE EXCEPTION 'content finalization capability invalid' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM private.content_release_copies WHERE release_id = p_release_id)
     OR EXISTS (
       SELECT 1
       FROM private.content_release_copies
       WHERE release_id = p_release_id
       GROUP BY slug
       HAVING count(*) <> 2
          OR count(*) FILTER (WHERE locale = 'en'::public.locale) <> 1
          OR count(*) FILTER (WHERE locale = 'vi'::public.locale) <> 1
     )
     OR EXISTS (
       SELECT 1
       FROM private.content_release_copies AS copies
       CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(copies.source_urls) AS unnest_urls(value)
       WHERE copies.release_id = p_release_id
         AND NOT private.content_url_is_allowlisted(unnest_urls.value)
     )
     OR EXISTS (
       SELECT 1
       FROM private.content_release_copies AS copies
       CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(copies.image_attributions) AS images(value)
       WHERE copies.release_id = p_release_id
         AND (
           NOT private.content_url_is_allowlisted(images.value ->> 'imageUrl')
           OR NOT private.content_url_is_allowlisted(images.value ->> 'sourceUrl')
         )
     ) THEN
    UPDATE public.seo_releases SET status = 'failed'::public.content_status, failed_at = authority_time, failure_code = 'content_validation' WHERE id = p_release_id;
    UPDATE private.seo_build_capabilities SET consumed_at = authority_time WHERE id = capability_row.id;
    PERFORM private.record_content_audit_event(
      'content_publish_failed'::public.audit_event_type,
      release_row.created_by,
      p_release_id,
      'publishing',
      'failed',
      'source'::public.audit_metadata_key,
      'build',
      NULL,
      NULL
    );
    release_id := p_release_id;
    status := 'failed'::public.content_status;
    published_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;
  UPDATE public.seo_releases SET status = 'published'::public.content_status, artifact_hash = p_artifact_hash, published_at = authority_time WHERE id = p_release_id;
  UPDATE private.seo_build_capabilities
  SET artifact_hash = p_artifact_hash, consumed_at = authority_time
  WHERE id = capability_row.id;
  INSERT INTO private.seo_live_pointer (id, release_id, updated_at)
  VALUES (true, p_release_id, authority_time)
  ON CONFLICT (id) DO UPDATE
  SET release_id = EXCLUDED.release_id, updated_at = EXCLUDED.updated_at;
  actor := release_row.created_by;
  PERFORM private.record_content_audit_event('content_published'::public.audit_event_type, actor, p_release_id, 'publishing', 'published', 'source'::public.audit_metadata_key, 'build', NULL, NULL);
  release_id := p_release_id;
  status := 'published'::public.content_status;
  published_at := authority_time;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION public.finalize_seo_publish(uuid, text, text, text, text) OWNER TO localens_content_build_owner;
REVOKE ALL ON FUNCTION public.finalize_seo_publish(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_seo_publish(uuid, text, text, text, text) TO localens_content_build_executor;
GRANT SELECT, UPDATE ON TABLE public.seo_releases TO localens_content_build_owner;
GRANT SELECT, UPDATE ON TABLE private.seo_build_capabilities TO localens_content_build_owner;
GRANT INSERT ON TABLE private.audit_events TO localens_content_build_owner;
GRANT EXECUTE ON FUNCTION private.record_content_audit_event(public.audit_event_type, uuid, uuid, text, text, public.audit_metadata_key, text, numeric, boolean) TO localens_content_build_owner;
CREATE POLICY seo_releases_build_owner_update ON public.seo_releases
  FOR UPDATE TO localens_content_build_owner USING (current_user = 'localens_content_build_owner')
  WITH CHECK (current_user = 'localens_content_build_owner');
CREATE POLICY seo_build_capabilities_build_owner_update ON private.seo_build_capabilities
  FOR UPDATE TO localens_content_build_owner USING (current_user = 'localens_content_build_owner')
  WITH CHECK (current_user = 'localens_content_build_owner');
CREATE POLICY audit_events_content_build_owner_insert ON private.audit_events
  FOR INSERT TO localens_content_build_owner WITH CHECK (current_user = 'localens_content_build_owner' AND target_type = 'content_release'::public.audit_target_type);

-- Build/validation failures are committed through a separate idempotent
-- operation so the candidate becomes failed while the previous live pointer
-- remains untouched. The nonce is consumed in the same transaction.
CREATE OR REPLACE FUNCTION public.fail_seo_publish(
  p_release_id uuid,
  p_build_id text,
  p_capability_nonce text,
  p_failure_code text
)
RETURNS TABLE (release_id uuid, status public.content_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  release_row public.seo_releases%ROWTYPE;
  capability_row private.seo_build_capabilities%ROWTYPE;
  authority_time timestamptz;
BEGIN
  IF p_release_id IS NULL OR p_build_id IS NULL OR p_capability_nonce IS NULL
     OR p_failure_code IS NULL OR p_failure_code !~ '^[a-z][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'content failure identity invalid' USING ERRCODE = '42501';
  END IF;
  SELECT releases.id, releases.status, releases.source_commit, releases.build_id,
    releases.artifact_hash, releases.created_by, releases.created_at,
    releases.publishing_at, releases.published_at, releases.failed_at, releases.failure_code
  INTO release_row FROM public.seo_releases AS releases WHERE releases.id = p_release_id FOR UPDATE;
  SELECT capabilities.id, capabilities.release_id, capabilities.build_id, capabilities.source_commit,
    capabilities.artifact_hash, capabilities.nonce_hash, capabilities.expires_at,
    capabilities.read_scope, capabilities.consumed_at, capabilities.created_at
  INTO capability_row FROM private.seo_build_capabilities AS capabilities
  WHERE capabilities.release_id = p_release_id AND capabilities.build_id = p_build_id FOR UPDATE;
  authority_time := pg_catalog.clock_timestamp();
  IF release_row.status = 'failed'::public.content_status
     AND capability_row.consumed_at IS NOT NULL
     AND release_row.failure_code = p_failure_code
     AND capability_row.nonce_hash = pg_catalog.digest(pg_catalog.convert_to(p_capability_nonce, 'utf8'), 'sha256') THEN
    release_id := release_row.id;
    status := release_row.status;
    RETURN NEXT;
    RETURN;
  END IF;
  IF release_row.id IS NULL OR capability_row.id IS NULL
     OR release_row.status <> 'publishing'::public.content_status
     OR release_row.build_id IS DISTINCT FROM p_build_id
     OR capability_row.consumed_at IS NOT NULL
     OR capability_row.expires_at <= authority_time
     OR capability_row.read_scope <> 'published_content_release'
     OR capability_row.nonce_hash IS DISTINCT FROM pg_catalog.digest(pg_catalog.convert_to(p_capability_nonce, 'utf8'), 'sha256') THEN
    RAISE EXCEPTION 'content failure capability invalid' USING ERRCODE = '42501';
  END IF;
  UPDATE public.seo_releases
  SET status = 'failed'::public.content_status,
      failed_at = authority_time,
      failure_code = p_failure_code
  WHERE id = p_release_id;
  UPDATE private.seo_build_capabilities
  SET consumed_at = authority_time
  WHERE id = capability_row.id;
  PERFORM private.record_content_audit_event(
    'content_publish_failed'::public.audit_event_type,
    release_row.created_by,
    p_release_id,
    'publishing',
    'failed',
    'source'::public.audit_metadata_key,
    'build',
    NULL,
    NULL
  );
  release_id := p_release_id;
  status := 'failed'::public.content_status;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION public.fail_seo_publish(uuid, text, text, text) OWNER TO localens_content_build_owner;
REVOKE ALL ON FUNCTION public.fail_seo_publish(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_seo_publish(uuid, text, text, text) TO localens_content_build_executor;

COMMIT;
