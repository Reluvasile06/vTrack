import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, type AppLang } from "../i18n";
import { supabase } from "../lib/supabase";

export default function ProfileSettings() {
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<AppLang>((i18n.resolvedLanguage as AppLang) || "ro");
  const [message, setMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      const metaLang = data.user?.user_metadata?.preferred_language as AppLang | undefined;
      if (metaLang && SUPPORTED_LANGS.includes(metaLang)) setLang(metaLang);
    });
  }, []);

  async function saveLanguage() {
    setMessage(null);
    await i18n.changeLanguage(lang);
    if (!userId) {
      setMessage("Language applied locally (sign in to persist on profile).");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ preferred_language: lang })
      .eq("id", userId);
    if (error) setMessage(error.message);
    else setMessage("preferred_language saved on profile");
  }

  return (
    <section className="max-w-md space-y-4">
      <h1 className="text-2xl font-semibold text-white">{t("app.profile")}</h1>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-400">{t("profile.language")}</span>
        <select
          className="w-full rounded-md border border-[#2A364F] bg-[#151C28] px-3 py-2"
          value={lang}
          onChange={(e) => setLang(e.target.value as AppLang)}
        >
          {SUPPORTED_LANGS.map((code) => (
            <option key={code} value={code}>
              {code.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => void saveLanguage()}
        className="rounded-md bg-[#3B82F6] px-3 py-2 text-sm font-medium text-white"
      >
        {t("profile.saveLanguage")}
      </button>
      {message && <p className="text-sm text-slate-400">{message}</p>}
    </section>
  );
}
