-- Application Admin email/password auth (Stage 1)
-- Applied on Supabase project vtrack as migration app_admin_email_auth
-- Allows email-based app admins alongside phone OTP profiles.

-- 1) Phone may be null for email-only app admins
ALTER TABLE public.profiles
  ALTER COLUMN phone_number DROP NOT NULL;

-- 2) Email + app-admin flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS is_app_admin BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email)
  WHERE email IS NOT NULL;

-- 3) handle_new_user: create profile from phone and/or email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  phone TEXT;
  email TEXT;
  lang TEXT;
  display_name TEXT;
  is_admin BOOLEAN;
BEGIN
  phone := COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone_number');
  email := COALESCE(NEW.email, NEW.raw_user_meta_data->>'email');
  lang := COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'ro');
  is_admin := COALESCE((NEW.raw_user_meta_data->>'is_app_admin')::boolean, false);
  IF lang NOT IN ('ro', 'en', 'es', 'pt', 'fr') THEN
    lang := 'ro';
  END IF;
  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(COALESCE(email, ''), '@', 1),
    phone,
    'User'
  );

  IF (phone IS NULL OR length(trim(phone)) = 0)
     AND (email IS NULL OR length(trim(email)) = 0) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (
    id, phone_number, phone_verified, full_name, preferred_language, email, is_app_admin
  )
  VALUES (
    NEW.id,
    NULLIF(trim(phone), ''),
    COALESCE((NEW.phone IS NOT NULL), false),
    display_name,
    lang,
    NULLIF(trim(email), ''),
    is_admin
  )
  ON CONFLICT (id) DO UPDATE
    SET phone_number = COALESCE(EXCLUDED.phone_number, public.profiles.phone_number),
        phone_verified = EXCLUDED.phone_verified,
        preferred_language = COALESCE(public.profiles.preferred_language, EXCLUDED.preferred_language),
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        is_app_admin = public.profiles.is_app_admin OR EXCLUDED.is_app_admin;

  RETURN NEW;
END;
$$;

-- 4) App admins can list/create organizations (in addition to member policies)
DROP POLICY IF EXISTS org_select_app_admin ON public.organizations;
CREATE POLICY org_select_app_admin ON public.organizations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_app_admin = true
    )
  );

DROP POLICY IF EXISTS org_insert_app_admin ON public.organizations;
CREATE POLICY org_insert_app_admin ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_app_admin = true
    )
    OR auth.uid() IS NOT NULL
  );
