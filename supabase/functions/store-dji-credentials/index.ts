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

  const { data: created, error: sqlErr } = await admin.rpc("store_org_dji_vault_secrets", {
    p_organization_id: body.organization_id,
    p_user_token: body.dji_user_token,
    p_project_uuid: body.dji_project_uuid,
  });

  if (sqlErr || !created) {
    return json(
      {
        error: "vault_store_failed",
        detail: sqlErr?.message,
        hint: "Ensure vault_dji_helpers migration is applied.",
      },
      500,
    );
  }

  return json({
    ok: true,
    organization_id: body.organization_id,
    vault_user_token_id: created.vault_user_token_id,
    vault_project_uuid_id: created.vault_project_uuid_id,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
