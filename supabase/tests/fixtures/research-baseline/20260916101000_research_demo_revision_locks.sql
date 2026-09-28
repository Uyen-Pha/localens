-- The current research scheduler rejects locked stops. Keep the service
-- persistence boundary equally strict, rather than storing unmapped IDs.
CREATE FUNCTION private.guard_research_demo_revision_locks() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.request->'lockedStopIds' IS DISTINCT FROM '[]'::jsonb THEN
  RAISE EXCEPTION 'Locked stops are not supported by this planner version';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_research_demo_revision_locks() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER research_demo_revision_locks BEFORE INSERT ON private.research_demo_revisions
FOR EACH ROW EXECUTE FUNCTION private.guard_research_demo_revision_locks();
