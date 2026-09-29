// Preserve historical 47h/49h cases while creating through today's real RPCs.
export const legacyCancellationFixture = `
ALTER FUNCTION pg_temp.research_fixture(timestamptz,text,uuid) RENAME TO research_fixture_current;
CREATE FUNCTION pg_temp.research_fixture(p_start timestamptz,p_outcome text DEFAULT NULL,p_owner uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE b jsonb; child uuid; BEGIN
 b:=pg_temp.research_fixture_current(greatest(p_start,clock_timestamp()+interval '96 hours'),p_outcome,p_owner);
 INSERT INTO private.research_demo_revisions(owner_id,catalog_version,request,plan)
 SELECT owner_id,catalog_version,jsonb_set(request,'{startAt}',to_jsonb(to_char(p_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))),plan
 FROM private.research_demo_revisions WHERE id=(b->>'revision_id')::uuid RETURNING id INTO child;
 UPDATE private.research_demo_bookings SET revision_id=child WHERE id=(b->>'id')::uuid;
 PERFORM pg_temp.research_claims((b->>'owner_id')::uuid);
 b:=public.research_demo_booking((b->>'quote_id')::uuid,false);
 PERFORM set_config('role','none',true);
 RETURN b;
END $$;`;

export function adaptLegacyCancellationActors(suite) {
  const marker = 'INSERT INTO private.user_roles(user_id,role) SELECT id,kind::public.app_role FROM test_actors;';
  if (!suite.includes(marker)) throw new Error('Legacy actor fixture changed; review adapter');
  return suite.replace(marker, 'DELETE FROM private.user_roles WHERE user_id IN (SELECT id FROM test_actors);\n' + marker);
}
