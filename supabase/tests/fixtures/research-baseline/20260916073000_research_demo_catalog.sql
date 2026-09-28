-- Isolated, immutable demo catalog. Does not publish operational places or
-- change the catalog snapshots selected by the existing booking/quote engine.
CREATE TABLE private.research_demo_catalog_versions (
  version text PRIMARY KEY CHECK (length(version) BETWEEN 1 AND 160),
  source_version text NOT NULL,
  mapping_version text NOT NULL,
  dataset jsonb NOT NULL CHECK (jsonb_typeof(dataset) = 'object'),
  place_map jsonb NOT NULL CHECK (jsonb_typeof(place_map) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (dataset->>'dataMode' = 'internal_simulation'),
  CHECK (dataset->'realBookingEnabled' = 'false'::jsonb),
  CHECK (dataset->>'schemaVersion' = source_version)
);
ALTER TABLE private.research_demo_catalog_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.research_demo_catalog_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.research_demo_catalog_versions FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.reject_research_demo_catalog_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Demo catalog versions are immutable' USING ERRCODE='42501';
END;
$$;
REVOKE ALL ON FUNCTION private.reject_research_demo_catalog_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER research_demo_catalog_append_only
BEFORE UPDATE OR DELETE ON private.research_demo_catalog_versions
FOR EACH ROW EXECUTE FUNCTION private.reject_research_demo_catalog_mutation();
CREATE TRIGGER research_demo_catalog_no_truncate
BEFORE TRUNCATE ON private.research_demo_catalog_versions
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_research_demo_catalog_mutation();

-- Explicit version selection: never silently switch an existing request to
-- whichever dataset was imported most recently.
CREATE FUNCTION public.get_research_demo_catalog(p_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object('version',version,'sourceVersion',source_version,
    'mappingVersion',mapping_version,'dataset',dataset,'placeMap',place_map)
  INTO result FROM private.research_demo_catalog_versions WHERE version=p_version;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_research_demo_catalog(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_research_demo_catalog(text) TO authenticated;
