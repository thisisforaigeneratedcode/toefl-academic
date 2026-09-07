// Lets the api_owner_user_id (the Costs page owner) view every booking and
// every Collect-payment prompt, and delete only the ones that are pure
// clutter: failed/cancelled bookings, and failed prompts. Deletion is
// re-verified server-side against the row's own status — the client's
// request is never trusted — so a bug in the UI can never delete a booking
// that was actually paid, or any apicosts ledger row (this function never
// touches apicosts at all; that table's balance math must stay untouched).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: ownerSetting } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", "api_owner_user_id")
    .maybeSingle();
  if (!ownerSetting || ownerSetting.value !== user.id) {
    return json({ error: "Access denied" }, 403);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    if (action === "list") {
      const [{ data: bookings, error: bErr }, { data: directPayments, error: dpErr }] = await Promise.all([
        admin.from("bookings").select("*").order("created_at", { ascending: false }),
        admin.from("direct_payments").select("*").order("created_at", { ascending: false }),
      ]);
      if (bErr || dpErr) return json({ error: (bErr ?? dpErr)?.message ?? "Failed to load" }, 500);
      return json({ bookings: bookings ?? [], direct_payments: directPayments ?? [] });
    }

    if (action === "delete_booking") {
      const booking_id = body?.booking_id as string | undefined;
      if (!booking_id) return json({ error: "booking_id required" }, 400);

      const { data: booking } = await admin
        .from("bookings")
        .select("id, payment_status, status")
        .eq("id", booking_id)
        .maybeSingle();
      if (!booking) return json({ error: "Not found" }, 404);

      const deletable = booking.payment_status === "failed" || booking.status === "cancelled";
      if (!deletable) {
        return json({ error: "Only failed or cancelled bookings can be deleted" }, 400);
      }

      const { error: delErr } = await admin.from("bookings").delete().eq("id", booking_id);
      if (delErr) return json({ error: delErr.message }, 500);
      return json({ ok: true });
    }

    if (action === "delete_direct_payment") {
      const id = body?.id as string | undefined;
      if (!id) return json({ error: "id required" }, 400);

      const { data: dp } = await admin
        .from("direct_payments")
        .select("id, status")
        .eq("id", id)
        .maybeSingle();
      if (!dp) return json({ error: "Not found" }, 404);

      if (dp.status !== "failed") {
        return json({ error: "Only failed prompts can be deleted" }, 400);
      }

      const { error: delErr } = await admin.from("direct_payments").delete().eq("id", id);
      if (delErr) return json({ error: delErr.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return json({ error: msg }, 500);
  }
});
