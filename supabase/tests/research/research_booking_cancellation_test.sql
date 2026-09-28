-- Opt-in research gate: release migrations do not yet supply the research baseline.
-- Executed inside a transaction by test-research-cancellation-local.mjs; always rolled back.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();
SELECT has_function('public', 'research_demo_cancel_booking', ARRAY['uuid','text'],
  'owning customer cancellation RPC is installed');
SELECT has_table('private', 'research_demo_booking_cancellations',
  'cancellation has durable atomic history');
SELECT has_function('private', 'research_demo_cancellation_allowed',
  ARRAY['text','text','timestamp with time zone','timestamp with time zone','timestamp with time zone'],
  'private deterministic policy accepts explicit authority time');
-- Exercise the original real booking RPC on retained legacy data, without expiring it.
SELECT set_config('request.jwt.claim.sub', owner_id::text, true),
       set_config('request.jwt.claim.role','authenticated',true)
FROM private.research_demo_bookings WHERE status='confirmed' LIMIT 1;
SELECT ok(public.research_demo_booking(quote_id,false) ?& ARRAY['cancelled_at','trip_start_at'],
  'existing booking response exposes nullable cancellation and bound trip time')
FROM private.research_demo_bookings WHERE status='confirmed' LIMIT 1;
-- Both exact boundaries use deterministic authority time, not a frozen RPC clock.
SELECT is(private.research_demo_cancellation_allowed(s,p,e,t,a),want,label)
FROM (VALUES
 ('pending_payment','pending','2030-01-01 00:00Z'::timestamptz,NULL::timestamptz,'2029-12-31 23:59:59.999999Z'::timestamptz,true,'pending one microsecond before expiry'),
 ('pending_payment','pending','2030-01-01 00:00Z',NULL,'2030-01-01 00:00Z',false,'pending exactly at expiry'),
 ('pending_payment','failed','2030-01-01 00:00Z',NULL,'2030-01-01 00:00:00.000001Z',false,'failed payment after expiry'),
 ('pending_payment','failed','2030-01-02 00:00Z',NULL,'2030-01-01 00:00Z',true,'failed payment before expiry'),
 ('confirmed','paid',NULL,'2030-01-03 00:00Z','2030-01-01 00:00Z',true,'paid exactly 48 hours'),
 ('confirmed','paid',NULL,'2030-01-02 23:59:59.999999Z','2030-01-01 00:00Z',false,'paid one microsecond below 48 hours'),
 ('confirmed','paid',NULL,'2030-01-03 00:00:00.000001Z','2030-01-01 00:00Z',true,'paid one microsecond above 48 hours'),
 ('confirmed','pending',NULL,'2030-01-04 00:00Z','2030-01-01 00:00Z',false,'confirmed unpaid fails closed'),
 ('pending_payment','paid','2030-01-04 00:00Z',NULL,'2030-01-01 00:00Z',false,'pending paid fails closed'),
 ('expired','pending','2030-01-04 00:00Z',NULL,'2030-01-01 00:00Z',false,'expired status fails closed'),
 ('cancelled','paid',NULL,'2030-01-04 00:00Z','2030-01-01 00:00Z',false,'cancelled is replay not policy eligibility'),
 ('confirmed','paid',NULL,NULL,'2030-01-01 00:00Z',false,'missing trip time fails closed'),
 ('confirmed','paid',NULL,'infinity','2030-01-01 00:00Z',false,'infinite trip time fails closed'),
 ('pending_payment','pending',NULL,NULL,'2030-01-01 00:00Z',false,'missing expiry fails closed'),
 ('pending_payment','pending','infinity',NULL,'2030-01-01 00:00Z',false,'infinite expiry fails closed'),
 ('pending_payment','pending','2030-01-04 00:00Z',NULL,NULL,false,'missing authority fails closed'),
 ('confirmed','paid',NULL,'2030-01-04 00:00Z','-infinity',false,'infinite authority fails closed')
) AS cases(s,p,e,t,a,want,label);

CREATE TEMP TABLE cancellation_cases(name text PRIMARY KEY,b jsonb NOT NULL,result jsonb);
INSERT INTO cancellation_cases(name,b) VALUES
 ('pending',pg_temp.research_fixture(clock_timestamp()+interval '49 hours')),
 ('failed',pg_temp.research_fixture(clock_timestamp()+interval '49 hours','declined')),
 ('paid47',pg_temp.research_fixture(clock_timestamp()+interval '47 hours','success')),
 ('paid49',pg_temp.research_fixture(clock_timestamp()+interval '49 hours','success')),
 ('expiry',pg_temp.research_fixture(clock_timestamp()+interval '49 hours')),
 ('past',pg_temp.research_fixture(clock_timestamp()+interval '49 hours')),
 ('atomic',pg_temp.research_fixture(clock_timestamp()+interval '49 hours')),
 ('missing',pg_temp.research_fixture(clock_timestamp()+interval '49 hours','success')),
 ('invalid',pg_temp.research_fixture(clock_timestamp()+interval '49 hours','success')),
 ('calendar',pg_temp.research_fixture(clock_timestamp()+interval '49 hours','success')),
 ('expired-status',pg_temp.research_fixture(clock_timestamp()+interval '49 hours')),
 ('actor-key',pg_temp.research_fixture(clock_timestamp()+interval '49 hours')),
 ('bound',pg_temp.research_fixture(clock_timestamp()+interval '49 hours','success'));
-- Cross-booking key conflict needs the same customer on both bookings.
INSERT INTO cancellation_cases(name,b)
 SELECT 'same-owner',pg_temp.research_fixture(clock_timestamp()+interval '49 hours',NULL,(b->>'owner_id')::uuid)
 FROM cancellation_cases WHERE name='pending';

CREATE TEMP TABLE business_before AS
 SELECT 'requests' AS name, jsonb_agg(to_jsonb(t) ORDER BY id) AS data FROM private.research_demo_requests t
 UNION ALL SELECT 'quotes',jsonb_agg(to_jsonb(t) ORDER BY id) FROM private.research_demo_quotes t;

UPDATE cancellation_cases SET result=pg_temp.research_call((b->>'owner_id')::uuid,
 format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id',name))
 WHERE name IN ('pending','failed','paid47','paid49');
SELECT is(result->>'status','cancelled',name||' owner RPC cancels') FROM cancellation_cases WHERE name IN ('pending','failed','paid49');
SELECT is(result->>'error','CANCELLATION_UNAVAILABLE','paid RPC at 47h rejects') FROM cancellation_cases WHERE name='paid47';
SELECT is((SELECT count(*) FROM private.research_demo_booking_cancellations WHERE booking_id=(b->>'id')::uuid),0::bigint,
 'refusal has no history') FROM cancellation_cases WHERE name='paid47';
SELECT is(result-ARRAY['status','cancelled_at'],b-ARRAY['status','cancelled_at'],name||' preserves every other booking field')
 FROM cancellation_cases WHERE name IN ('pending','failed','paid49');
SELECT ok(result->>'cancelled_at' IS NOT NULL,name||' returns cancellation timestamp') FROM cancellation_cases WHERE name IN ('pending','failed','paid49');
SELECT is((SELECT previous_status FROM private.research_demo_booking_cancellations WHERE booking_id=(b->>'id')::uuid),b->>'status',name||' audits previous status')
 FROM cancellation_cases WHERE name IN ('pending','failed','paid49');

SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id',name)),result,
 name||' same key replay') FROM cancellation_cases WHERE name IN ('pending','paid49');
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id','other-key')),result,
 name||' different key replay') FROM cancellation_cases WHERE name IN ('pending','paid49');
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_checkout(%L,%L::jsonb)',b->>'quote_id',
 '{"outcome":"success","travelers":[{"name":"Local Fixture","country":"VN","phone":"+84900000000","email":"fixture@example.invalid"}]}')),result,
 name||' checkout after cancellation returns unchanged result') FROM cancellation_cases WHERE name IN ('pending','paid49');
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_booking(%L,true)',b->>'quote_id')),result,
 'cancelled quote cannot create another booking') FROM cancellation_cases WHERE name='pending';
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id','pending'))->>'error',
 'IDEMPOTENCY_CONFLICT','same actor key conflicts on other booking') FROM cancellation_cases WHERE name='same-owner';
UPDATE cancellation_cases SET result=pg_temp.research_call((b->>'owner_id')::uuid,
 format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id','second-booking')) WHERE name='same-owner';
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id','pending'))->>'error',
 'IDEMPOTENCY_CONFLICT','cross-booking conflict precedes cancelled replay') FROM cancellation_cases WHERE name='same-owner';
SELECT is((SELECT count(*) FROM private.research_demo_booking_cancellations WHERE booking_id=(b->>'id')::uuid),1::bigint,
 name||' only one history despite replay') FROM cancellation_cases WHERE name IN ('pending','paid49','same-owner');
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id','pending'))->>'status',
 'cancelled','same key is independent for another owning actor') FROM cancellation_cases WHERE name='actor-key';

-- Real RPC at a stored deadline equal to transaction time necessarily runs at/after it.
-- Exact equality is asserted in the pure policy above, never claimed as a frozen RPC clock.
UPDATE private.research_demo_bookings SET expires_at=transaction_timestamp()
 WHERE id=(SELECT (b->>'id')::uuid FROM cancellation_cases WHERE name='expiry');
UPDATE private.research_demo_bookings SET expires_at=clock_timestamp()-interval '1 hour'
 WHERE id=(SELECT (b->>'id')::uuid FROM cancellation_cases WHERE name='past');
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id',name))->>'error',
 'CANCELLATION_UNAVAILABLE',name||' RPC refuses expired deadline') FROM cancellation_cases WHERE name IN ('expiry','past');
SELECT is((SELECT count(*) FROM private.research_demo_booking_cancellations WHERE booking_id=(b->>'id')::uuid),0::bigint,
 name||' deadline denial has no history') FROM cancellation_cases WHERE name IN ('expiry','past');
UPDATE private.research_demo_bookings SET status='expired' WHERE id=(SELECT (b->>'id')::uuid FROM cancellation_cases WHERE name='expired-status');
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id',name))->>'error',
 'CANCELLATION_UNAVAILABLE','expired booking status refused despite future deadline') FROM cancellation_cases WHERE name='expired-status';

CREATE TEMP TABLE test_actors(kind text,id uuid DEFAULT gen_random_uuid());
INSERT INTO test_actors(kind) VALUES('customer'),('guide'),('admin');
INSERT INTO auth.users(id) SELECT id FROM test_actors;
INSERT INTO private.user_roles(user_id,role) SELECT id,kind::public.app_role FROM test_actors;
SELECT is(pg_temp.research_call(a.id,format('SELECT public.research_demo_cancel_booking(%L,%L)',c.b->>'id','pending'))->>'error',
 CASE WHEN a.kind='customer' THEN 'NOT_FOUND' ELSE 'Permission denied' END,
 a.kind||' cannot replay another customer cancellation') FROM test_actors a CROSS JOIN cancellation_cases c WHERE c.name='pending';
SELECT is(pg_temp.research_call(a.id,format('SELECT public.research_demo_cancel_booking(%L,%L)',c.b->>'id','role-test'))->>'error',
 CASE WHEN a.kind='customer' THEN 'NOT_FOUND' ELSE 'Permission denied' END,
 a.kind||' cannot cancel another customer pending booking') FROM test_actors a CROSS JOIN cancellation_cases c WHERE c.name='atomic';
SELECT is(pg_temp.research_call(NULL,format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id','anonymous'),'anon')->>'sqlstate',
 '42501','anonymous RPC denied') FROM cancellation_cases WHERE name='atomic';
SELECT is(pg_temp.research_call(NULL,format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id','no-sub'))->>'sqlstate',
 '42501','authenticated without subject denied') FROM cancellation_cases WHERE name='atomic';
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id',k))->>'error',
 'INVALID_IDEMPOTENCY_KEY','empty/null/oversized key denied') FROM cancellation_cases CROSS JOIN (VALUES(NULL::text),(''),('  '),(repeat('x',201))) keys(k) WHERE name='atomic';

-- Create malformed historic snapshots without changing immutable originals or
-- weakening triggers. These privileged fixture edits never substitute for payment.
DO $$ DECLARE c record; child uuid; req jsonb; BEGIN
 FOR c IN SELECT * FROM cancellation_cases WHERE name IN ('missing','invalid','calendar','bound') LOOP
  SELECT request INTO req FROM private.research_demo_revisions WHERE id=(c.b->>'revision_id')::uuid;
  req:=CASE c.name WHEN 'missing' THEN req-'startAt' WHEN 'invalid' THEN jsonb_set(req,'{startAt}','"not-a-date"')
   WHEN 'calendar' THEN jsonb_set(req,'{startAt}','"2030-02-30T00:00:00Z"')
   ELSE jsonb_set(req,'{startAt}',to_jsonb(to_char((clock_timestamp()+interval '1 hour') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'))) END;
  INSERT INTO private.research_demo_revisions(owner_id,catalog_version,request,plan)
   SELECT owner_id,catalog_version,req,plan FROM private.research_demo_revisions WHERE id=(c.b->>'revision_id')::uuid RETURNING id INTO child;
  IF c.name='bound' THEN
   UPDATE private.research_demo_requests SET revision_id=child WHERE id=(c.b->>'request_id')::uuid;
  ELSE
   UPDATE private.research_demo_bookings SET revision_id=child WHERE id=(c.b->>'id')::uuid;
  END IF;
 END LOOP;
END $$;
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_booking(%L,false)',b->>'quote_id'))->'trip_start_at',
 'null'::jsonb,name||' invalid time projects null') FROM cancellation_cases WHERE name IN ('missing','invalid','calendar');
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id',name))->>'error',
 'CANCELLATION_UNAVAILABLE',name||' time fails closed at RPC') FROM cancellation_cases WHERE name IN ('missing','invalid','calendar');
SELECT is((SELECT count(*) FROM private.research_demo_booking_cancellations WHERE booking_id=(b->>'id')::uuid),0::bigint,
 name||' time refusal has no history') FROM cancellation_cases WHERE name IN ('missing','invalid','calendar');
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id',name))->>'status',
 'cancelled','49h bound revision wins over latest request revision at 1h') FROM cancellation_cases WHERE name='bound';

-- Inject an error AFTER both history insert and booking UPDATE; the whole RPC rolls back.
CREATE FUNCTION pg_temp.reject_test_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_ATOMIC_FAILURE';END $$;
DO $$ BEGIN EXECUTE format('CREATE TRIGGER cancellation_test_fault AFTER UPDATE ON private.research_demo_bookings FOR EACH ROW WHEN (NEW.id=%L::uuid) EXECUTE FUNCTION pg_temp.reject_test_update()',
 (SELECT b->>'id' FROM cancellation_cases WHERE name='atomic')); END $$;
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id','atomic'))->>'error',
 'INJECTED_ATOMIC_FAILURE','injected failure escapes cancellation RPC') FROM cancellation_cases WHERE name='atomic';
SELECT is((SELECT to_jsonb(t) FROM private.research_demo_bookings t WHERE id=(b->>'id')::uuid),b-ARRAY['cancelled_at','trip_start_at'],
 'atomic failure restores every booking field') FROM cancellation_cases WHERE name='atomic';
SELECT is((SELECT count(*) FROM private.research_demo_booking_cancellations WHERE booking_id=(b->>'id')::uuid),0::bigint,
 'atomic failure removes inserted history/key') FROM cancellation_cases WHERE name='atomic';
DROP TRIGGER cancellation_test_fault ON private.research_demo_bookings;
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id','atomic'))->>'status',
 'cancelled','rolled-back key can retry successfully') FROM cancellation_cases WHERE name='atomic';

SELECT ok(c.relrowsecurity AND c.relforcerowsecurity,'history has enabled and forced RLS') FROM pg_class c WHERE c.oid='private.research_demo_booking_cancellations'::regclass;
SELECT ok(NOT has_table_privilege(r,'private.research_demo_booking_cancellations',p),r||' has no history '||p)
 FROM unnest(ARRAY['anon','authenticated','service_role']) r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p;
SELECT ok(NOT has_function_privilege(r,'private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz)','EXECUTE'),
 r||' cannot execute private policy') FROM unnest(ARRAY['anon','authenticated','service_role']) r;
SELECT ok(NOT has_function_privilege(r,'public.research_demo_cancel_booking(uuid,text)','EXECUTE'),r||' cannot call cancellation') FROM unnest(ARRAY['anon','service_role']) r;
SELECT ok(has_function_privilege('authenticated','public.research_demo_cancel_booking(uuid,text)','EXECUTE'),'authenticated can call cancellation');
SELECT ok(p.prosecdef AND 'search_path=""'=ANY(p.proconfig),'cancellation definer has empty search path') FROM pg_proc p WHERE p.oid='public.research_demo_cancel_booking(uuid,text)'::regprocedure;
SELECT ok('lock_timeout=5s'=ANY(p.proconfig) AND 'statement_timeout=10s'=ANY(p.proconfig),'cancellation has bounded timeouts') FROM pg_proc p WHERE p.oid='public.research_demo_cancel_booking(uuid,text)'::regprocedure;
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,sql)->>'sqlstate','42501','browser direct history write blocked')
 FROM cancellation_cases CROSS JOIN (VALUES
 ('INSERT INTO private.research_demo_booking_cancellations SELECT * FROM private.research_demo_booking_cancellations RETURNING to_jsonb(booking_id)'),
 ('UPDATE private.research_demo_booking_cancellations SET idempotency_key=''tampered'' RETURNING to_jsonb(booking_id)'),
 ('DELETE FROM private.research_demo_booking_cancellations RETURNING to_jsonb(booking_id)'),
 ('SELECT to_jsonb(private.research_demo_cancellation_allowed(''confirmed'',''paid'',NULL,now(),now()))')
 ) commands(sql) WHERE name='pending';
SELECT throws_ok('INSERT INTO private.research_demo_booking_cancellations SELECT * FROM private.research_demo_booking_cancellations LIMIT 1','23505',NULL,'actual booking uniqueness constraint rejects duplicate history');
SELECT throws_ok(format('INSERT INTO private.research_demo_booking_cancellations(booking_id,actor_id,cancelled_at,idempotency_key,previous_status) SELECT %L,actor_id,cancelled_at,idempotency_key,previous_status FROM private.research_demo_booking_cancellations WHERE booking_id=%L',
 (SELECT b->>'id' FROM cancellation_cases WHERE name='paid47'),(SELECT b->>'id' FROM cancellation_cases WHERE name='pending')),
 '23505',NULL,'actual actor/key uniqueness rejects reuse on a different booking');
SELECT throws_ok('UPDATE private.research_demo_booking_cancellations SET idempotency_key=''tampered''','42501',NULL,'history cannot be updated even by fixture owner');
SELECT throws_ok('DELETE FROM private.research_demo_booking_cancellations','42501',NULL,'history cannot be deleted even by fixture owner');
SELECT throws_ok('UPDATE private.research_demo_bookings SET status=''invented''','23514',NULL,'actual booking status constraint rejects unknown status');
-- Temporary diagnostic grants isolate RLS from ACL denial; revoked immediately
-- and the enclosing harness transaction rolls back all test DDL as a second guard.
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON private.research_demo_booking_cancellations TO authenticated;
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,'SELECT to_jsonb(count(*)) FROM private.research_demo_booking_cancellations'),
 '0'::jsonb,'RLS hides history even with temporary SELECT grant') FROM cancellation_cases WHERE name='pending';
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('INSERT INTO private.research_demo_booking_cancellations VALUES(%L,%L,clock_timestamp(),%L,%L) RETURNING to_jsonb(booking_id)',
 b->>'id',b->>'owner_id','rls-test','confirmed'))->>'sqlstate','42501','RLS prevents insertion with temporary INSERT grant') FROM cancellation_cases WHERE name='paid47';
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,'WITH affected AS (UPDATE private.research_demo_booking_cancellations SET idempotency_key=''forbidden'' RETURNING 1) SELECT to_jsonb(count(*)) FROM affected'),
 '0'::jsonb,'RLS prevents updates with temporary UPDATE grant') FROM cancellation_cases WHERE name='pending';
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,'WITH affected AS (DELETE FROM private.research_demo_booking_cancellations RETURNING 1) SELECT to_jsonb(count(*)) FROM affected'),
 '0'::jsonb,'RLS prevents deletes with temporary DELETE grant') FROM cancellation_cases WHERE name='pending';
REVOKE SELECT,INSERT,UPDATE,DELETE ON private.research_demo_booking_cancellations FROM authenticated;
REVOKE USAGE ON SCHEMA private FROM authenticated;
SELECT ok(NOT has_table_privilege('authenticated','private.research_demo_booking_cancellations','INSERT'), 'temporary history grant revoked');
SELECT ok(NOT has_schema_privilege('authenticated','private','USAGE'), 'temporary schema grant revoked');
SELECT is((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM private.research_demo_quotes t),(SELECT data FROM business_before WHERE name='quotes'),'all quote data unchanged');
-- Bound test deliberately moved one request revision. Every other request field stays identical.
SELECT is((SELECT jsonb_agg(to_jsonb(t)-'revision_id' ORDER BY id) FROM private.research_demo_requests t),
 (SELECT jsonb_agg(value-'revision_id' ORDER BY value->>'id') FROM business_before,jsonb_array_elements(data) WHERE name='requests'),
 'request approval/notes/deadlines unchanged');
SELECT is((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM private.research_demo_requests t WHERE id<>(SELECT (b->>'request_id')::uuid FROM cancellation_cases WHERE name='bound')),
 (SELECT jsonb_agg(value ORDER BY value->>'id') FROM business_before,jsonb_array_elements(data) WHERE name='requests' AND value->>'id'<>(SELECT b->>'request_id' FROM cancellation_cases WHERE name='bound')),
 'every request revision unchanged except explicit bound-revision test setup');
SELECT * FROM finish();
