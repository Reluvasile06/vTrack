import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export default function HomePage() {
  const { t } = useTranslation();
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold text-white">{t("app.name")}</h1>
      <p className="max-w-xl text-slate-400">
        Stage 1 foundation — identity, multi-tenancy, Application Admin, B2B Admin, i18n.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/app-admin"
          className="inline-flex rounded-md bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          {t("app.appAdmin")}
        </Link>
        <Link
          to="/admin"
          className="inline-flex rounded-md border border-[#2A364F] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e293b]"
        >
          {t("app.admin")}
        </Link>
      </div>
    </section>
  );
}
