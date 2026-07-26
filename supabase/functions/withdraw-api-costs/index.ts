import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pretiumDisburseFee } from "../_shared/pretium.ts";

// Settles accumulated API earnings to the appropriate phone number.
// target "owner"   → PLATFORM_FEE_PHONE  (60% share)
// target "partner" → PARTNER_FEE_PHONE   (40% share)
// Only the api_owner_user_id can call this for either target.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRETIUM_API_URL = "https://api.xwift.africa";
const PRETIUM_API_KEY = Deno.env.get("PRETIUM_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "No auth" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: ownerSetting } = await db
    .from("site_settings")
    .select("value")
    .eq("key", "api_owner_user_id")
    .maybeSingle();

  if (!ownerSetting || ownerSetting.value !== user.id) {
    return json({ error: "Access denied" }, 403);
  }

  try {
    const body = await req.json();
    const target: "owner" | "partner" = body.target === "partner" ? "partner" : "owner";

    const PHONE = target === "owner"
      ? Deno.env.get("PLATFORM_FEE_PHONE")
      : Deno.env.get("PARTNER_FEE_PHONE");

    if (!PHONE) {
      return json({ error: `${target === "owner" ? "PLATFORM_FEE_PHONE" : "PARTNER_FEE_PHONE"} secret not configured` }, 500);
    }

    const earningsCol = target === "owner" ? "owner_earnings_kes" : "partner_earnings_kes";
    const withdrawnCol = target === "owner" ? "owner_withdrawn" : "partner_withdrawn";

    const { data: depositRows } = await db
      .from("apicosts")
      .select(`id, ${earningsCol}`)
      .eq(withdrawnCol, false)
      .eq("type", "deposit");

    const { data: settlementRows } = await db
      .from("apicosts")
      .select(earningsCol)
      .eq("type", "settlement");

    const gross_kes   = (depositRows ?? []).reduce((sum: number, r: any) => sum + (r[earningsCol] as number ?? 0), 0);
    const settled_kes = (settlementRows ?? []).reduce((sum: number, r: any) => sum + (r[earningsCol] as number ?? 0), 0);
    const total_kes   = Math.max(0, gross_kes - settled_kes);

    if (total_kes <= 0) {
      return json({ error: "No balance to withdraw." }, 400);
    }

    const requestedAmount = (typeof body.amount === "number" && body.amount > 0)
      ? Math.min(body.amount as number, total_kes)
      : total_kes;

    const pretium_fee    = pretiumDisburseFee(requestedAmount);
    const disburse_amount = requestedAmount - pretium_fee;

    if (disburse_amount < 10) {
      return json({ error: "Amount too small (minimum KES 10 after Pretium fee)" }, 400);
    }

    const withdrawal_reference = `APE-${target[0].toUpperCase()}-${crypto.randomUUID().slice(0, 8)}`;

    let pretiumRes: Response;
    try {
      pretiumRes = await fetch(`${PRETIUM_API_URL}/kes/disburse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": PRETIUM_API_KEY },
        body: JSON.stringify({
          amount: disburse_amount,
          shortcode: PHONE,
          mobile_network: "Safaricom",
          type: "MOBILE",
          reference: withdrawal_reference,
          description: `${target === "owner" ? "Owner" : "Partner"} API earnings`,
        }),
      });
    } catch {
      return json({ error: "Payment provider unavailable. Please try again." }, 503);
    }

    if (!pretiumRes.ok) {
      return json({ error: "Withdrawal failed. Please try again." }, 502);
    }

    // Mark after Pretium confirms — full settlement marks rows, partial inserts a record
    if (requestedAmount >= total_kes) {
      const ids = (depositRows ?? []).map((r: any) => r.id as string);
      await db.from("apicosts").update({
        [withdrawnCol]: true,
        [`${target}_withdrawn_at`]: new Date().toISOString(),
        [`${target}_withdrawal_receipt`]: withdrawal_reference,
      }).in("id", ids);
    } else {
      await db.from("apicosts").insert({
        type: "settlement",
        payment_id: withdrawal_reference,
        transaction_amount_kes: requestedAmount,
        pretium_fee_kes: pretium_fee,
        combined_fee_kes: pretium_fee,
        api_earnings_kes: 0,
        [earningsCol]: requestedAmount,
        [withdrawnCol]: true,
        [`${target}_withdrawn_at`]: new Date().toISOString(),
        [`${target}_withdrawal_receipt`]: withdrawal_reference,
      });
    }

    return json({
      message: "Withdrawal initiated. Funds will arrive on M-Pesa shortly.",
      target,
      amount_kes: requestedAmount,
      pretium_fee_kes: pretium_fee,
      you_receive_kes: disburse_amount,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return json({ error: msg }, 500);
  }
});
