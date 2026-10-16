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

Database schema, Auth/phone uniqueness, B2B Admin Console (DJI Vault + Stripe quotas scaffolding), i18n (ro/en/es/pt/fr).

Do not start later ROADMAP stages until Checkpoint 1 is validated.
