BEGIN;
-- PostgREST supplies request.jwt.claims as JSON; auth.uid supports both JWT formats.
ALTER POLICY profiles_customer_select ON public.profiles
  USING ((SELECT auth.uid()) = id);
COMMIT;
