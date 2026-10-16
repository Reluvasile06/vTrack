import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { supabase, supabaseConfigured } from "../lib/supabase";

export default function AppAdminLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    void supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user?.id;
      if (!uid) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_app_admin")
        .eq("id", uid)
        .maybeSingle();
      if (profile?.is_app_admin) navigate("/app-admin", { replace: true });
    });
  }, [navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabaseConfigured) return;
    setBusy(true);
    setError(null);
    const { data, error: signError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signError) {
      setError(signError.message);
      setBusy(false);
      return;
    }
    const uid = data.user?.id;
    if (!uid) {
      setError(t("appAdmin.notAdmin"));
      setBusy(false);
      return;
    }
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_app_admin")
      .eq("id", uid)
      .maybeSingle();
    if (profileError) {
      setError(profileError.message);
      setBusy(false);
      return;
    }
    if (!profile?.is_app_admin) {
      await supabase.auth.signOut();
      setError(t("appAdmin.notAdmin"));
      setBusy(false);
      return;
    }
    navigate("/app-admin", { replace: true });
  }

  return (
    <section className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t("appAdmin.loginTitle")}</h1>
        <p className="mt-1 text-sm text-slate-400">{t("appAdmin.loginSubtitle")}</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-[#2A364F] bg-[#151C28]/80 p-4">
        <label className="block space-y-1 text-sm">
          <span className="text-slate-400">{t("appAdmin.email")}</span>
          <input
            type="email"
            required
            autoComplete="username"
            className="w-full rounded-md border border-[#2A364F] bg-[#0B0F17] px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-400">{t("appAdmin.password")}</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-[#2A364F] bg-[#0B0F17] px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !supabaseConfigured}
          className="w-full rounded-md bg-[#3B82F6] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? t("appAdmin.signingIn") : t("appAdmin.signIn")}
        </button>
        {error && <p className="text-sm text-[#F87171]">{error}</p>}
      </form>
      <Link to="/" className="text-sm text-slate-400 hover:text-white">
        ← {t("app.home")}
      </Link>
    </section>
  );
}
