// Powers the Costs-page Bookings/Prompts tabs for the api_owner_user_id.
//
//  - list             every booking (with candidate name/email, failure
//                     reason, outreach history) + every Collect-payment prompt
//  - email_candidate  send a payment-recovery email to a booking's candidate
//                     and log it
//  - delete_booking / delete_direct_payment
//                     delete ONLY failed/cancelled clutter — re-verified
//                     server-side against the row's own status, so a UI bug
//                     can never remove a paid booking. Never touches apicosts.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail, buildEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "https://toeflacademic.com";

const LEVEL_NAMES: Record<string, string> = {
  A2: "Elementary (A2)", B1: "Intermediate (B1)", B2: "Upper-Intermediate (B2)",
  C1: "Advanced (C1)", C2: "Proficient (C2)", WV: "Work & Visa English",
};

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

      const userIds = [...new Set((bookings ?? []).map((b: any) => b.user_id))];
      const bookingIds = (bookings ?? []).map((b: any) => b.id);

      const [{ data: profiles, error: pErr }, { data: outreach, error: oErr }] = await Promise.all([
        userIds.length
          ? admin.from("profiles").select("id, full_name, email, country").in("id", userIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        bookingIds.length
          ? admin.from("booking_outreach").select("booking_id, subject, sent_at").in("booking_id", bookingIds).order("sent_at", { ascending: false })
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);
      // Don't fail the whole list if these degrade — just log and continue
      // with what we have (e.g. booking_outreach not migrated yet).
      if (pErr) console.error("profiles lookup failed", pErr.message);
      if (oErr) console.error("booking_outreach lookup failed", oErr.message);

      const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const omap = new Map<string, any[]>();
      for (const o of outreach ?? []) {
        if (!omap.has(o.booking_id)) omap.set(o.booking_id, []);
        omap.get(o.booking_id)!.push(o);
      }

      const enriched = (bookings ?? []).map((b: any) => ({
        ...b,
        candidate: pmap.get(b.user_id) ?? null,
        outreach: omap.get(b.id) ?? [],
      }));

      return json({ bookings: enriched, direct_payments: directPayments ?? [] });
    }

    if (action === "email_candidate") {
      const booking_id = body?.booking_id as string | undefined;
      const subject = (body?.subject as string | undefined)?.trim();
      const messageBody = (body?.body as string | undefined)?.trim();
      if (!booking_id || !subject || !messageBody) {
        return json({ error: "booking_id, subject and body are all required" }, 400);
      }

      const { data: booking } = await admin
        .from("bookings")
        .select("id, user_id, level")
        .eq("id", booking_id)
        .maybeSingle();
      if (!booking) return json({ error: "Booking not found" }, 404);

      const { data: profile } = await admin
        .from("profiles")
        .select("full_name, email")
        .eq("id", booking.user_id)
        .maybeSingle();
      if (!profile?.email) return json({ error: "Candidate has no email on file" }, 400);

      const firstName = profile.full_name?.split(" ")[0] ?? "there";
      const levelName = LEVEL_NAMES[booking.level] ?? booking.level;
      const paragraphs = messageBody
        .split(/\n{2,}/)
        .map((p) => `<p style="color:#374151;font-size:15px;line-height:1.6;">${p.replace(/\n/g, "<br/>")}</p>`)
        .join("");

      await sendEmail({
        to: profile.email,
        subject,
        html: buildEmail({
          heading: subject,
          body: `<p style="color:#374151;font-size:15px;line-height:1.6;">Hi ${firstName},</p>${paragraphs}`,
          ctaLabel: "Go to my dashboard",
          ctaUrl: `${APP_URL}/dashboard`,
          footerLink1Label: "My Dashboard",
          footerLink1Url: `${APP_URL}/dashboard`,
          footerLink2Label: "Contact Support",
          footerLink2Url: "mailto:support@toeflacademic.com",
        }),
      });

      await admin.from("booking_outreach").insert({
        booking_id,
        sent_by: user.id,
        subject,
        body: messageBody,
      });
      await admin.from("bookings").update({ last_contacted_at: new Date().toISOString() }).eq("id", booking_id);

      return json({ ok: true, sent_to: profile.email, level: levelName });
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
