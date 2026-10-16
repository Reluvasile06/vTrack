# SYSTEM_ARCHITECTURE.md
> **vTrack Enterprise — Software Architecture & Technical Specification**
> *Documentație Tehnică de Producție pentru Cursor Composer*

---

## 1. Arhitectura Generală & Stack Tehnologic

- **Backend / Cloud Platform:** Supabase (PostgreSQL + PostGIS, Supabase Auth, Supabase Realtime/Presence, Supabase Storage, Edge Functions Deno/TypeScript, Supabase Vault pentru chei criptate, `pg_cron` pentru retenție).
- **Aplicație Mobilă (iOS & Android):** React Native (Expo), MapLibre GL Native, SQLite/WatermelonDB (stocare offline locală), Background Location Tracking (Distance Filter = 2m).
- **Dashboard Web Cockpit & Admin Console:** React (Vite) + Tailwind CSS, MapLibre GL JS, WebRTC / DJI OpenAPI streaming, HTML5 Canvas & Web Keyboards.
- **Internationalization (i18n): Suport multi-lingv nativ (i18next / expo-localization) cu comutare dinamică pentru limbile: Română (RO), Engleză (EN), Spaniolă (ES), Portugheză (PT) și Franceză (FR).
- **Integrări Servicii Externe:**
  - **Twilio SMS:** Verificare număr de telefon (SMS OTP) & Supabase Auth MFA.
  - **Stripe API:** Subscripții SaaS, plăți unice (One-Time Event Pass) și gestiune cote.
  - **DJI FlightHub 2 OpenAPI (Cloud V1.0):** Control drone, stații DJI Dock, stream video nativ WebRTC, telemetrie HMS și task-uri autonome WPML.

---

## 2. Baza de Date Supabase (PostgreSQL + PostGIS Schema)

Rulați următorul script SQL în editorul Supabase pentru a configura baza de date, indecșii spațiali și regulile de imutabilitate ale jurnalelor de audit.

```sql
-- Extensii PostGIS si UUID
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. PROFILES & AUTHENTICATION (TWILIO SMS)
-- ==========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT UNIQUE NOT NULL, -- Unic pe intreaga aplicatie
  phone_verified BOOLEAN DEFAULT false,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
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

-- Tabela de legatura cu ROLURI COMPOZITE per membru in organizatie
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  roles TEXT[] NOT NULL DEFAULT '{"field_operator"}', -- Moduri posibile: b2b_admin, dispatcher, field_operator
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Stripe Integration Tables
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

-- ==========================================
-- 3. MISSIONS, ACCESS & PERMISSIONS MATRIX
-- ==========================================
CREATE TABLE public.missions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id),
  title TEXT NOT NULL,
  code_alphanumeric VARCHAR(6) UNIQUE NOT NULL, -- Cod unic 6 caractere (ex: VT-8X2K)
  pin_code VARCHAR(4),                          -- PIN din 4 cifre
  status TEXT CHECK (status IN ('draft', 'active', 'completed', 'archived')) DEFAULT 'draft',
  boundary GEOMETRY(Polygon, 4326) NOT NULL,    -- Arie delimitata obligatorie
  created_by UUID REFERENCES public.profiles(id),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  retention_days INT DEFAULT 15,               -- 15 zile B2C / 365 zile B2B
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_missions_boundary ON public.missions USING GIST(boundary);

-- Matrice de Permisiuni Granulare per Membru
CREATE TABLE public.mission_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  custom_color VARCHAR(7) DEFAULT '#3B82F6',   -- Culoare unica traiectorie
  requires_approval BOOLEAN DEFAULT false,
  can_view_drones_on_map BOOLEAN DEFAULT true,
  can_view_stream BOOLEAN DEFAULT false,
  can_request_drone_dispatch BOOLEAN DEFAULT false,
  can_control_payload BOOLEAN DEFAULT false,
  can_control_drone BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mission_id, user_id)
);

-- Istoric Sesiuni de Prezență (Intrari / Iesiri multiple)
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
  entity_id UUID NOT NULL,                     -- Profile UUID sau Drone SN
  entity_type TEXT CHECK (entity_type IN ('member', 'guest', 'drone', 'vehicle')) NOT NULL,
  location GEOMETRY(Point, 4326) NOT NULL,
  altitude_agl NUMERIC(8,2),                    -- Above Ground Level (AGL)
  altitude_msl NUMERIC(8,2),                    -- Mean Sea Level (MSL)
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
  region_code TEXT,                            -- Cod tara/regiune (ex: 'RO')
  organization_id UUID REFERENCES public.organizations(id), -- NULL = Public/Global
  geojson_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.mission_pois (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID REFERENCES public.missions(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,                      -- Hazard, Item, Track, Injured, Base, Custom
  tags TEXT[],                                 -- Ex: ['#PersoanăRănită', '#PistăGăsită']
  geometry GEOMETRY(Geometry, 4326) NOT NULL,
  media_urls TEXT[],                           -- Poze georeferentiate
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 6. IMMUTABLE AUDIT LOGS
-- ==========================================
CREATE TABLE public.mission_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  mission_id UUID REFERENCES public.missions(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id),
  action_type TEXT NOT NULL,                   -- SOS_TRIGGER, DRONE_DISPATCH, GEOFENCE_VIOLATION, OVERRIDE_CONTROL, RTH_FAILSAFE
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger pentru protejarea imutabilitatii jurnalului de audit
CREATE OR REPLACE FUNCTION prevent_audit_log_alteration()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Jurnalele de audit sunt imutabile si nu pot fi modificate sau sterse.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_audit_logs
BEFORE UPDATE OR DELETE ON public.mission_audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_alteration();

3. Supabase Edge Functions Core Logic (TypeScript / Deno)
A. Verificare Pre-Zbor & Autonomous Dispatch Dronă
supabase/functions/dji-autonomous-dispatch/index.ts
- Verifică dreptul can_request_drone_dispatch.
- Verifică raza maximă de 10 km față de DJI Dock prin formula Haversine.
- Verifică starea vremii (vânt <12 m/s, fără ploaie torențială) și bateria minimă.
- Generează fișierul WPML și execută apelul DJI OpenAPI POST /openapi/v0.1/flight-task (task_type: "immediate").

B. Telemetry Fail-Safe Watchdog (15 secunde)
supabase/functions/telemetry-watchdog/index.ts
- Cron Job activat la fiecare 5 secunde.
- Interoghează dronele active care nu au furnizat telemetrie în ultimele 15 secunde.
- Execută automat apelul POST /openapi/v0.1/device/{device_sn}/command cu command: "return_home".
- Salvează evenimentul critic în mission_audit_logs.

C. Verificare Chei Criptate DJI OpenAPI (B2B Admin Console)
supabase/functions/dji-verify-credentials/index.ts
- Preia cheile dji_user_token și dji_project_uuid stocate criptat în Supabase Vault.
- Execută apelul de test GET /openapi/v0.1/device.
- Returnează lista și numărul de drone/dock-uri DJI active și conectate.

4. Ghid UI/UX & Layout-uri de Interfață
A. Tema Vizuală System
- Dark Tactical Mode (Default): Fundal #0B0F17, panouri #151C28, borduri #2A364F, accent tactic #3B82F6, pericol #EF4444.
- High-Contrast Outdoor Day Mode: Fundal luminos #F3F4F6, pini accentuați pentru vizibilitate sub soare puternic.
B. Interfața Mobilă (React Native Expo)
- Top Bar: Cod Misie (VT-8X2K), Status Conexiune (Verde/Gri offline), Selector Straturi (Standard/Satelit/Topo/Hibrid/Overlay-uri) + Slider Opacitate (0–100%), Widget Meteo, Nivel Baterie Telefon + Comutator Battery Saver Profile.
- Action Side Buttons (FAB): Recentrare Hartă, Orientare (North-Up vs Course-Up), Riglă Distanță/Suprafață (ha / km²), Adăugare Marker Rapid / POI (#tags + Poză), Go Live Field-Cam.
- Bottom Bar Fixă:
  - Buton SOS (Roșu Prominent): Hold 2 secunde -> Declanșează iOS Critical Alert / Android Alarm Channel (trece peste modul Silent).
  - Buton PTT (Push-To-Talk Walkie-Talkie): Transmisie audio live pe canalul global al misiunii.
  - Bottom Sheet: Tab Echipă (baterie, status, buton apelare directă tel:), Tab Chat/Media, Tab Manager Hărți Offline MapLibre.
C. Interfața Web Cockpit (3 Panouri Sidebars + Pop-out Windows)
- Panoul Stânga (Collapsible): Lista Operatori (baterie/signal status), Flota Drone (stare HMS, cicluri baterie, temp, buton Hot Swap), Matrice Permisiuni Granulare.
- Harta Centrală: MapLibre GL JS, afișare traiectorii pe culori unice (custom_color), filtru "Coadă Traiectorie" (15m, 30m, 45m, 1h, 2h, 3h, Toată Misiunea), Timeline Slider pentru Mission Replay (1x, 2x, 5x, 10x).
- Panoul Dreapta: Multi-Stream Grid 2x2 sau Pop-out Floating Windows (redimensionabile și mobilor pe ecran). Switch lentile (Wide, Zoom, Thermal IR cu izoterme). Cockpit tastatură (WASD mișcare, Q/E altitudine, Space frână urgență/RTH). Controale PSDK (reflector, megafon).
- Bară Infinită de Audit & Alerte: Banner roșu clipitor la SOS cu alertă sonoră ce persistă până la apăsarea butonului "Acknowledge / Preluat".

vtrack-monorepo/
├── SYSTEM_ARCHITECTURE.md
├── ROADMAP.md
├── apps/
│   ├── mobile/                   # React Native (Expo) - iOS & Android
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── MapView.tsx   # MapLibre GL + Layer Opacity 0-100%
│   │   │   │   ├── PTTButton.tsx # Push-To-Talk Walkie-Talkie
│   │   │   │   └── SOSButton.tsx # Critical Alert Trigger
│   │   │   ├── services/
│   │   │   │   ├── LocationService.ts # Background GPS (2m Distance Filter)
│   │   │   │   └── OfflineStorage.ts  # SQLite Local Sync
│   │   │   └── screens/
│   │   │       ├── QuickJoinScreen.tsx # 6-Char Code + Phone + PIN
│   │   │       ├── OfflineMapsScreen.tsx
│   │   │       └── MissionScreen.tsx
│   │   └── app.json
│   │
│   └── web-cockpit/              # React + Vite + Tailwind CSS
│       ├── src/
│       │   ├── components/
│       │   │   ├── MapInteractive.tsx # MapLibre GL JS + Color Tracks
│       │   │   ├── JoystickCockpit.tsx # WASD Keyboard Controls
│       │   │   ├── FloatingVideoWindow.tsx # Draggable Stream Windows
│       │   │   └── ReplayPlayer.tsx    # Multi-Entity Timeline Replay
│       │   ├── pages/
│       │   │   ├── B2BAdminConsole.tsx # Stripe & DJI Keys Management
│       │   │   ├── MissionDashboard.tsx
│       │   │   └── AuditReportPDF.tsx  # PDF Export
│       │   └── hooks/
│       │       └── useDJIStream.ts
│
├── supabase/
│   ├── functions/
│   │   ├── dji-autonomous-dispatch/
│   │   ├── telemetry-watchdog/
│   │   ├── dji-verify-credentials/
│   │   ├── dji-lens-control/
│   │   └── generate-pdf-report/
│   └── migrations/
│       └── 20261016_init_schema.sql

apps/
├── mobile/
│   ├── src/
│   │   ├── i18n/                 # Fișiere de traducere i18next
│   │   │   ├── ro.json
│   │   │   ├── en.json
│   │   │   ├── es.json
│   │   │   ├── pt.json
│   │   │   └── fr.json
│
└── web-cockpit/
    ├── src/
    │   ├── locales/              # Fișiere de traducere Web
    │   │   ├── ro.json
    │   │   ├── en.json
    │   │   ├── es.json
    │   │   ├── pt.json
    │   │   └── fr.json