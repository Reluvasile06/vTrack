import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";

export const supabaseConfigured = Boolean(url && anon);

export const supabaseConfigError = supabaseConfigured
  ? null
  : "Lipsesc VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copiază `.env.example` în `apps/web-cockpit/.env` și completează valorile din Supabase → Project Settings → API. Missing env — copy `.env.example` and set the anon URL/key.";

/** Placeholder client when env is missing — never call it; gate UI with supabaseConfigured. */
export const supabase: SupabaseClient = createClient(
  url || "https://placeholder.supabase.co",
  anon || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder",
);
