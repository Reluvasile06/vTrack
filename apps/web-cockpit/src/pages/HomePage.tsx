import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export default function HomePage() {
  const { t } = useTranslation();
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold text-white">{t("app.name")}</h1>
      <p className="max-w-xl text-slate-400">
        Stage 1 foundation — identity, multi-tenancy, B2B Admin, i18n. Open the admin console to
        manage DJI Vault keys and Stripe quotas.
      </p>
      <Link
        to="/admin"
        className="inline-flex rounded-md bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
      >
        {t("app.admin")}
      </Link>
    </section>
  );
}
