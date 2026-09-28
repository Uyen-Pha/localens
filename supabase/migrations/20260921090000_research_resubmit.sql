-- Restored from the verified localens-guide-release research baseline.
-- Historical prerequisite: do not replay against an already migrated hosted database.
BEGIN;
-- Keep submitted snapshots immutable while allowing a returned request to be revised.
ALTER TABLE private.research_demo_request_events ADD COLUMN IF NOT EXISTS revision_id uuid REFERENCES private.research_demo_revisions(id);
CREATE OR REPLACE FUNCTION public.research_demo_begin_revision(p_request_id uuid,p_expected_revision uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.research_demo_actor(false); r private.research_demo_requests; old private.research_demo_revisions; child uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,0));
 SELECT * INTO r FROM private.research_demo_requests WHERE id=p_request_id AND owner_id=actor FOR UPDATE;
 IF NOT FOUND OR r.status<>'changes_requested' OR r.revision_id<>p_expected_revision THEN RAISE EXCEPTION 'Request changed or unavailable';END IF;
 SELECT * INTO old FROM private.research_demo_revisions WHERE id=r.revision_id AND owner_id=actor;
 INSERT INTO private.research_demo_revisions(owner_id,catalog_version,request,plan) VALUES(actor,old.catalog_version,old.request,old.plan) RETURNING id INTO child;
 INSERT INTO private.research_demo_stops SELECT child,catalog_version,position,place_id FROM private.research_demo_stops WHERE revision_id=old.id;
 RETURN child;
END $$;
CREATE OR REPLACE FUNCTION public.research_demo_resubmit(p_request_id uuid,p_expected_revision uuid,p_revision_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.research_demo_actor(false); r private.research_demo_requests; rev private.research_demo_revisions;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,0));
 SELECT * INTO r FROM private.research_demo_requests WHERE id=p_request_id AND owner_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='42501';END IF;
 IF r.revision_id=p_revision_id AND r.status='pending_review' THEN RETURN r.id;END IF;
 IF r.status<>'changes_requested' OR r.revision_id<>p_expected_revision OR p_revision_id=p_expected_revision THEN RAISE EXCEPTION 'Request changed';END IF;
 SELECT * INTO rev FROM private.research_demo_revisions WHERE id=p_revision_id AND owner_id=actor;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM private.research_demo_requests WHERE revision_id=p_revision_id) THEN RAISE EXCEPTION 'Invalid revision';END IF;
 IF (rev.request->>'startAt')::timestamptz<=clock_timestamp() OR EXISTS(SELECT 1 FROM private.research_demo_revisions WHERE owner_id=actor AND created_at>rev.created_at) THEN RAISE EXCEPTION 'Use latest valid itinerary';END IF;
 INSERT INTO private.research_demo_request_events(request_id,actor_id,status,note,revision_id) VALUES(r.id,actor,'changes_requested',r.notes,r.revision_id);
 UPDATE private.research_demo_requests SET revision_id=rev.id,status='pending_review',notes=NULL WHERE id=r.id;
 INSERT INTO private.research_demo_request_events(request_id,actor_id,status,note,revision_id) VALUES(r.id,actor,'pending_review','Khách đã chỉnh sửa và gửi lại yêu cầu',rev.id);
 RETURN r.id;
END $$;
REVOKE ALL ON FUNCTION public.research_demo_begin_revision(uuid,uuid),public.research_demo_resubmit(uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.research_demo_begin_revision(uuid,uuid),public.research_demo_resubmit(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.guard_research_resubmitted_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM private.research_demo_request_events WHERE revision_id=NEW.revision_id AND request_id<>NEW.id) THEN RAISE EXCEPTION 'Revision already submitted';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_research_resubmitted_snapshot() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER research_resubmitted_snapshot BEFORE INSERT OR UPDATE OF revision_id ON private.research_demo_requests FOR EACH ROW EXECUTE FUNCTION private.guard_research_resubmitted_snapshot();
COMMIT;
