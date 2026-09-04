BEGIN;

-- PostgREST supplies the complete JWT payload in request.jwt.claims, while
-- direct pgTAP roles set the dotted request.jwt.claim.sub value. Resolve both
-- shapes without granting the restricted API roles access to auth schema.
ALTER POLICY trip_plans_owner_select
ON public.trip_plans
USING (
  COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(
      NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      'sub'
    )
  )::uuid = owner_user_id
);

ALTER POLICY trip_plan_revisions_owner_select
ON public.trip_plan_revisions
USING (
  EXISTS (
    SELECT 1
    FROM public.trip_plans AS plans
    WHERE plans.id = trip_plan_revisions.plan_id
      AND plans.owner_user_id = COALESCE(
        NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        pg_catalog.jsonb_extract_path_text(
          NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
          'sub'
        )
      )::uuid
  )
);

ALTER POLICY trip_plan_items_owner_select
ON public.trip_plan_items
USING (
  EXISTS (
    SELECT 1
    FROM public.trip_plan_revisions AS revisions
    JOIN public.trip_plans AS plans
      ON plans.id = revisions.plan_id
    WHERE revisions.id = trip_plan_items.revision_id
      AND plans.owner_user_id = COALESCE(
        NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        pg_catalog.jsonb_extract_path_text(
          NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
          'sub'
        )
      )::uuid
  )
);

COMMIT;
