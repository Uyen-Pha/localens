-- Restored from the verified localens-guide-release research baseline.
-- Historical prerequisite: do not replay against an already migrated hosted database.
BEGIN;
-- Isolated demo workflow; no operational bookings or canonical catalog changes.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM private.thesis_demo_manifest WHERE project_ref='twsdtfotrkljgbfsrmgz' AND environment='thesis-demo') THEN RAISE EXCEPTION 'Authorized demo environment required';END IF;END $$;
CREATE TABLE private.research_demo_places (
 catalog_version text NOT NULL REFERENCES private.research_demo_catalog_versions(version),
 place_id uuid NOT NULL, source_id text NOT NULL CHECK(source_id ~ '^LL-R(0[1-9]|1[0-9]|2[0-6])$'),
 PRIMARY KEY(catalog_version,place_id), UNIQUE(catalog_version,source_id)
);
INSERT INTO private.research_demo_places SELECT version,value::uuid,key FROM private.research_demo_catalog_versions,jsonb_each_text(place_map) ON CONFLICT DO NOTHING;
CREATE TABLE private.research_demo_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES auth.users(id),
 catalog_version text NOT NULL REFERENCES private.research_demo_catalog_versions(version),
 request jsonb NOT NULL, plan jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,catalog_version)
);
CREATE TABLE private.research_demo_stops (
 revision_id uuid NOT NULL, catalog_version text NOT NULL, position integer NOT NULL CHECK(position>=0), place_id uuid NOT NULL,
 PRIMARY KEY(revision_id,position), UNIQUE(revision_id,place_id),
 FOREIGN KEY(revision_id,catalog_version) REFERENCES private.research_demo_revisions(id,catalog_version),
 FOREIGN KEY(catalog_version,place_id) REFERENCES private.research_demo_places(catalog_version,place_id)
);
CREATE TABLE private.research_demo_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision_id uuid NOT NULL UNIQUE REFERENCES private.research_demo_revisions(id),
 owner_id uuid NOT NULL REFERENCES auth.users(id), status text NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','changes_requested','approved','rejected')),
 notes text, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.research_demo_request_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,request_id uuid NOT NULL REFERENCES private.research_demo_requests(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),status text NOT NULL,note text,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.research_demo_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL REFERENCES private.research_demo_requests(id),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),amount numeric NOT NULL CHECK(amount>0 AND amount<=1000000000000),
 currency text NOT NULL CHECK(currency IN ('VND','USD')),conditions text NOT NULL CHECK(length(btrim(conditions)) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),
 CHECK(expires_at=created_at+interval '48 hours')
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['research_demo_places','research_demo_revisions','research_demo_stops','research_demo_requests','research_demo_request_events','research_demo_quotes'] LOOP
 EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE private.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP; END $$;
CREATE FUNCTION private.research_demo_actor(p_admin boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.thesis_demo_manifest WHERE project_ref='twsdtfotrkljgbfsrmgz' AND environment='thesis-demo') THEN RAISE EXCEPTION 'Demo environment required';END IF;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM private.user_roles r JOIN auth.users u ON u.id=r.user_id WHERE r.user_id=actor AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()) AND r.role::text=CASE WHEN p_admin THEN 'admin' ELSE 'customer' END) THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 RETURN actor; END $$;
CREATE FUNCTION public.research_demo_persist(p_owner uuid,p_version text,p_request jsonb,p_plan jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE revision uuid; item jsonb; mapped uuid; idx integer:=0; normalized jsonb:=p_plan; normalized_stops jsonb:='[]'; normalized_legs jsonb:='[]'; endpoint text; key text; BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted service required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.thesis_demo_manifest WHERE project_ref='twsdtfotrkljgbfsrmgz' AND environment='thesis-demo') THEN RAISE EXCEPTION 'Demo environment required';END IF;
 IF NOT EXISTS(SELECT 1 FROM private.user_roles r JOIN auth.users u ON u.id=r.user_id WHERE r.user_id=p_owner AND r.role='customer' AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())) THEN RAISE EXCEPTION 'Customer required'; END IF;
 IF p_request IS NULL OR p_plan IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR NOT(p_request ?& ARRAY['startAt','durationMinutes','budget','partySize','areas']) OR jsonb_typeof(p_plan->'stops') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'legs') IS DISTINCT FROM 'array' OR NOT(p_plan ?& ARRAY['durationMinutes','totalVnd','visitAndFoodVnd','guideVnd','transportVnd','returnTime']) THEN RAISE EXCEPTION 'Invalid itinerary';END IF;
 FOREACH key IN ARRAY ARRAY['durationMinutes','totalVnd','visitAndFoodVnd','guideVnd','transportVnd'] LOOP IF jsonb_typeof(p_plan->key) IS DISTINCT FROM 'number' OR (p_plan->>key)::numeric<0 THEN RAISE EXCEPTION 'Invalid numeric itinerary field';END IF;END LOOP;
 IF jsonb_typeof(p_request->'durationMinutes') IS DISTINCT FROM 'number' OR jsonb_typeof(p_request->'partySize') IS DISTINCT FROM 'number' OR jsonb_typeof(p_request->'areas') IS DISTINCT FROM 'array' OR jsonb_typeof(p_request->'budget'->'amountMinor') IS DISTINCT FROM 'number' OR (p_request->'budget'->>'currency') IS NULL OR (p_request->'budget'->>'currency') NOT IN ('VND','USD') OR (p_request->>'durationMinutes')::numeric NOT BETWEEN 120 AND 600 OR (p_request->'budget'->>'amountMinor')::numeric<=0 OR (p_plan->>'totalVnd')::numeric>(p_request->'budget'->>'amountMinor')::numeric*(CASE WHEN p_request->'budget'->>'currency'='USD' THEN 260 ELSE 1 END) OR nullif(p_request->>'startAt','') IS NULL OR (p_request->>'startAt')::timestamptz IS NULL THEN RAISE EXCEPTION 'Invalid request or budget';END IF;
 IF jsonb_array_length(p_plan->'stops')<1 OR jsonb_array_length(p_plan->'stops')>30 OR jsonb_array_length(p_plan->'legs')<>jsonb_array_length(p_plan->'stops')+1 OR (p_plan->>'durationMinutes')::numeric NOT BETWEEN 1 AND 600 OR (p_plan->>'durationMinutes')::numeric>(p_request->>'durationMinutes')::numeric OR (p_plan->>'totalVnd')::numeric NOT BETWEEN 0 AND 1000000000000 OR (p_request->>'partySize')::integer NOT BETWEEN 1 AND 20 OR (p_plan->>'totalVnd')::numeric<>((p_plan->>'visitAndFoodVnd')::numeric+(p_plan->>'guideVnd')::numeric+(p_plan->>'transportVnd')::numeric) THEN RAISE EXCEPTION 'Invalid itinerary totals';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'stops') LOOP
  SELECT place_id INTO mapped FROM private.research_demo_places WHERE catalog_version=p_version AND source_id=item->>'id';
  IF mapped IS NULL THEN RAISE EXCEPTION 'Unmapped or blocked place'; END IF;
  normalized_stops:=normalized_stops||jsonb_build_array((item-'id')||jsonb_build_object('id',mapped,'sourceId',item->>'id'));
 END LOOP;
 normalized:=jsonb_set(normalized,'{stops}',normalized_stops);
 FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'legs') LOOP
  FOREACH key IN ARRAY ARRAY['from','to'] LOOP
   endpoint:=item->>key;
   IF endpoint IS DISTINCT FROM 'ORIGIN-CENTER' THEN
    SELECT place_id INTO mapped FROM private.research_demo_places WHERE catalog_version=p_version AND source_id=endpoint;
    IF mapped IS NULL THEN RAISE EXCEPTION 'Unmapped travel endpoint';END IF;
    item:=jsonb_set(item,ARRAY[key],to_jsonb(mapped::text));
   END IF;
  END LOOP;
  normalized_legs:=normalized_legs||jsonb_build_array(item);
 END LOOP;
 normalized:=jsonb_set(normalized,'{legs}',normalized_legs);
 INSERT INTO private.research_demo_revisions(owner_id,catalog_version,request,plan) VALUES(p_owner,p_version,p_request,normalized) RETURNING id INTO revision;
 FOR item IN SELECT value FROM jsonb_array_elements(normalized_stops) LOOP
  INSERT INTO private.research_demo_stops VALUES(revision,p_version,idx,(item->>'id')::uuid);idx:=idx+1;
 END LOOP;RETURN revision;
END $$;
CREATE FUNCTION public.research_demo_submit(p_revision_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.research_demo_actor(false); rev private.research_demo_revisions; result uuid; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,0));
 SELECT * INTO rev FROM private.research_demo_revisions WHERE id=p_revision_id AND owner_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'Itinerary not found' USING ERRCODE='42501';END IF;
 SELECT id INTO result FROM private.research_demo_requests WHERE revision_id=p_revision_id AND owner_id=actor;
 IF result IS NOT NULL THEN RETURN result;END IF;
 IF EXISTS(SELECT 1 FROM private.research_demo_revisions WHERE owner_id=actor AND created_at>rev.created_at) THEN RAISE EXCEPTION 'Use latest itinerary';END IF;
 INSERT INTO private.research_demo_requests(revision_id,owner_id) VALUES(p_revision_id,actor) RETURNING id INTO result;
 INSERT INTO private.research_demo_request_events(request_id,actor_id,status) VALUES(result,actor,'pending_review');RETURN result;
END $$;
CREATE FUNCTION public.research_demo_decide(p_request_id uuid,p_decision text,p_note text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.research_demo_actor(true); current_status text;BEGIN
 IF p_decision NOT IN ('approved','changes_requested','rejected') OR length(p_note)>4000 OR (p_decision IN ('changes_requested','rejected') AND nullif(btrim(p_note),'') IS NULL) THEN RAISE EXCEPTION 'A valid decision and reason are required';END IF;
 SELECT status INTO current_status FROM private.research_demo_requests WHERE id=p_request_id FOR UPDATE;
 IF current_status IS NULL THEN RAISE EXCEPTION 'Request not found';END IF;
 IF current_status=p_decision THEN RETURN;END IF;
 IF current_status<>'pending_review' THEN RAISE EXCEPTION 'Request is no longer pending review';END IF;
 UPDATE private.research_demo_requests SET status=p_decision,notes=nullif(btrim(p_note),'') WHERE id=p_request_id;
 INSERT INTO private.research_demo_request_events(request_id,actor_id,status,note) VALUES(p_request_id,actor,p_decision,nullif(btrim(p_note),''));
END $$;
CREATE FUNCTION public.research_demo_create_quote(p_request_id uuid,p_title text,p_amount numeric,p_currency text,p_conditions text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.research_demo_actor(true); result uuid; instant timestamptz:=clock_timestamp();current_status text;BEGIN
 SELECT status INTO current_status FROM private.research_demo_requests WHERE id=p_request_id FOR UPDATE;
 IF current_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Only approved requests can be quoted';END IF;
 IF nullif(btrim(p_title),'') IS NULL OR length(p_title)>200 OR p_amount IS NULL OR p_amount<=0 OR p_amount>1000000000000 OR p_currency IS NULL OR p_currency NOT IN ('VND','USD') OR (p_currency='VND' AND p_amount<>trunc(p_amount)) OR (p_currency='USD' AND p_amount<>round(p_amount,2)) OR nullif(btrim(p_conditions),'') IS NULL OR length(p_conditions)>4000 THEN RAISE EXCEPTION 'Invalid quotation';END IF;
 SELECT id INTO result FROM private.research_demo_quotes WHERE request_id=p_request_id AND expires_at>instant;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'An active quotation already exists';END IF;
 INSERT INTO private.research_demo_quotes(request_id,title,amount,currency,conditions,created_at,expires_at,created_by) VALUES(p_request_id,btrim(p_title),p_amount,p_currency,btrim(p_conditions),instant,instant+interval '48 hours',actor) RETURNING id INTO result;
 INSERT INTO private.research_demo_request_events(request_id,actor_id,status,note) VALUES(p_request_id,actor,'quote_active',p_title);RETURN result;
END $$;
CREATE FUNCTION public.research_demo_list(p_admin boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.research_demo_actor(p_admin); result jsonb;BEGIN
 SELECT coalesce(jsonb_agg(item ORDER BY created DESC),'[]') INTO result FROM (
 SELECT r.created_at created,jsonb_build_object('id',r.id,'ownerId',r.owner_id,'status',r.status,'revisionId',r.revision_id,'request',v.request,'plan',v.plan,'createdAt',r.created_at,'notes',r.notes,
 'quotes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'amount',q.amount,'currency',q.currency,'conditions',q.conditions,'status',CASE WHEN q.expires_at>clock_timestamp() THEN 'active' ELSE 'expired' END,'createdAt',q.created_at,'expiresAt',q.expires_at) ORDER BY q.created_at DESC) FROM private.research_demo_quotes q WHERE q.request_id=r.id),'[]'),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('status',e.status,'note',e.note,'at',e.created_at) ORDER BY e.id) FROM private.research_demo_request_events e WHERE e.request_id=r.id),'[]')) item
 FROM private.research_demo_requests r JOIN private.research_demo_revisions v ON v.id=r.revision_id WHERE p_admin OR r.owner_id=actor) rows;
 RETURN result;END $$;
CREATE TRIGGER research_demo_revision_immutable BEFORE UPDATE OR DELETE ON private.research_demo_revisions FOR EACH ROW EXECUTE FUNCTION private.reject_research_demo_catalog_mutation();
CREATE TRIGGER research_demo_quote_immutable BEFORE UPDATE OR DELETE ON private.research_demo_quotes FOR EACH ROW EXECUTE FUNCTION private.reject_research_demo_catalog_mutation();
CREATE TRIGGER research_demo_event_immutable BEFORE UPDATE OR DELETE ON private.research_demo_request_events FOR EACH ROW EXECUTE FUNCTION private.reject_research_demo_catalog_mutation();
CREATE TRIGGER research_demo_stops_immutable BEFORE UPDATE OR DELETE ON private.research_demo_stops FOR EACH ROW EXECUTE FUNCTION private.reject_research_demo_catalog_mutation();
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['research_demo_revisions','research_demo_stops','research_demo_quotes','research_demo_request_events'] LOOP EXECUTE format('CREATE TRIGGER no_truncate BEFORE TRUNCATE ON private.%I FOR EACH STATEMENT EXECUTE FUNCTION private.reject_research_demo_catalog_mutation()',t);END LOOP;END $$;
REVOKE ALL ON FUNCTION private.research_demo_actor(boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.research_demo_persist(uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.research_demo_persist(uuid,text,jsonb,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.research_demo_submit(uuid),public.research_demo_decide(uuid,text,text),public.research_demo_create_quote(uuid,text,numeric,text,text),public.research_demo_list(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.research_demo_submit(uuid),public.research_demo_decide(uuid,text,text),public.research_demo_create_quote(uuid,text,numeric,text,text),public.research_demo_list(boolean) TO authenticated;
COMMIT;
