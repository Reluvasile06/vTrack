# Secrets & Auth — Stage 1

Supabase project: **vtrack** · ref `lfcrnyxirilqbguebehi` · https://lfcrnyxirilqbguebehi.supabase.co

## 1. Twilio SMS OTP (required for Checkpoint 1 account creation)

Configure in Supabase Dashboard → Authentication → Providers → Phone:

| Setting | Value |
|---------|--------|
| Enable Phone provider | ON |
| SMS provider | Twilio |
| Twilio Account SID | from Twilio Console |
| Twilio Auth Token | from Twilio Console |
| Twilio Message Service SID (or From number) | Messaging Service SID preferred |

Optional env (if using custom OTP hook later):

```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_MESSAGE_SERVICE_SID
```

Phone uniqueness is enforced by `profiles.phone_number UNIQUE` + trigger `enforce_phone_uniqueness`.

## 2. Stripe (B2B quotas sync)

Set as Edge Function secrets on project `vtrack`:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_... --project-ref lfcrnyxirilqbguebehi
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... --project-ref lfcrnyxirilqbguebehi
```

Point Stripe webhook to:
`https://lfcrnyxirilqbguebehi.supabase.co/functions/v1/stripe-sync-quotas`

## 3. DJI FlightHub 2 OpenAPI

Per-organization keys are stored in **Supabase Vault** via Edge Function `store-dji-credentials` (not in client env).

Optional:

```bash
supabase secrets set DJI_API_BASE=https://es-flight-api-us.djigate.com --project-ref lfcrnyxirilqbguebehi
```

B2B admins paste `X-User-Token` + `X-Project-Uuid` in Web → B2B Admin Console → Verify calls `dji-verify-credentials`.

## 4. Client env

Copy `.env.example` → `apps/web-cockpit/.env` and `apps/mobile/.env` with anon key from Supabase → Project Settings → API.
