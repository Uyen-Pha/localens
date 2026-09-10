BEGIN;
CREATE FUNCTION private.prevent_customer_email_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (NEW.email IS DISTINCT FROM OLD.email OR
      (coalesce(NEW.email_change, '') <> '' AND NEW.email_change IS DISTINCT FROM OLD.email_change))
     AND EXISTS (SELECT 1 FROM private.user_roles WHERE user_id = OLD.id AND role = 'customer') THEN
    RAISE EXCEPTION 'Customer sign-in email cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.prevent_customer_email_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER customer_email_immutable BEFORE UPDATE OF email, email_change ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.prevent_customer_email_change();
COMMIT;
