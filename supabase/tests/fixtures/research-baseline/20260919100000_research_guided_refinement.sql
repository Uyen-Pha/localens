-- Guided refinements preserve immutable revisions and normalize fixed catalog IDs.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM private.thesis_demo_manifest WHERE project_ref='twsdtfotrkljgbfsrmgz' AND environment='thesis-demo') THEN RAISE EXCEPTION 'Authorized demo environment required';END IF;END $$;
CREATE OR REPLACE FUNCTION public.research_demo_persist_edit(p_owner uuid,p_parent uuid,p_edit_key text,p_version text,p_request jsonb,p_plan jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rev private.research_demo_revisions; link private.research_demo_revision_links; child uuid; n integer; lock_id text; mapped_lock uuid; fixed_ids jsonb:='[]'::jsonb; signature text:=md5(jsonb_build_object('request',p_request,'plan',p_plan)::text);BEGIN
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
 IF p_version IS DISTINCT FROM rev.catalog_version OR (p_request-ARRAY['startAt','durationMinutes','budget','pace']) IS DISTINCT FROM (rev.request-ARRAY['startAt','durationMinutes','budget','pace']) THEN RAISE EXCEPTION 'Immutable preferences or catalog changed';END IF;
 IF EXISTS(SELECT 1 FROM private.research_demo_revisions WHERE owner_id=p_owner AND created_at>rev.created_at) THEN RAISE EXCEPTION 'Use latest itinerary';END IF;
 IF p_request->>'pace' IS DISTINCT FROM rev.request->>'pace' AND p_request->>'pace' IS DISTINCT FROM 'relaxed' THEN RAISE EXCEPTION 'Invalid pace change';END IF;
 IF jsonb_typeof(COALESCE(p_plan->'lockedStopIds','[]'::jsonb)) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid fixed places';END IF;
 FOR lock_id IN SELECT jsonb_array_elements_text(COALESCE(p_plan->'lockedStopIds','[]'::jsonb)) LOOP
  SELECT place_id INTO mapped_lock FROM private.research_demo_places WHERE catalog_version=p_version AND source_id=lock_id;
  IF mapped_lock IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_plan->'stops') s WHERE s->>'id'=lock_id) THEN RAISE EXCEPTION 'Fixed place must belong to route';END IF;
  IF fixed_ids @> jsonb_build_array(mapped_lock::text) THEN RAISE EXCEPTION 'Duplicate fixed place';END IF;
  fixed_ids:=fixed_ids||jsonb_build_array(mapped_lock::text);
 END LOOP;
 child:=public.research_demo_persist(p_owner,p_version,p_request,jsonb_set(p_plan,'{lockedStopIds}',fixed_ids));
 SELECT COALESCE((SELECT revision_number FROM private.research_demo_revision_links WHERE revision_id=p_parent),1)+1 INTO n;
 INSERT INTO private.research_demo_revision_links VALUES(child,p_parent,n,p_edit_key,signature);
 RETURN jsonb_build_object('revisionId',child,'revisionNumber',n);
END $$;
REVOKE ALL ON FUNCTION public.research_demo_persist_edit(uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.research_demo_persist_edit(uuid,uuid,text,text,jsonb,jsonb) TO service_role;


-- Recover a committed child even when its HTTP response was lost.
CREATE OR REPLACE FUNCTION public.research_demo_resume_latest(p_revision_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.research_demo_actor(false); latest uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.research_demo_revisions WHERE id=p_revision_id AND owner_id=actor) THEN RAISE EXCEPTION 'Itinerary not found' USING ERRCODE='42501';END IF;
 WITH RECURSIVE chain AS (
  SELECT id,0 AS depth FROM private.research_demo_revisions WHERE id=p_revision_id AND owner_id=actor
  UNION ALL SELECT r.id,c.depth+1 FROM chain c JOIN private.research_demo_revision_links l ON l.parent_revision_id=c.id JOIN private.research_demo_revisions r ON r.id=l.revision_id AND r.owner_id=actor
 ) SELECT id INTO latest FROM chain ORDER BY depth DESC LIMIT 1;
 RETURN public.research_demo_resume(latest)||jsonb_build_object('revisionId',latest);
END $$;
REVOKE ALL ON FUNCTION public.research_demo_resume_latest(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.research_demo_resume_latest(uuid) TO authenticated;
