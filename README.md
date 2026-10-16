# vTrack

Enterprise mission tracking monorepo (React Native Expo + Web Cockpit + Supabase).

- **Repo:** https://github.com/Reluvasile06/vTrack
- **Supabase:** project `vtrack` (`lfcrnyxirilqbguebehi`, eu-west-1)
- **Specs:** [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md), [ROADMAP.md](./ROADMAP.md)
- **Secrets setup:** [docs/SECRETS_AND_AUTH.md](./docs/SECRETS_AND_AUTH.md)

## Layout

```
apps/mobile/          # Expo React Native
apps/web-cockpit/     # Vite + React + Tailwind (B2B Admin + Cockpit)
supabase/migrations/  # SQL schema
supabase/functions/   # Edge Functions
```

## Stage 1 (current)

Database schema, Auth/phone uniqueness, **Application Admin** email login (`/app-admin`), B2B Admin Console (DJI Vault + Stripe quotas scaffolding), i18n (ro/en/es/pt/fr).

Do not start later ROADMAP stages until Checkpoint 1 is validated.

### Application Admin (local Checkpoint 1)

1. Copy `.env.example` → `apps/web-cockpit/.env` and set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (never commit `.env`).
2. `cd apps/web-cockpit && npm install && npm run dev`
3. Open `/app-admin/login` and sign in with the Stage 1 test Application Admin:
   - email: `reluvasile06@gmail.com`
   - password: `Test1234=`
4. Create an organization, configure Twilio/Stripe fields in `app_settings`, then open `/admin` for the B2B console.

Phone SMS OTP (Twilio) remains the path for field users; Application Admin uses email/password.
