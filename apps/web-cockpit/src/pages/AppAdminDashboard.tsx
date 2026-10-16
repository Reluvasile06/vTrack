import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { supabase, supabaseConfigured } from "../lib/supabase";

const ORG_TYPES = [
  "b2b_corporate",
  "law_enforcement",
  "hunting_assoc",
  "b2c_individual",
] as const;

type OrgType = (typeof ORG_TYPES)[number];

type Org = {
  id: string;
  name: string;
  type: string;
  subscription_plan: string;
  created_at: string | null;
};

const TWILIO_KEYS = [
  "twilio_account_sid",
  "twilio_auth_token",
  "twilio_messaging_service_sid",
] as const;

const STRIPE_KEYS = [
  "stripe_publishable_key",
  "stripe_secret_key",
  "stripe_webhook_secret",
] as const;

type SettingKey = (typeof TWILIO_KEYS)[number] | (typeof STRIPE_KEYS)[number];

export default function AppAdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("b2b_corporate");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadOrgs = useCallback(async () => {
    const { data, error } = await supabase
      .from("organizations")
      .select("id,name,type,subscription_plan,created_at")
      .order("created_at", { ascending: false });
    if (error) {
      setMessage(error.message);
      return;
    }
    setOrgs(data ?? []);
  }, []);

  const loadSettings = useCallback(async () => {
    const keys = [...TWILIO_KEYS, ...STRIPE_KEYS];
    const { data, error } = await supabase.from("app_settings").select("key,value").in("key", keys);
    if (error) {
      setMessage(error.message);
      return;
    }
    const next: Record<string, string> = {};
    for (const row of data ?? []) next[row.key] = row.value ?? "";
    for (const k of keys) if (next[k] === undefined) next[k] = "";
    setSettings(next);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        if (!cancelled) navigate("/app-admin/login", { replace: true });
        return;
      }
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("is_app_admin,email")
        .eq("id", user.id)
        .maybeSingle();
      if (error || !profile?.is_app_admin) {
        await supabase.auth.signOut();
        if (!cancelled) navigate("/app-admin/login", { replace: true });
        return;
      }
      if (cancelled) return;
      setUserId(user.id);
      setEmail(profile.email ?? user.email ?? null);
      setChecking(false);
      await Promise.all([loadOrgs(), loadSettings()]);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, loadOrgs, loadSettings]);

  async function onSignOut() {
    await supabase.auth.signOut();
    navigate("/app-admin/login", { replace: true });
  }

  async function onCreateOrg(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setBusy(true);
    setMessage(null);
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: orgName.trim(), type: orgType })
      .select("id,name,type,subscription_plan,created_at")
      .single();
    if (orgError || !org) {
      setMessage(orgError?.message ?? "Create failed");
      setBusy(false);
      return;
    }
    const { error: memError } = await supabase.from("organization_members").insert({
      organization_id: org.id,
      user_id: userId,
      roles: ["b2b_admin"],
    });
    if (memError) {
      setMessage(memError.message);
      setBusy(false);
      return;
    }
    setOrgName("");
    setMessage(t("appAdmin.orgCreated"));
    await loadOrgs();
    setBusy(false);
  }

  async function saveSettingGroup(keys: readonly SettingKey[]) {
    if (!userId) return;
    setBusy(true);
    setMessage(null);
    const rows = keys.map((key) => ({
      key,
      value: settings[key] ?? "",
      updated_by: userId,
    }));
    const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
    setMessage(error ? error.message : t("appAdmin.settingsSaved"));
    setBusy(false);
  }

  if (checking) {
    return <p className="text-sm text-slate-400">{t("appAdmin.loading")}</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t("appAdmin.title")}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {t("appAdmin.signedInAs")}: {email ?? userId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin"
            className="rounded-md border border-[#2A364F] px-3 py-2 text-sm hover:bg-[#1e293b]"
          >
            {t("appAdmin.openB2b")}
          </Link>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="rounded-md border border-[#2A364F] px-3 py-2 text-sm hover:bg-[#1e293b]"
          >
            {t("appAdmin.signOut")}
          </button>
        </div>
      </div>

      <form
        onSubmit={onCreateOrg}
        className="space-y-3 rounded-lg border border-[#2A364F] bg-[#151C28]/80 p-4"
      >
        <h2 className="text-lg font-medium">{t("appAdmin.createOrg")}</h2>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-400">{t("appAdmin.orgName")}</span>
          <input
            required
            className="w-full rounded-md border border-[#2A364F] bg-[#0B0F17] px-3 py-2"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-400">{t("appAdmin.orgType")}</span>
          <select
            className="w-full rounded-md border border-[#2A364F] bg-[#0B0F17] px-3 py-2"
            value={orgType}
            onChange={(e) => setOrgType(e.target.value as OrgType)}
          >
            {ORG_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`appAdmin.orgTypes.${type}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[#3B82F6] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("appAdmin.createOrgSubmit")}
        </button>
      </form>

      <section className="rounded-lg border border-[#2A364F] bg-[#151C28]/80 p-4">
        <h2 className="mb-3 text-lg font-medium">{t("appAdmin.orgList")}</h2>
        {orgs.length === 0 ? (
          <p className="text-sm text-slate-500">{t("appAdmin.noOrgs")}</p>
        ) : (
          <ul className="divide-y divide-[#2A364F] text-sm">
            {orgs.map((org) => (
              <li key={org.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <div className="font-medium text-white">{org.name}</div>
                  <div className="text-slate-500">
                    {ORG_TYPES.includes(org.type as OrgType)
                      ? t(`appAdmin.orgTypes.${org.type as OrgType}`)
                      : org.type}{" "}
                    · {org.subscription_plan}
                  </div>
                </div>
                <code className="text-xs text-slate-400">{org.id}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-[#2A364F] bg-[#151C28]/80 p-4">
        <h2 className="text-lg font-medium">{t("appAdmin.twilioTitle")}</h2>
        <p className="text-sm text-slate-500">{t("appAdmin.credentialsHint")}</p>
        {TWILIO_KEYS.map((key) => (
          <label key={key} className="block space-y-1 text-sm">
            <span className="text-slate-400">{t(`appAdmin.settings.${key}`)}</span>
            <input
              type={key.includes("token") || key.includes("secret") ? "password" : "text"}
              autoComplete="off"
              className="w-full rounded-md border border-[#2A364F] bg-[#0B0F17] px-3 py-2 font-mono text-sm"
              value={settings[key] ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
            />
          </label>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveSettingGroup(TWILIO_KEYS)}
          className="rounded-md bg-[#3B82F6] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("appAdmin.saveTwilio")}
        </button>
      </section>

      <section className="space-y-3 rounded-lg border border-[#2A364F] bg-[#151C28]/80 p-4">
        <h2 className="text-lg font-medium">{t("appAdmin.stripeTitle")}</h2>
        <p className="text-sm text-slate-500">{t("appAdmin.credentialsHint")}</p>
        {STRIPE_KEYS.map((key) => (
          <label key={key} className="block space-y-1 text-sm">
            <span className="text-slate-400">{t(`appAdmin.settings.${key}`)}</span>
            <input
              type={key.includes("secret") || key.includes("webhook") ? "password" : "text"}
              autoComplete="off"
              className="w-full rounded-md border border-[#2A364F] bg-[#0B0F17] px-3 py-2 font-mono text-sm"
              value={settings[key] ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
            />
          </label>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveSettingGroup(STRIPE_KEYS)}
          className="rounded-md bg-[#3B82F6] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("appAdmin.saveStripe")}
        </button>
      </section>

      {message && (
        <p className="rounded-md border border-[#2A364F] bg-[#0B0F17] px-3 py-2 text-sm text-slate-300">
          {message}
        </p>
      )}
    </div>
  );
}
