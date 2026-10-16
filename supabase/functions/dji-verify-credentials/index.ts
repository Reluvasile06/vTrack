import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const DJI_API_BASE = Deno.env.get("DJI_API_BASE") ?? "https://es-flight-api-us.djigate.com";

type VerifyBody = {
  organization_id: string;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "missing_authorization" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceKey);

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: VerifyBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.organization_id) {
    return json({ error: "organization_id_required" }, 400);
  }

  const { data: membership } = await admin
    .from("organization_members")
    .select("roles")
    .eq("organization_id", body.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership?.roles?.includes("b2b_admin")) {
    return json({ error: "forbidden_b2b_admin_required" }, 403);
  }

  const { data: creds } = await admin
    .from("organization_dji_credentials")
    .select("vault_user_token_id, vault_project_uuid_id")
    .eq("organization_id", body.organization_id)
    .maybeSingle();

  if (!creds?.vault_user_token_id || !creds?.vault_project_uuid_id) {
    return json({ error: "dji_credentials_not_configured" }, 404);
  }

  const { data: secrets, error: vaultError } = await admin.rpc("read_dji_vault_secrets", {
    p_user_token_id: creds.vault_user_token_id,
    p_project_uuid_id: creds.vault_project_uuid_id,
  });

  // Fallback: query vault.decrypted_secrets via SQL if RPC missing
  let userToken: string | undefined;
  let projectUuid: string | undefined;

  if (!vaultError && secrets) {
    userToken = secrets.user_token;
    projectUuid = secrets.project_uuid;
  } else {
    const { data: rows, error } = await admin
      .schema("vault")
      .from("decrypted_secrets")
      .select("id, decrypted_secret")
      .in("id", [creds.vault_user_token_id, creds.vault_project_uuid_id]);

    if (error || !rows?.length) {
      return json({ error: "vault_read_failed", detail: error?.message ?? vaultError?.message }, 500);
    }
    userToken = rows.find((r) => r.id === creds.vault_user_token_id)?.decrypted_secret;
    projectUuid = rows.find((r) => r.id === creds.vault_project_uuid_id)?.decrypted_secret;
  }

  if (!userToken || !projectUuid) {
    return json({ error: "vault_secrets_incomplete" }, 500);
  }

  try {
    const djiRes = await fetch(`${DJI_API_BASE}/openapi/v0.1/device`, {
      method: "GET",
      headers: {
        "X-User-Token": userToken,
        "X-Project-Uuid": projectUuid,
        Accept: "application/json",
      },
    });

    const payload = await djiRes.json().catch(() => ({}));
    const devices = Array.isArray(payload?.data) ? payload.data : payload?.data?.list ?? [];
    const deviceCount = Array.isArray(devices) ? devices.length : 0;
    const docks = Array.isArray(devices)
      ? devices.filter((d: { device_model_key?: string; domain?: number }) =>
          String(d.device_model_key ?? "").toLowerCase().includes("dock") || d.domain === 3
        )
      : [];

    const status = djiRes.ok ? "ok" : "error";
    const detail = {
      http_status: djiRes.status,
      device_count: deviceCount,
      dock_count: docks.length,
      devices: Array.isArray(devices)
        ? devices.map((d: Record<string, unknown>) => ({
            sn: d.device_sn ?? d.sn,
            model: d.device_model_key ?? d.model,
            online: d.device_online_status ?? d.online_status,
          }))
        : [],
      raw_code: payload?.code,
      raw_message: payload?.message,
    };

    await admin.from("organization_dji_credentials").upsert({
      organization_id: body.organization_id,
      vault_user_token_id: creds.vault_user_token_id,
      vault_project_uuid_id: creds.vault_project_uuid_id,
      last_verified_at: new Date().toISOString(),
      last_verify_status: status,
      last_verify_detail: detail,
    });

    if (!djiRes.ok) {
      return json({ ok: false, error: "dji_api_error", ...detail }, 502);
    }

    return json({ ok: true, ...detail });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("organization_dji_credentials").upsert({
      organization_id: body.organization_id,
      vault_user_token_id: creds.vault_user_token_id,
      vault_project_uuid_id: creds.vault_project_uuid_id,
      last_verified_at: new Date().toISOString(),
      last_verify_status: "error",
      last_verify_detail: { message },
    });
    return json({ ok: false, error: "dji_request_failed", message }, 502);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
