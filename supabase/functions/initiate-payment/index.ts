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

  try {
    const { booking_id, phone } = await req.json();
    if (!booking_id || !phone) return json({ error: "Missing booking_id or phone" }, 400);

    const shortcode = normalizePhone(phone);
    if (!shortcode) return json({ error: "Invalid phone number. Use format 07XXXXXXXX." }, 400);

    const { data: booking } = await admin
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!booking) return json({ error: "Booking not found" }, 404);
    if (booking.payment_status !== "unpaid" && booking.payment_status !== "failed") {
      return json({ error: "Payment already in progress or completed" }, 400);
    }

    const testAmount = Deno.env.get("PRETIUM_TEST_AMOUNT");
    const amount_kes: number = testAmount ? parseInt(testAmount, 10) : booking.amount_kes;
    if (!amount_kes) return json({ error: "Booking has no amount — re-book to fix" }, 400);

    const payment_id = crypto.randomUUID();

    await admin.from("bookings").update({
      payment_id,
      payment_status: "pending",
      phone: shortcode,
    }).eq("id", booking_id);

    let pretiumRes: Response;
    try {
      pretiumRes = await fetch(`${PRETIUM_API_URL}/kes/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": PRETIUM_API_KEY },
        body: JSON.stringify({
          amount: amount_kes,
          shortcode,
          mobile_network: "Safaricom",
          reference: payment_id,
          callback_url: `${SUPABASE_URL}/functions/v1/pretium-webhook?token=${WEBHOOK_SECRET}`,
          description: `TOEFL Academic ${booking.level} Exam`,
        }),
      });
    } catch {
      await admin.from("bookings").update({ payment_status: "unpaid", payment_id: null }).eq("id", booking_id);
      return json({ error: "Payment provider unavailable. Please try again." }, 503);
    }

    if (!pretiumRes.ok) {
      await admin.from("bookings").update({ payment_status: "unpaid", payment_id: null }).eq("id", booking_id);
      return json({ error: "Failed to initiate M-Pesa prompt. Please try again." }, 502);
    }

    return json({
      message: "STK push sent to your M-Pesa. Approve the prompt on your phone.",
      payment_id,
      amount_kes,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return json({ error: msg }, 500);
  }
});
