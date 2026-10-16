import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import B2BAdminConsole from "./pages/B2BAdminConsole";
import ProfileSettings from "./pages/ProfileSettings";
import HomePage from "./pages/HomePage";
import AppAdminLogin from "./pages/AppAdminLogin";
import AppAdminDashboard from "./pages/AppAdminDashboard";
import { supabaseConfigError, supabaseConfigured } from "./lib/supabase";

export default function App() {
  const { t } = useTranslation();

  if (!supabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-lg space-y-3 rounded-lg border border-[#2A364F] bg-[#151C28] p-6">
          <h1 className="text-xl font-semibold text-white">{t("app.name")}</h1>
          <p className="text-sm text-slate-300">{supabaseConfigError}</p>
          <p className="text-xs text-slate-500">
            VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY → <code>apps/web-cockpit/.env</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#2A364F] bg-[#151C28]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-xl font-semibold tracking-wide text-white">
            {t("app.name")}
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm text-slate-300">
            <Link to="/" className="hover:text-white">
              {t("app.home")}
            </Link>
            <Link to="/app-admin" className="hover:text-white">
              {t("app.appAdmin")}
            </Link>
            <Link to="/admin" className="hover:text-white">
              {t("app.admin")}
            </Link>
            <Link to="/profile" className="hover:text-white">
              {t("app.profile")}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/app-admin/login" element={<AppAdminLogin />} />
          <Route path="/app-admin" element={<AppAdminDashboard />} />
          <Route path="/admin" element={<B2BAdminConsole />} />
          <Route path="/profile" element={<ProfileSettings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
