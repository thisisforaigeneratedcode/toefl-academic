// Admin "Collect payment" tool: pushes an M-Pesa STK prompt straight to any
// phone number, no booking or client account required. Ported from the
// lexinon project's equivalent admin feature.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return json({ error: "Admin only" }, 403);

  try {
    const body = await req.json();
    const rawPhone = body?.phone as string | undefined;
    const amount_kes = Math.round(Number(body?.amount_kes));
    const note = typeof body?.note === "string" ? body.note.slice(0, 80) : "";

    if (!rawPhone) return json({ error: "Phone number is required" }, 400);
    if (!Number.isFinite(amount_kes) || amount_kes <= 0) return json({ error: "Enter a valid amount" }, 400);

    const shortcode = normalizePhone(rawPhone);
    if (!shortcode) return json({ error: "Invalid phone number. Use format 07XXXXXXXX." }, 400);

    const reference = crypto.randomUUID();

    // Recorded before the prompt goes out so the webhook can always resolve
    // the callback back to a real amount and turn it into a ledger entry.
    const { error: dpErr } = await admin.from("direct_payments").insert({
      pretium_reference: reference,
      phone: shortcode,
      amount_kes,
      note: note || null,
      created_by: user.id,
    });
    if (dpErr) {
      console.error("direct_payments insert failed", dpErr.message);
      return json({ error: "Could not start the payment, try again" }, 500);
    }

    let pretiumRes: Response;
    try {
      pretiumRes = await fetch(`${PRETIUM_API_URL}/kes/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": PRETIUM_API_KEY },
        body: JSON.stringify({
          amount: amount_kes,
          shortcode,
          mobile_network: "Safaricom",
          reference,
          callback_url: `${SUPABASE_URL}/functions/v1/pretium-webhook?token=${WEBHOOK_SECRET}`,
          description: note || "TOEFL Academic payment",
        }),
      });
    } catch {
      await admin.from("direct_payments").update({ status: "failed", completed_at: new Date().toISOString() }).eq("pretium_reference", reference);
      return json({ error: "Payment provider unavailable. Please try again." }, 503);
    }

    if (!pretiumRes.ok) {
      await admin.from("direct_payments").update({ status: "failed", completed_at: new Date().toISOString() }).eq("pretium_reference", reference);
      return json({ error: "Failed to send M-Pesa prompt. Please try again." }, 502);
    }

    return json({
      message: "STK push sent. Ask the client to enter their M-Pesa PIN.",
      reference,
      phone: shortcode,
      amount_kes,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return json({ error: msg }, 500);
  }
});
