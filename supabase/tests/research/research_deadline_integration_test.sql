-- Main only: run on the owned local research baseline with cancellation installed.
-- Load supabase/tests/research/fixtures.sql in this session before this file.
-- Main owns the outer transaction and per-test SAVEPOINT/rollback.
-- This file must not BEGIN, COMMIT or ROLLBACK that transaction.
-- RED: run before deadline compatibility; the 71h submission must be rejected.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

-- Retained pre-upgrade requests, before creating any new deadline fixtures.
-- Missing timing columns on the RED baseline are intentionally read as JSON null.
CREATE TEMP TABLE deadline_legacy_requests AS
 SELECT r.id,r.owner_id,to_jsonb(r) AS original,
 coalesce((SELECT max(e.created_at) FROM private.research_demo_request_events e
           WHERE e.request_id=r.id AND e.status='pending_review'),r.created_at) AS submitted
 FROM private.research_demo_requests r WHERE to_jsonb(r)->>'submitted_at' IS NULL;
SELECT ok(NOT EXISTS(SELECT 1 FROM private.research_demo_requests)
 OR EXISTS(SELECT 1 FROM deadline_legacy_requests),
 'fresh database is empty or populated upgrade retains legacy requests without persisted timing');

CREATE FUNCTION pg_temp.deadline_business_snapshot() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE table_name text; rows_json jsonb; result jsonb := '{}';
BEGIN
 FOREACH table_name IN ARRAY ARRAY['research_demo_requests','research_demo_request_events',
  'research_demo_quotes','research_demo_bookings','research_demo_revisions','research_demo_stops'] LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM private.%I t',table_name)
   INTO rows_json;
  result := result || jsonb_build_object(table_name,rows_json);
 END LOOP;
 RETURN result;
END $$;
CREATE TEMP TABLE deadline_before_list AS SELECT pg_temp.deadline_business_snapshot() AS data;
CREATE TEMP TABLE deadline_legacy_lists AS
 SELECT owner_id,pg_temp.research_call(owner_id,'SELECT public.research_demo_list(false)') AS result
 FROM (SELECT DISTINCT owner_id FROM deadline_legacy_requests) owners;
SELECT ok(jsonb_typeof(result)='array','legacy owner can read request list') FROM deadline_legacy_lists;
CREATE TEMP TABLE deadline_legacy_items AS
 SELECT l.id,l.original,l.submitted,items.item
 FROM deadline_legacy_requests l JOIN deadline_legacy_lists lists USING(owner_id)
 LEFT JOIN LATERAL (
  SELECT item FROM jsonb_array_elements(CASE WHEN jsonb_typeof(lists.result)='array'
   THEN lists.result ELSE '[]'::jsonb END) item WHERE item->>'id'=l.id::text
 ) items ON true;
SELECT ok(item ?& ARRAY['submittedAt','processingDueAt','processingCompletedAt'],
 'legacy list retains all existing timing keys') FROM deadline_legacy_items;
SELECT is((item->>'submittedAt')::timestamptz,submitted,
 'legacy list derives latest pending-review event or original creation time read-only') FROM deadline_legacy_items;
SELECT is((item->>'processingDueAt')::timestamptz,submitted+interval '12 hours',
 'legacy list derives original 12-hour due time read-only') FROM deadline_legacy_items;
SELECT is((i.item->>'processingCompletedAt')::timestamptz,
 (SELECT min(e.created_at) FROM private.research_demo_request_events e WHERE e.request_id=i.id
  AND e.created_at>=i.submitted AND e.status IN ('changes_requested','rejected','quote_active')),
 'legacy list derives first processing result of latest cycle read-only') FROM deadline_legacy_items i;
SELECT is(pg_temp.deadline_business_snapshot(),(SELECT data FROM deadline_before_list),
 'list leaves every persisted field in all six business tables unchanged');
SELECT is(to_jsonb(r),l.original,'legacy request retains original fields and null timing after list')
 FROM deadline_legacy_requests l JOIN private.research_demo_requests r USING(id);

-- Calls the real persist -> submit -> approve -> quote -> booking -> checkout
-- sequence. A failed submission rolls back the entire synthetic fixture.
CREATE FUNCTION pg_temp.deadline_attempt(p_hours integer, p_outcome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; message text;
BEGIN
 BEGIN
  result := pg_temp.research_fixture(clock_timestamp()+make_interval(hours=>p_hours),p_outcome);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  result := jsonb_build_object('error',message);
 END;
 PERFORM set_config('role','none',true);
 RETURN result;
END $$;

SELECT is(pg_temp.deadline_attempt(71)->>'error','REQUEST_LEAD_72H',
 'real submit rejects a departure less than 72 hours away');

CREATE TEMP TABLE deadline_cases(name text PRIMARY KEY,b jsonb NOT NULL,result jsonb);
INSERT INTO deadline_cases(name,b) VALUES
 ('pending',pg_temp.deadline_attempt(96)),
 ('failed',pg_temp.deadline_attempt(96,'declined')),
 ('paid',pg_temp.deadline_attempt(96,'success'));
SELECT ok(NOT (b ? 'error'),name||' real RPC fixture succeeds beyond 72 hours') FROM deadline_cases;
SELECT is(b->>'payment_status',expected,name||' payment comes from real checkout')
 FROM deadline_cases JOIN (VALUES('pending','pending'),('failed','failed'),('paid','paid')) x(name,expected) USING(name);

-- JSON inspection makes the pre-migration run fail assertions rather than
-- aborting on absent columns; no invented timestamps hide the missing feature.
SELECT ok(to_jsonb(r)->>'submitted_at' IS NOT NULL,
 c.name||' new submission records authoritative submission time')
 FROM deadline_cases c JOIN private.research_demo_requests r ON r.id=(c.b->>'request_id')::uuid;
SELECT is((to_jsonb(r)->>'processing_due_at')::timestamptz-(to_jsonb(r)->>'submitted_at')::timestamptz,
 interval '12 hours',c.name||' processing deadline is exactly 12 hours after submission')
 FROM deadline_cases c JOIN private.research_demo_requests r ON r.id=(c.b->>'request_id')::uuid;
SELECT ok(to_jsonb(r)->>'processing_completed_at' IS NOT NULL,
 c.name||' issuing a quote completes the processing cycle')
 FROM deadline_cases c JOIN private.research_demo_requests r ON r.id=(c.b->>'request_id')::uuid;
SELECT is(q.expires_at-q.created_at,interval '48 hours',
 c.name||' distant departure uses the 48-hour quote cap')
 FROM deadline_cases c JOIN private.research_demo_quotes q ON q.id=(c.b->>'quote_id')::uuid;

UPDATE deadline_cases SET result=pg_temp.research_call((b->>'owner_id')::uuid,
 format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id','deadline-'||name));
SELECT is(result->>'status','cancelled',name||' real cancellation remains available') FROM deadline_cases;
SELECT is(result-ARRAY['status','cancelled_at'],b-ARRAY['status','cancelled_at'],
 name||' cancellation preserves payment and original booking fields') FROM deadline_cases;
SELECT is((SELECT count(*) FROM private.research_demo_booking_cancellations h WHERE h.booking_id=(c.b->>'id')::uuid),
 1::bigint,c.name||' cancellation records exactly one history row') FROM deadline_cases c;

-- Exact boundaries use the existing pure policy with explicit authority time;
-- this does not pretend to freeze clock_timestamp() in a real RPC.
SELECT is(private.research_demo_cancellation_allowed('confirmed','paid',NULL,
 '2030-01-03 00:00Z','2030-01-01 00:00Z'),true,'paid exactly 48h remains eligible');
SELECT is(private.research_demo_cancellation_allowed('confirmed','paid',NULL,
 '2030-01-02 23:00Z','2030-01-01 00:00Z'),false,'paid 47h is ineligible');

-- Historical-only branch coverage: Main seeds these cases through real RPCs
-- BEFORE candidate SQL. A fresh full-release database cannot submit 60h/23h
-- requests and explicitly skips this group; no guard is weakened for fixtures.
CREATE FUNCTION pg_temp.deadline_historical_tests() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE c record; result jsonb; qid uuid; child uuid; next_child uuid;
 before_row jsonb; after_row jsonb; before_all jsonb;
 first_submitted timestamptz;
BEGIN
 IF to_regclass('pg_temp.research_deadline_preupgrade_cases') IS NULL THEN
  RETURN QUERY SELECT * FROM skip('Historical deadline branches require pre-upgrade RPC fixtures; fresh full-release path has none',1);
  RETURN;
 END IF;
 RETURN NEXT is((SELECT count(*) FROM pg_temp.research_deadline_preupgrade_cases),5::bigint,
  'all five historical deadline fixtures are present');

 SELECT * INTO STRICT c FROM pg_temp.research_deadline_preupgrade_cases WHERE name='quote60';
 SELECT to_jsonb(r) INTO before_row FROM private.research_demo_requests r WHERE id=c.request_id;
 result:=pg_temp.research_call(c.admin,format(
  'SELECT to_jsonb(public.research_demo_create_quote(%L,%L,100000,%L,%L))',c.request_id,'Delayed quote','VND','Simulation'));
 RETURN NEXT ok(jsonb_typeof(result)='string','real delayed quote RPC succeeds on historical 60h departure');
 IF jsonb_typeof(result)='string' THEN
  qid:=(result#>>'{}')::uuid;
  RETURN NEXT is((SELECT expires_at FROM private.research_demo_quotes WHERE id=qid),c.departure-interval '24 hours',
   'delayed quote expires exactly 24 hours before departure (about 36h after issue)');
  RETURN NEXT ok((SELECT expires_at<created_at+interval '48 hours' FROM private.research_demo_quotes WHERE id=qid),
   'departure cutoff wins over the 48h issue cap');
 END IF;
 SELECT to_jsonb(r) INTO after_row FROM private.research_demo_requests r WHERE id=c.request_id;
 RETURN NEXT is(after_row,before_row,'issuing legacy quote leaves every legacy request field unchanged');

 SELECT * INTO STRICT c FROM pg_temp.research_deadline_preupgrade_cases WHERE name='quote23';
 before_all:=pg_temp.deadline_business_snapshot();
 result:=pg_temp.research_call(c.admin,format(
  'SELECT to_jsonb(public.research_demo_create_quote(%L,%L,100000,%L,%L))',c.request_id,'Too late quote','VND','Simulation'));
 RETURN NEXT is(result->>'error','QUOTE_DEADLINE_PASSED','real delayed quote RPC rejects departure within 24 hours');
 RETURN NEXT is(pg_temp.deadline_business_snapshot(),before_all,
  'rejected late quote creates no quote or event and changes no business fields');

 FOR c IN SELECT * FROM pg_temp.research_deadline_preupgrade_cases WHERE name IN ('return60','reject96','resubmit96') LOOP
  SELECT to_jsonb(r) INTO before_row FROM private.research_demo_requests r WHERE id=c.request_id;
  result:=pg_temp.research_call(c.admin,format('SELECT to_jsonb(public.research_demo_decide(%L,%L,%L))',c.request_id,
   CASE WHEN c.name='reject96' THEN 'rejected' ELSE 'changes_requested' END,'Historical processing result'));
  SELECT to_jsonb(r) INTO after_row FROM private.research_demo_requests r WHERE id=c.request_id;
  RETURN NEXT is(after_row->>'status',CASE WHEN c.name='reject96' THEN 'rejected' ELSE 'changes_requested' END,
   c.name||' actual decision RPC changes business status');
  RETURN NEXT ok(after_row->>'submitted_at' IS NULL AND after_row->>'processing_due_at' IS NULL
   AND after_row->>'processing_completed_at' IS NULL,c.name||' legacy decision retains all stored timing null');
  RETURN NEXT is(after_row-ARRAY['status','notes'],before_row-ARRAY['status','notes'],
   c.name||' decision changes only expected status and notes');
 END LOOP;

 -- Begin_revision clones the immutable source using its real RPC. The cloned
 -- 60h departure cannot be resubmitted under the new policy.
 SELECT * INTO STRICT c FROM pg_temp.research_deadline_preupgrade_cases WHERE name='return60';
 result:=pg_temp.research_call(c.customer,format('SELECT to_jsonb(public.research_demo_begin_revision(%L,%L))',c.request_id,c.revision));
 RETURN NEXT ok(jsonb_typeof(result)='string','begin revision creates a real child for legacy returned request');
 IF jsonb_typeof(result)='string' THEN
  child:=(result#>>'{}')::uuid;
  before_all:=pg_temp.deadline_business_snapshot();
  result:=pg_temp.research_call(c.customer,format('SELECT to_jsonb(public.research_demo_resubmit(%L,%L,%L))',c.request_id,c.revision,child));
  RETURN NEXT is(result->>'error','REQUEST_LEAD_72H','resubmit enforces the 72h lead on historical 60h departure');
  RETURN NEXT is(pg_temp.deadline_business_snapshot(),before_all,'rejected resubmit rolls back request and event changes');
 END IF;

 SELECT * INTO STRICT c FROM pg_temp.research_deadline_preupgrade_cases WHERE name='resubmit96';
 result:=pg_temp.research_call(c.customer,format('SELECT to_jsonb(public.research_demo_begin_revision(%L,%L))',c.request_id,c.revision));
 RETURN NEXT ok(jsonb_typeof(result)='string','begin revision succeeds for future 96h departure');
 IF jsonb_typeof(result)='string' THEN
  child:=(result#>>'{}')::uuid;
  result:=pg_temp.research_call(c.customer,format('SELECT to_jsonb(public.research_demo_resubmit(%L,%L,%L))',c.request_id,c.revision,child));
  RETURN NEXT is(result#>>'{}',c.request_id::text,'real resubmit succeeds for future departure');
  SELECT to_jsonb(r) INTO before_row FROM private.research_demo_requests r WHERE id=c.request_id;
  first_submitted:=(before_row->>'submitted_at')::timestamptz;
  RETURN NEXT ok(first_submitted IS NOT NULL,'legacy resubmit initializes a new tracked processing cycle');
  RETURN NEXT is((before_row->>'processing_due_at')::timestamptz-first_submitted,interval '12 hours',
   'resubmission gets exactly 12 hours of processing time');
  RETURN NEXT ok(before_row->>'processing_completed_at' IS NULL,'new resubmission cycle has no completion');
  before_all:=pg_temp.deadline_business_snapshot();
  result:=pg_temp.research_call(c.customer,format('SELECT to_jsonb(public.research_demo_resubmit(%L,%L,%L))',c.request_id,c.revision,child));
  RETURN NEXT is(result#>>'{}',c.request_id::text,'idempotent resubmit returns same request');
  RETURN NEXT is(pg_temp.deadline_business_snapshot(),before_all,'idempotent resubmit preserves timing and every business row');

  -- Return the now-tracked cycle, then submit another real cloned revision.
  result:=pg_temp.research_call(c.admin,format('SELECT to_jsonb(public.research_demo_decide(%L,%L,%L))',c.request_id,'changes_requested','Second processing result'));
  SELECT to_jsonb(r) INTO after_row FROM private.research_demo_requests r WHERE id=c.request_id;
  RETURN NEXT ok(after_row->>'processing_completed_at' IS NOT NULL,'returning tracked cycle records completion');
  result:=pg_temp.research_call(c.customer,format('SELECT to_jsonb(public.research_demo_begin_revision(%L,%L))',c.request_id,child));
  RETURN NEXT ok(jsonb_typeof(result)='string','second begin revision succeeds');
  IF jsonb_typeof(result)='string' THEN
   next_child:=(result#>>'{}')::uuid;
   result:=pg_temp.research_call(c.customer,format('SELECT to_jsonb(public.research_demo_resubmit(%L,%L,%L))',c.request_id,child,next_child));
   RETURN NEXT is(result#>>'{}',c.request_id::text,'second resubmit succeeds');
   SELECT to_jsonb(r) INTO after_row FROM private.research_demo_requests r WHERE id=c.request_id;
   RETURN NEXT ok((after_row->>'submitted_at')::timestamptz>first_submitted,'new resubmit resets authoritative submission time');
   RETURN NEXT is((after_row->>'processing_due_at')::timestamptz-(after_row->>'submitted_at')::timestamptz,
    interval '12 hours','new resubmit resets due time to a fresh 12-hour window');
   RETURN NEXT ok(after_row->>'processing_completed_at' IS NULL,'new resubmit clears prior completion');
  END IF;
 END IF;
END $$;
SELECT * FROM pg_temp.deadline_historical_tests();

SELECT * FROM finish();
