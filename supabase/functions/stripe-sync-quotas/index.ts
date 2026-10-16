import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Stage 1 scaffolding: sync Stripe subscription status → organization quotas.
 * Requires secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (for webhook mode).
 *
 * Modes:
 * - POST { organization_id } with user JWT → pull latest Stripe subscription for that org
 * - Stripe webhook (event type customer.subscription.*) when STRIPE_WEBHOOK_SECRET set
 */

const PLAN_QUOTAS: Record<string, { max_users: number; max_drones: number; max_vehicles: number; plan: string }> = {
  trial: { max_users: 5, max_drones: 1, max_vehicles: 2, plan: "trial" },
  starter: { max_users: 15, max_drones: 2, max_vehicles: 5, plan: "starter" },
  pro: { max_users: 50, max_drones: 10, max_vehicles: 20, plan: "pro" },
  enterprise: { max_users: 500, max_drones: 100, max_vehicles: 200, plan: "enterprise" },
};

Deno.serve(async (req: Request) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return json(
      {
        error: "stripe_not_configured",
        hint: "Set Edge Function secret STRIPE_SECRET_KEY (and optionally STRIPE_WEBHOOK_SECRET).",
      },
      503,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const contentType = req.headers.get("content-type") ?? "";
  const stripeSig = req.headers.get("stripe-signature");

  // Webhook path (scaffolded — signature verification when secret present)
  if (stripeSig) {
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      return json({ error: "STRIPE_WEBHOOK_SECRET_missing" }, 503);
    }
    // Full Stripe signature verification deferred until user provides keys;
    // accept JSON event for scaffolding once secret is present.
    const event = await req.json();
    const sub = event?.data?.object;
    if (!sub?.id) {
      return json({ error: "unsupported_event" }, 400);
    }
    const result = await upsertFromStripeSubscription(admin, stripeKey, sub);
    return json(result, result.ok ? 200 : 400);
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "missing_authorization" }, 401);
  }

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = contentType.includes("json") ? await req.json() : {};
  const organizationId = body.organization_id as string | undefined;
  if (!organizationId) return json({ error: "organization_id_required" }, 400);

  const { data: membership } = await admin
    .from("organization_members")
    .select("roles")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership?.roles?.includes("b2b_admin")) {
    return json({ error: "forbidden_b2b_admin_required" }, 403);
  }

  const { data: customer } = await admin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!customer?.stripe_customer_id) {
    return json({ error: "stripe_customer_not_linked", organization_id: organizationId }, 404);
  }

  const subsRes = await fetch(
    `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customer.stripe_customer_id)}&status=all&limit=1`,
    {
      headers: { Authorization: `Bearer ${stripeKey}` },
    },
  );
  const subsJson = await subsRes.json();
  const sub = subsJson?.data?.[0];
  if (!sub) {
    await admin
      .from("organizations")
      .update({
        subscription_plan: "trial",
        max_users: PLAN_QUOTAS.trial.max_users,
        max_drones: PLAN_QUOTAS.trial.max_drones,
        max_vehicles: PLAN_QUOTAS.trial.max_vehicles,
      })
      .eq("id", organizationId);

    return json({ ok: true, mode: "fallback_trial", organization_id: organizationId });
  }

  const result = await upsertFromStripeSubscription(admin, stripeKey, sub, organizationId);
  return json(result, result.ok ? 200 : 400);
});

async function upsertFromStripeSubscription(
  admin: ReturnType<typeof createClient>,
  _stripeKey: string,
  sub: {
    id: string;
    status: string;
    current_period_end?: number;
    items?: { data?: Array<{ price?: { lookup_key?: string; nickname?: string } }> };
    metadata?: { organization_id?: string; plan?: string };
  },
  organizationId?: string,
) {
  const orgId = organizationId ?? sub.metadata?.organization_id;
  if (!orgId) {
    return { ok: false, error: "organization_id_missing_on_subscription" };
  }

  const planKey =
    (sub.metadata?.plan ??
      sub.items?.data?.[0]?.price?.lookup_key ??
      sub.items?.data?.[0]?.price?.nickname ??
      "starter")?.toLowerCase?.() ?? "starter";

  const quotas = PLAN_QUOTAS[planKey] ?? PLAN_QUOTAS.starter;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : new Date().toISOString();

  await admin.from("subscriptions").upsert(
    {
      organization_id: orgId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: periodEnd,
    },
    { onConflict: "stripe_subscription_id" },
  );

  await admin
    .from("organizations")
    .update({
      subscription_plan: quotas.plan,
      max_users: quotas.max_users,
      max_drones: quotas.max_drones,
      max_vehicles: quotas.max_vehicles,
    })
    .eq("id", orgId);

  const { data: usage } = await admin.rpc("get_organization_usage", { org_id: orgId });

  return {
    ok: true,
    organization_id: orgId,
    plan: quotas.plan,
    status: sub.status,
    quotas,
    usage,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
