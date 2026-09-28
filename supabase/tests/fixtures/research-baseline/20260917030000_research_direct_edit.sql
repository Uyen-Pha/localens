-- Direct editing creates a child revision; existing revisions and submitted requests stay immutable.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM private.thesis_demo_manifest WHERE project_ref='twsdtfotrkljgbfsrmgz' AND environment='thesis-demo') THEN RAISE EXCEPTION 'Authorized demo environment required';END IF;END $$;
CREATE TABLE IF NOT EXISTS private.research_demo_revision_links (
 revision_id uuid PRIMARY KEY REFERENCES private.research_demo_revisions(id),
 parent_revision_id uuid NOT NULL UNIQUE REFERENCES private.research_demo_revisions(id),
 revision_number integer NOT NULL CHECK(revision_number>=2),
 edit_key text NOT NULL, fingerprint text NOT NULL,
 CHECK(revision_id<>parent_revision_id)
);
ALTER TABLE private.research_demo_revision_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.research_demo_revision_links FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.research_demo_edit_context(p_revision_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.research_demo_actor(false); rev private.research_demo_revisions;BEGIN
 SELECT * INTO rev FROM private.research_demo_revisions WHERE id=p_revision_id AND owner_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'Itinerary not found' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM private.research_demo_requests WHERE revision_id=p_revision_id) THEN RAISE EXCEPTION 'Itinerary is submitted or superseded';END IF;
 RETURN jsonb_build_object('request',rev.request,'catalogVersion',rev.catalog_version,'revisionNumber',COALESCE((SELECT revision_number FROM private.research_demo_revision_links WHERE revision_id=rev.id),1));
END $$;
REVOKE ALL ON FUNCTION public.research_demo_edit_context(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.research_demo_edit_context(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.research_demo_persist_edit(p_owner uuid,p_parent uuid,p_edit_key text,p_version text,p_request jsonb,p_plan jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rev private.research_demo_revisions; link private.research_demo_revision_links; child uuid; n integer; signature text:=md5(jsonb_build_object('request',p_request,'plan',p_plan)::text);BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501';END IF;
 IF p_edit_key IS NULL OR length(p_edit_key) NOT BETWEEN 16 AND 120 THEN RAISE EXCEPTION 'Invalid edit key';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 SELECT * INTO rev FROM private.research_demo_revisions WHERE id=p_parent AND owner_id=p_owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'Itinerary not found' USING ERRCODE='42501';END IF;
 SELECT * INTO link FROM private.research_demo_revision_links WHERE parent_revision_id=p_parent;
 IF FOUND THEN
  IF link.edit_key=p_edit_key AND link.fingerprint=signature THEN RETURN jsonb_build_object('revisionId',link.revision_id,'revisionNumber',link.revision_number);END IF;
  RAISE EXCEPTION 'Itinerary has a newer revision';
 END IF;
 IF EXISTS(SELECT 1 FROM private.research_demo_requests WHERE revision_id=p_parent) THEN RAISE EXCEPTION 'Submitted itinerary cannot be edited';END IF;
 IF p_version IS DISTINCT FROM rev.catalog_version OR (p_request-ARRAY['startAt','durationMinutes','budget']) IS DISTINCT FROM (rev.request-ARRAY['startAt','durationMinutes','budget']) THEN RAISE EXCEPTION 'Immutable preferences or catalog changed';END IF;
 IF EXISTS(SELECT 1 FROM private.research_demo_revisions WHERE owner_id=p_owner AND created_at>rev.created_at) THEN RAISE EXCEPTION 'Use latest itinerary';END IF;
 child:=public.research_demo_persist(p_owner,p_version,p_request,p_plan);
 SELECT COALESCE((SELECT revision_number FROM private.research_demo_revision_links WHERE revision_id=p_parent),1)+1 INTO n;
 INSERT INTO private.research_demo_revision_links VALUES(child,p_parent,n,p_edit_key,signature);
 RETURN jsonb_build_object('revisionId',child,'revisionNumber',n);
END $$;
REVOKE ALL ON FUNCTION public.research_demo_persist_edit(uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.research_demo_persist_edit(uuid,uuid,text,text,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.research_demo_resume(p_revision_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.research_demo_actor(false); rev private.research_demo_revisions; BEGIN
 SELECT * INTO rev FROM private.research_demo_revisions WHERE id=p_revision_id AND owner_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'Itinerary not found' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('request',rev.request,'plan',rev.plan,'catalogVersion',rev.catalog_version,'revisionNumber',COALESCE((SELECT revision_number FROM private.research_demo_revision_links WHERE revision_id=rev.id),1),'submittedRequestId',(SELECT id FROM private.research_demo_requests WHERE revision_id=rev.id AND owner_id=actor));
END $$;
REVOKE ALL ON FUNCTION public.research_demo_resume(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.research_demo_resume(uuid) TO authenticated;
