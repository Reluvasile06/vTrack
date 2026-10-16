import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";

type Org = { id: string; name: string; subscription_plan: string; max_users: number; max_drones: number; max_vehicles: number };
type Member = { id: string; user_id: string; roles: string[] };
type Usage = {
  users_count: number;
  max_users: number;
  max_drones: number;
  max_vehicles: number;
  subscription_plan: string;
  subscription_status: string | null;
};

const ROLE_OPTIONS = ["b2b_admin", "dispatcher", "field_operator"] as const;

export default function B2BAdminConsole() {
  const { t } = useTranslation();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [token, setToken] = useState("");
  const [projectUuid, setProjectUuid] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyDetail, setVerifyDetail] = useState<unknown>(null);

  const loadOrgs = useCallback(async () => {
    const { data, error } = await supabase.from("organizations").select("id,name,subscription_plan,max_users,max_drones,max_vehicles");
    if (error) {
      setMessage(error.message);
      return;
    }
    setOrgs(data ?? []);
    if (!orgId && data?.[0]?.id) setOrgId(data[0].id);
  }, [orgId]);

  const loadOrgDetails = useCallback(async (id: string) => {
    if (!id) return;
    const [{ data: mem }, { data: usageRows }] = await Promise.all([
      supabase.from("organization_members").select("id,user_id,roles").eq("organization_id", id),
      supabase.rpc("get_organization_usage", { org_id: id }),
    ]);
    setMembers(mem ?? []);
    setUsage(Array.isArray(usageRows) ? usageRows[0] ?? null : (usageRows as Usage | null));
  }, []);

  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    void loadOrgDetails(orgId);
  }, [orgId, loadOrgDetails]);

  async function invoke(name: string, body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw error;
    return data;
  }

  async function onSaveDji(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const data = await invoke("store-dji-credentials", {
        organization_id: orgId,
        dji_user_token: token,
        dji_project_uuid: projectUuid,
      });
      setMessage(`DJI keys stored (${JSON.stringify(data)})`);
      setToken("");
      setProjectUuid("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyDji() {
    setBusy(true);
    setMessage(null);
    try {
      const data = await invoke("dji-verify-credentials", { organization_id: orgId });
      setVerifyDetail(data);
      setMessage(data?.ok ? "DJI verification OK" : "DJI verification failed");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSyncStripe() {
    setBusy(true);
    setMessage(null);
    try {
      const data = await invoke("stripe-sync-quotas", { organization_id: orgId });
      setMessage(`Stripe sync: ${JSON.stringify(data)}`);
      await loadOrgDetails(orgId);
      await loadOrgs();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleRole(member: Member, role: string) {
    const next = member.roles.includes(role)
      ? member.roles.filter((r) => r !== role)
      : [...member.roles, role];
    if (next.length === 0) {
      setMessage("At least one role required");
      return;
    }
    const { error } = await supabase
      .from("organization_members")
      .update({ roles: next })
      .eq("id", member.id);
    if (error) setMessage(error.message);
    else await loadOrgDetails(orgId);
  }

  const selected = orgs.find((o) => o.id === orgId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t("admin.title")}</h1>
        <p className="mt-1 text-sm text-slate-400">
          Vault-backed DJI credentials, Stripe quota sync, composite org roles.
        </p>
      </div>

      <label className="block max-w-md space-y-1 text-sm">
        <span className="text-slate-400">{t("admin.organization")}</span>
        <select
          className="w-full rounded-md border border-[#2A364F] bg-[#151C28] px-3 py-2"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
        >
          {orgs.length === 0 && <option value="">No organizations yet</option>}
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.subscription_plan})
            </option>
          ))}
        </select>
      </label>

      {selected && (
        <section className="rounded-lg border border-[#2A364F] bg-[#151C28]/80 p-4">
          <h2 className="mb-3 text-lg font-medium">{t("admin.quotas")}</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div>
              <dt className="text-slate-500">{t("admin.plan")}</dt>
              <dd>{usage?.subscription_plan ?? selected.subscription_plan}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("admin.users")}</dt>
              <dd>
                {usage?.users_count ?? "—"} / {usage?.max_users ?? selected.max_users}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("admin.drones")}</dt>
              <dd>{usage?.max_drones ?? selected.max_drones}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("admin.vehicles")}</dt>
              <dd>{usage?.max_vehicles ?? selected.max_vehicles}</dd>
            </div>
          </dl>
          <button
            type="button"
            disabled={!orgId || busy}
            onClick={() => void onSyncStripe()}
            className="mt-4 rounded-md border border-[#2A364F] px-3 py-2 text-sm hover:bg-[#1e293b] disabled:opacity-50"
          >
            {t("admin.syncStripe")}
          </button>
        </section>
      )}

      <form onSubmit={onSaveDji} className="space-y-3 rounded-lg border border-[#2A364F] bg-[#151C28]/80 p-4">
        <h2 className="text-lg font-medium">DJI OpenAPI</h2>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-400">{t("admin.token")}</span>
          <input
            className="w-full rounded-md border border-[#2A364F] bg-[#0B0F17] px-3 py-2 font-mono text-sm"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-400">{t("admin.projectUuid")}</span>
          <input
            className="w-full rounded-md border border-[#2A364F] bg-[#0B0F17] px-3 py-2 font-mono text-sm"
            value={projectUuid}
            onChange={(e) => setProjectUuid(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!orgId || busy}
            className="rounded-md bg-[#3B82F6] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("admin.saveDji")}
          </button>
          <button
            type="button"
            disabled={!orgId || busy}
            onClick={() => void onVerifyDji()}
            className="rounded-md border border-[#2A364F] px-3 py-2 text-sm hover:bg-[#1e293b] disabled:opacity-50"
          >
            {t("admin.verifyDji")}
          </button>
        </div>
        {verifyDetail != null && (
          <pre className="overflow-auto rounded bg-[#0B0F17] p-3 text-xs text-slate-300">
            {JSON.stringify(verifyDetail, null, 2)}
          </pre>
        )}
      </form>

      <section className="rounded-lg border border-[#2A364F] bg-[#151C28]/80 p-4">
        <h2 className="mb-3 text-lg font-medium">{t("admin.roles")}</h2>
        {members.length === 0 ? (
          <p className="text-sm text-slate-500">No members for this organization.</p>
        ) : (
          <ul className="space-y-3">
            {members.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 border-b border-[#2A364F] pb-3 text-sm last:border-0 md:flex-row md:items-center md:justify-between">
                <code className="text-slate-300">{m.user_id}</code>
                <div className="flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => void toggleRole(m, role)}
                      className={`rounded px-2 py-1 text-xs ${
                        m.roles.includes(role)
                          ? "bg-[#3B82F6] text-white"
                          : "border border-[#2A364F] text-slate-400"
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message && (
        <p className="rounded-md border border-[#2A364F] bg-[#0B0F17] px-3 py-2 text-sm text-slate-300">
          {t("admin.status")}: {message}
        </p>
      )}
    </div>
  );
}
