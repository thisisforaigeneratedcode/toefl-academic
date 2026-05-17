import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pretiumDisburseFee } from "../_shared/pretium.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRETIUM_API_URL = "https://api.xwift.africa";
const PRETIUM_API_KEY = Deno.env.get("PRETIUM_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PRETIUM_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return "0" + digits.slice(3);
  if (!digits.startsWith("0") && digits.length === 9) return "0" + digits;
  if (digits.startsWith("0") && digits.length === 10) return digits;
  return null;
}

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

  // Admin role check
  const { data: roleRow } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return json({ error: "Admin only" }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body */ }

  const action = (body.action as string) ?? "withdraw";

  if (action !== "withdraw") return json({ error: "Unknown action" }, 400);

  const amount = body.amount as number;
  const rawPhone = body.phone as string;

  if (!amount || amount <= 0) return json({ error: "Invalid amount" }, 400);
  if (!rawPhone) return json({ error: "Phone required" }, 400);

  const shortcode = normalizePhone(rawPhone);
  if (!shortcode) return json({ error: "Invalid phone number. Use format 07XXXXXXXX." }, 400);

  const pretium_flat = pretiumDisburseFee(amount);
  const disburse_amount = amount - pretium_flat;

  if (disburse_amount < 1) return json({ error: "Amount too small after Pretium fee" }, 400);

  const withdrawal_reference = crypto.randomUUID();

  const { error: insertErr } = await db.from("apicosts").insert({
    type: "withdrawal",
    booking_id: null,
    payment_id: withdrawal_reference,
    transaction_amount_kes: amount,
    pretium_fee_kes: pretium_flat,
    api_earnings_kes: 0,
    combined_fee_kes: pretium_flat,
    user_id: user.id,
  });
  if (insertErr) return json({ error: "Failed to record withdrawal" }, 500);

  let pretiumRes: Response;
  try {
    pretiumRes = await fetch(`${PRETIUM_API_URL}/kes/disburse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": PRETIUM_API_KEY },
      body: JSON.stringify({
        amount: disburse_amount,
        shortcode,
        mobile_network: "Safaricom",
        type: "MOBILE",
        reference: withdrawal_reference,
        callback_url: `${SUPABASE_URL}/functions/v1/pretium-webhook?token=${WEBHOOK_SECRET}`,
        description: "TOEFL Academic exam revenue withdrawal",
      }),
    });
  } catch {
    await db.from("apicosts").delete().eq("payment_id", withdrawal_reference);
    return json({ error: "Payment provider unavailable. Please try again." }, 503);
  }

  if (!pretiumRes.ok) {
    await db.from("apicosts").delete().eq("payment_id", withdrawal_reference);
    return json({ error: "Withdrawal failed. Please try again." }, 502);
  }

  return json({
    message: "Withdrawal initiated. Funds will arrive on M-Pesa shortly.",
    withdrew_kes: amount,
    pretium_fee_kes: pretium_flat,
    you_receive_kes: disburse_amount,
  });
});
