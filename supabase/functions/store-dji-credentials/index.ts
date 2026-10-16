import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type StoreBody = {
  organization_id: string;
  dji_user_token: string;
  dji_project_uuid: string;
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

  let body: StoreBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.organization_id || !body.dji_user_token || !body.dji_project_uuid) {
    return json({ error: "organization_id_and_dji_keys_required" }, 400);
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

  const tokenName = `dji_user_token_${body.organization_id}`;
  const projectName = `dji_project_uuid_${body.organization_id}`;

  // vault.create_secret(secret, name, description) returns uuid
  const { data: tokenId, error: tokenErr } = await admin.rpc("vault_create_secret", {
    new_secret: body.dji_user_token,
    new_name: tokenName,
    new_description: `DJI X-User-Token for org ${body.organization_id}`,
  });

  const { data: projectId, error: projectErr } = await admin.rpc("vault_create_secret", {
    new_secret: body.dji_project_uuid,
    new_name: projectName,
    new_description: `DJI X-Project-Uuid for org ${body.organization_id}`,
  });

  // Prefer direct SQL via execute if wrapper RPCs are unavailable
  let vaultUserTokenId = tokenId as string | null;
  let vaultProjectUuidId = projectId as string | null;

  if (tokenErr || projectErr || !vaultUserTokenId || !vaultProjectUuidId) {
    const { data: created, error: sqlErr } = await admin.rpc("store_org_dji_vault_secrets", {
      p_organization_id: body.organization_id,
      p_user_token: body.dji_user_token,
      p_project_uuid: body.dji_project_uuid,
    });

    if (sqlErr || !created) {
      return json(
        {
          error: "vault_store_failed",
          detail: sqlErr?.message ?? tokenErr?.message ?? projectErr?.message,
          hint: "Apply vault helper functions from migration extras or configure service role SQL.",
        },
        500,
      );
    }
    vaultUserTokenId = created.vault_user_token_id;
    vaultProjectUuidId = created.vault_project_uuid_id;
  }

  const { error: upsertErr } = await admin.from("organization_dji_credentials").upsert({
    organization_id: body.organization_id,
    vault_user_token_id: vaultUserTokenId,
    vault_project_uuid_id: vaultProjectUuidId,
    last_verify_status: "stored",
    updated_at: new Date().toISOString(),
  });

  if (upsertErr) {
    return json({ error: "credential_row_upsert_failed", detail: upsertErr.message }, 500);
  }

  return json({
    ok: true,
    organization_id: body.organization_id,
    vault_user_token_id: vaultUserTokenId,
    vault_project_uuid_id: vaultProjectUuidId,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
