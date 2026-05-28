import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pretiumDisburseFee } from "../_shared/pretium.ts";

const WEBHOOK_SECRET = Deno.env.get("PRETIUM_WEBHOOK_SECRET")!;
const PRETIUM_OUTBOUND_IP = "206.189.18.169";
const PRETIUM_API_URL = "https://api.xwift.africa";
const PRETIUM_API_KEY = Deno.env.get("PRETIUM_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SETTLE_THRESHOLD = 5000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function settleIfReady(db: ReturnType<typeof createClient>, target: "owner" | "partner") {
  const earningsCol = target === "owner" ? "owner_earnings_kes" : "partner_earnings_kes";
  const withdrawnCol = target === "owner" ? "owner_withdrawn" : "partner_withdrawn";
  const PHONE = target === "owner"
    ? Deno.env.get("PLATFORM_FEE_PHONE")
    : Deno.env.get("PARTNER_FEE_PHONE");

  if (!PHONE) return;

  const { data: flag } = await db
    .from("site_settings")
    .select("value")
    .eq("key", "auto_settle_enabled")
    .maybeSingle();
  if (!flag || flag.value !== "true") return;

  const { data: rows } = await db
    .from("apicosts")
    .select(`id, ${earningsCol}`)
    .eq(withdrawnCol, false)
    .eq("type", "deposit");

  const total = (rows ?? []).reduce((s: number, r: any) => s + (r[earningsCol] as number ?? 0), 0);
  if (total < SETTLE_THRESHOLD) return;

  const ids = (rows ?? []).map((r: any) => r.id as string);
  const pretium_flat = pretiumDisburseFee(total);
  const disburse_amount = total - pretium_flat;
  if (disburse_amount < 10) return;

  const reference = crypto.randomUUID();
  try {
    const res = await fetch(`${PRETIUM_API_URL}/kes/disburse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": PRETIUM_API_KEY },
      body: JSON.stringify({
        amount: disburse_amount,
        shortcode: PHONE,
        mobile_network: "Safaricom",
        type: "MOBILE",
        reference,
        description: `${target === "owner" ? "Owner" : "Partner"} API earnings`,
      }),
    });
    if (res.ok) {
      await db.from("apicosts").update({
        [withdrawnCol]: true,
        [`${target}_withdrawn_at`]: new Date().toISOString(),
        [`${target}_withdrawal_receipt`]: reference,
      }).in("id", ids);
    } else {
      console.error(`${target} auto-settle failed:`, await res.text());
    }
  } catch (err) {
    console.error(`${target} settleIfReady error:`, err);
  }
}

serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token || token !== WEBHOOK_SECRET) return json({ error: "Unauthorized" }, 401);

  const incomingIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (incomingIp && incomingIp !== PRETIUM_OUTBOUND_IP) {
    console.warn("Webhook from unexpected IP:", incomingIp);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: true });
  }

  const { status, transaction_code, receipt_number, message, is_released } = payload as {
    status?: string;
    transaction_code?: string;
    receipt_number?: string;
    message?: string;
    is_released?: boolean;
  };

  if (is_released !== undefined) return json({ ok: true });
  if (!transaction_code) return json({ ok: true });

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: booking } = await db
    .from("bookings")
    .select("id, user_id, level, amount_kes, payment_status")
    .eq("payment_id", transaction_code)
    .maybeSingle();

  if (!booking) return json({ ok: true });
  if (booking.payment_status !== "pending") return json({ ok: true });

  if (status === "COMPLETE") {
    const testAmount = Deno.env.get("PRETIUM_TEST_AMOUNT");
    const amount_kes: number = testAmount ? parseInt(testAmount, 10) : (booking.amount_kes ?? 0);
    const pretium_fee_kes = Math.round(amount_kes * 0.02);
    const net_kes = amount_kes - pretium_fee_kes;
    const api_earnings_kes = Math.round(net_kes * 0.08);
    const owner_earnings_kes = api_earnings_kes;
    const partner_earnings_kes = 0;

    await Promise.all([
      db.from("bookings").update({
        payment_status: "completed",
        status: "confirmed",
        mpesa_receipt: receipt_number ?? null,
        paid_at: new Date().toISOString(),
      }).eq("id", booking.id),

      db.from("apicosts").insert({
        type: "deposit",
        booking_id: booking.id,
        payment_id: transaction_code,
        transaction_amount_kes: amount_kes,
        pretium_fee_kes,
        api_earnings_kes,
        owner_earnings_kes,
        partner_earnings_kes,
        combined_fee_kes: pretium_fee_kes + api_earnings_kes,
      }),
    ]);

    await settleIfReady(db, "owner");
    await settleIfReady(db, "partner");

  } else if (status === "FAILED") {
    await db.from("bookings").update({
      payment_status: "failed",
      status: "pending",
    }).eq("id", booking.id);

    console.log(`Payment failed for booking ${booking.id}: ${message ?? "no reason"}`);
  }

  return json({ ok: true });
});
