-- Global application settings (Twilio / Stripe credentials UI storage)
-- Readable/writable only by profiles.is_app_admin. Do not hardcode secrets in the repo.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION public.touch_app_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER trg_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_app_settings_updated_at();

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_select_app_admin ON public.app_settings;
CREATE POLICY app_settings_select_app_admin ON public.app_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_app_admin = true
    )
  );

DROP POLICY IF EXISTS app_settings_write_app_admin ON public.app_settings;
CREATE POLICY app_settings_write_app_admin ON public.app_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_app_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_app_admin = true
    )
  );

-- Seed known keys (empty values) so the UI can upsert consistently
INSERT INTO public.app_settings (key, value) VALUES
  ('twilio_account_sid', ''),
  ('twilio_auth_token', ''),
  ('twilio_messaging_service_sid', ''),
  ('stripe_secret_key', ''),
  ('stripe_publishable_key', ''),
  ('stripe_webhook_secret', '')
ON CONFLICT (key) DO NOTHING;
