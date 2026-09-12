BEGIN;
ALTER TABLE public.guide_profiles ADD COLUMN IF NOT EXISTS contact_address text;
ALTER TABLE public.guide_profiles ADD COLUMN IF NOT EXISTS operating_area text;
-- One canonical phone field for every account; uniqueness is enforced during concurrent writes.
CREATE UNIQUE INDEX profiles_unique_phone ON public.profiles(phone) WHERE phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_own_guide_profile()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR (SELECT count(*) FROM private.user_roles WHERE user_id=auth.uid())<>1 OR NOT EXISTS (
    SELECT 1 FROM private.user_roles r JOIN auth.users u ON u.id=r.user_id
    WHERE r.user_id=auth.uid() AND r.role='guide' AND (u.banned_until IS NULL OR u.banned_until<=now())
  ) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'displayName',coalesce(g.display_name,p.display_name,''), 'email',coalesce(u.email,''),
    'phone',coalesce(p.phone,''), 'contactAddress',coalesce(g.contact_address,''),
    'bio',coalesce(g.bio,''), 'language',g.language::text,
    'operatingArea',coalesce(g.operating_area,''), 'joinedAt',g.created_at::text
  ) INTO result FROM public.guide_profiles g JOIN public.profiles p ON p.id=g.user_id
    JOIN auth.users u ON u.id=g.user_id WHERE g.user_id=auth.uid();
  IF result IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.update_own_guide_profile(p_field text,p_value text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.get_own_guide_profile();
  p_value=btrim(p_value);
  IF p_value IS NULL OR p_field IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
  IF p_field='phone' THEN
    p_value=regexp_replace(p_value,'[[:space:]()-]','','g');
    IF p_value !~ '^\+[1-9][0-9]{6,14}$' THEN RAISE EXCEPTION 'INVALID_PHONE' USING ERRCODE='22023'; END IF;
    UPDATE public.profiles SET phone=p_value,updated_at=now() WHERE id=auth.uid();
  ELSIF p_field='contactAddress' THEN
    IF length(p_value) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'INVALID_ADDRESS' USING ERRCODE='22023'; END IF;
    UPDATE public.guide_profiles SET contact_address=p_value,updated_at=now() WHERE user_id=auth.uid();
  ELSIF p_field='bio' THEN
    IF length(p_value) NOT BETWEEN 100 AND 1000 THEN RAISE EXCEPTION 'INVALID_BIO' USING ERRCODE='22023'; END IF;
    UPDATE public.guide_profiles SET bio=p_value,updated_at=now() WHERE user_id=auth.uid();
  ELSE RAISE EXCEPTION 'INVALID_FIELD' USING ERRCODE='22023'; END IF;
  RETURN public.get_own_guide_profile();
END $$;
-- Existing customer update grants must not allow a guide to edit company-owned fields.
CREATE OR REPLACE FUNCTION private.guard_guide_company_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM private.user_roles WHERE user_id=auth.uid() AND role='guide')
    AND (NEW.display_name IS DISTINCT FROM OLD.display_name OR NEW.nationality IS DISTINCT FROM OLD.nationality)
  THEN RAISE EXCEPTION 'COMPANY_MANAGED_FIELD' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_guide_company_fields BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.guard_guide_company_fields();
REVOKE ALL ON FUNCTION private.guard_guide_company_fields() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_own_guide_profile(),public.update_own_guide_profile(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_own_guide_profile(),public.update_own_guide_profile(text,text) TO authenticated;
COMMIT;
