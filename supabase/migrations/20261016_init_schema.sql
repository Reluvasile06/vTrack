-- vTrack Etapa 1 — initial schema
-- Matches SYSTEM_ARCHITECTURE.md + Stage 1 additions (preferred_language, RLS, DJI vault refs)

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Ensure search_path can resolve postgis / uuid helpers
SET search_path TO public, extensions, vault;

-- ==========================================
-- 1. PROFILES & AUTHENTICATION (TWILIO SMS)
-- ==========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT UNIQUE NOT NULL,
  phone_verified BOOLEAN DEFAULT false,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'ro'
    CHECK (preferred_language IN ('ro', 'en', 'es', 'pt', 'fr')),
  device_uuid TEXT,
  battery_level INT DEFAULT 100,
  is_battery_saver_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_profiles_phone ON public.profiles(phone_number);

-- ==========================================
-- 2. ORGANIZATIONS & MULTI-TENANCY (B2B & B2C)
-- ==========================================
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('b2b_corporate', 'law_enforcement', 'hunting_assoc', 'b2c_individual')) NOT NULL,
  subscription_plan TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ,
  max_users INT DEFAULT 5,
  max_drones INT DEFAULT 1,
  max_vehicles INT DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  roles TEXT[] NOT NULL DEFAULT '{"field_operator"}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id),
  CONSTRAINT organization_members_roles_valid CHECK (
    roles <@ ARRAY['b2b_admin', 'dispatcher', 'field_operator']::TEXT[]
    AND cardinality(roles) >= 1
  )
);

CREATE TABLE public.stripe_customers (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DJI OpenAPI credential references (secrets live in Supabase Vault)
CREATE TABLE public.organization_dji_credentials (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  vault_user_token_id UUID,
  vault_project_uuid_id UUID,
  last_verified_at TIMESTAMPTZ,
  last_verify_status TEXT,
  last_verify_detail JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 3. MISSIONS, ACCESS & PERMISSIONS MATRIX
-- ==========================================
CREATE TABLE public.missions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id),
  title TEXT NOT NULL,
  code_alphanumeric VARCHAR(6) UNIQUE NOT NULL,
  pin_code VARCHAR(4),
  status TEXT CHECK (status IN ('draft', 'active', 'completed', 'archived')) DEFAULT 'draft',
  boundary GEOMETRY(Polygon, 4326) NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  retention_days INT DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_missions_boundary ON public.missions USING GIST(boundary);

CREATE TABLE public.mission_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  custom_color VARCHAR(7) DEFAULT '#3B82F6',
  requires_approval BOOLEAN DEFAULT false,
  can_view_drones_on_map BOOLEAN DEFAULT true,
  can_view_stream BOOLEAN DEFAULT false,
  can_request_drone_dispatch BOOLEAN DEFAULT false,
  can_control_payload BOOLEAN DEFAULT false,
  can_control_drone BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mission_id, user_id)
);

CREATE TABLE public.mission_member_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  last_known_location GEOMETRY(Point, 4326)
);

-- ==========================================
-- 4. SPATIAL TELEMETRY (2.5s THROTTLED)
-- ==========================================
CREATE TABLE public.mission_telemetry_history (
  id BIGSERIAL PRIMARY KEY,
  mission_id UUID REFERENCES public.missions(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL,
  entity_type TEXT CHECK (entity_type IN ('member', 'guest', 'drone', 'vehicle')) NOT NULL,
  location GEOMETRY(Point, 4326) NOT NULL,
  altitude_agl NUMERIC(8,2),
  altitude_msl NUMERIC(8,2),
  speed NUMERIC(5,2),
  heading NUMERIC(5,2),
  battery_level INT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_telemetry_mission_time ON public.mission_telemetry_history(mission_id, recorded_at DESC);
CREATE INDEX idx_telemetry_location ON public.mission_telemetry_history USING GIST(location);

-- ==========================================
-- 5. GIS OVERLAYS & POIS
-- ==========================================
CREATE TABLE public.gis_overlays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  region_code TEXT,
  organization_id UUID REFERENCES public.organizations(id),
  geojson_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.mission_pois (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID REFERENCES public.missions(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[],
  geometry GEOMETRY(Geometry, 4326) NOT NULL,
  media_urls TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 6. IMMUTABLE AUDIT LOGS
-- ==========================================
CREATE TABLE public.mission_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  mission_id UUID REFERENCES public.missions(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id),
  action_type TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.prevent_audit_log_alteration()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Jurnalele de audit sunt imutabile si nu pot fi modificate sau sterse.';
END;
$$;

CREATE TRIGGER trg_protect_audit_logs
BEFORE UPDATE OR DELETE ON public.mission_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_alteration();

-- ==========================================
-- 7. HELPERS: updated_at, membership, phone uniqueness
-- ==========================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_org_dji_updated_at
BEFORE UPDATE ON public.organization_dji_credentials
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enforce app-wide phone uniqueness vs auth.users.phone as well
CREATE OR REPLACE FUNCTION public.enforce_phone_uniqueness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.phone_number = NEW.phone_number
      AND p.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'phone_number already registered';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_phone_unique
BEFORE INSERT OR UPDATE OF phone_number ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_phone_uniqueness();

CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = org_id AND m.user_id = uid
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(org_id UUID, role_name TEXT, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = org_id
      AND m.user_id = uid
      AND role_name = ANY (m.roles)
  );
$$;

-- Auto-create profile stub when auth user is created (phone OTP)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  phone TEXT;
  lang TEXT;
  display_name TEXT;
BEGIN
  phone := COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone_number');
  lang := COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'ro');
  IF lang NOT IN ('ro', 'en', 'es', 'pt', 'fr') THEN
    lang := 'ro';
  END IF;
  display_name := COALESCE(NEW.raw_user_meta_data->>'full_name', phone, 'User');

  IF phone IS NULL OR length(trim(phone)) = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, phone_number, phone_verified, full_name, preferred_language)
  VALUES (
    NEW.id,
    phone,
    COALESCE((NEW.phone IS NOT NULL), false),
    display_name,
    lang
  )
  ON CONFLICT (id) DO UPDATE
    SET phone_number = EXCLUDED.phone_number,
        phone_verified = EXCLUDED.phone_verified,
        preferred_language = COALESCE(public.profiles.preferred_language, EXCLUDED.preferred_language);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- 8. ROW LEVEL SECURITY (Stage 1 baseline)
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_dji_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_member_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_telemetry_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gis_overlays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_pois ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY org_select_member ON public.organizations
  FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY org_insert_authenticated ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY org_update_admin ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.has_org_role(id, 'b2b_admin'))
  WITH CHECK (public.has_org_role(id, 'b2b_admin'));

CREATE POLICY org_members_select ON public.organization_members
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY org_members_admin_write ON public.organization_members
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, 'b2b_admin') OR user_id = auth.uid())
  WITH CHECK (public.has_org_role(organization_id, 'b2b_admin') OR user_id = auth.uid());

CREATE POLICY stripe_customers_admin ON public.stripe_customers
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, 'b2b_admin'))
  WITH CHECK (public.has_org_role(organization_id, 'b2b_admin'));

CREATE POLICY subscriptions_admin ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, 'b2b_admin'))
  WITH CHECK (public.has_org_role(organization_id, 'b2b_admin'));

CREATE POLICY dji_creds_admin ON public.organization_dji_credentials
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, 'b2b_admin'))
  WITH CHECK (public.has_org_role(organization_id, 'b2b_admin'));

CREATE POLICY missions_select_member ON public.missions
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.mission_id = id AND mm.user_id = auth.uid()
    )
  );

CREATE POLICY missions_insert_auth ON public.missions
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY missions_update_creator_or_admin ON public.missions
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR (organization_id IS NOT NULL AND public.has_org_role(organization_id, 'b2b_admin'))
    OR (organization_id IS NOT NULL AND public.has_org_role(organization_id, 'dispatcher'))
  );

CREATE POLICY mission_members_select ON public.mission_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = mission_id AND (
        m.created_by = auth.uid()
        OR public.is_org_member(m.organization_id)
      )
    )
  );

CREATE POLICY mission_members_write ON public.mission_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = mission_id AND (
        m.created_by = auth.uid()
        OR public.has_org_role(m.organization_id, 'b2b_admin')
        OR public.has_org_role(m.organization_id, 'dispatcher')
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = mission_id AND (
        m.created_by = auth.uid()
        OR public.has_org_role(m.organization_id, 'b2b_admin')
        OR public.has_org_role(m.organization_id, 'dispatcher')
      )
    )
  );

CREATE POLICY mission_sessions_member ON public.mission_member_sessions
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = mission_id AND public.is_org_member(m.organization_id)
    )
  )
  WITH CHECK (user_id = auth.uid());

CREATE POLICY telemetry_select ON public.mission_telemetry_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = mission_id AND (
        public.is_org_member(m.organization_id)
        OR EXISTS (
          SELECT 1 FROM public.mission_members mm
          WHERE mm.mission_id = m.id AND mm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY telemetry_insert ON public.mission_telemetry_history
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY gis_overlays_select ON public.gis_overlays
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id));

CREATE POLICY gis_overlays_write ON public.gis_overlays
  FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND public.has_org_role(organization_id, 'b2b_admin'))
  WITH CHECK (organization_id IS NOT NULL AND public.has_org_role(organization_id, 'b2b_admin'));

CREATE POLICY pois_select ON public.mission_pois
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = mission_id AND (
        public.is_org_member(m.organization_id)
        OR EXISTS (
          SELECT 1 FROM public.mission_members mm
          WHERE mm.mission_id = m.id AND mm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY pois_insert ON public.mission_pois
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY audit_select ON public.mission_audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = mission_id AND (
        public.is_org_member(m.organization_id)
        OR public.has_org_role(m.organization_id, 'dispatcher')
        OR public.has_org_role(m.organization_id, 'b2b_admin')
      )
    )
  );

CREATE POLICY audit_insert ON public.mission_audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- ==========================================
-- 9. QUOTA HELPERS (Stripe scaffolding)
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_organization_usage(org_id UUID)
RETURNS TABLE (
  users_count INT,
  max_users INT,
  max_drones INT,
  max_vehicles INT,
  subscription_plan TEXT,
  subscription_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::INT FROM public.organization_members m WHERE m.organization_id = org_id),
    o.max_users,
    o.max_drones,
    o.max_vehicles,
    o.subscription_plan,
    (SELECT s.status FROM public.subscriptions s
      WHERE s.organization_id = org_id
      ORDER BY s.created_at DESC LIMIT 1)
  FROM public.organizations o
  WHERE o.id = org_id;
$$;

GRANT EXECUTE ON FUNCTION public.is_org_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_usage(UUID) TO authenticated;
