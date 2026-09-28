CREATE TABLE private.user_roles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role),
  UNIQUE (user_id, role)
);
ALTER TABLE private.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.user_roles FORCE ROW LEVEL SECURITY;
