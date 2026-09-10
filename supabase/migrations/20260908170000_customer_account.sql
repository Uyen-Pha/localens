BEGIN;
ALTER TABLE public.profiles
  ADD COLUMN nationality text CHECK (nationality IS NULL OR nationality ~ '^[A-Z]{2}$'),
  ADD COLUMN phone text CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$');
-- Only these personal fields can be changed. IDs, roles and system fields remain protected.
GRANT UPDATE (display_name, nationality, phone) ON public.profiles TO authenticated;
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_valid_display_name
  CHECK (display_name IS NULL OR (length(btrim(display_name)) BETWEEN 1 AND 80 AND display_name !~ '[[:cntrl:]]')) NOT VALID;
COMMIT;
