import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail, buildEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LEVEL_NAMES: Record<string, string> = {
  A2: "Elementary (A2)",
  B1: "Intermediate (B1)",
  B2: "Upper-Intermediate (B2)",
  C1: "Advanced (C1)",
  C2: "Proficient (C2)",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { booking_id } = await req.json();
    if (!booking_id) return new Response(JSON.stringify({ error: "booking_id required" }), { status: 400, headers: corsHeaders });

    const { data: booking } = await admin
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .maybeSingle();
    if (!booking) return new Response(JSON.stringify({ error: "Booking not found" }), { status: 404, headers: corsHeaders });

    const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", booking.user_id).single();
    const name = profile?.full_name?.split(" ")[0] ?? "there";
    const email = profile?.email ?? user.email;
    if (!email) return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });

    const appUrl = Deno.env.get("APP_URL") ?? "https://toeflacademic.com";
    const levelName = LEVEL_NAMES[booking.level] ?? booking.level;
    const bookedDate = new Date(booking.scheduled_at ?? booking.created_at).toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const amountKes = booking.amount_kes ? `KES ${booking.amount_kes.toLocaleString()}` : "";
    const isPaid = booking.payment_status === "completed";

    const body = `
      <p style="color:#374151;font-size:15px;line-height:1.6;">Hi ${name},</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;">Your exam booking has been received. Here are the details:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 0;color:#6b7280;width:40%;">Level</td>
          <td style="padding:10px 0;color:#111827;font-weight:600;">${levelName}</td>
        </tr>
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 0;color:#6b7280;">Date booked</td>
          <td style="padding:10px 0;color:#111827;">${bookedDate}</td>
        </tr>
        ${amountKes ? `<tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 0;color:#6b7280;">Amount</td>
          <td style="padding:10px 0;color:#111827;font-weight:600;">${amountKes}</td>
        </tr>` : ""}
        <tr>
          <td style="padding:10px 0;color:#6b7280;">Status</td>
          <td style="padding:10px 0;font-weight:600;${isPaid ? "color:#16a34a;" : "color:#d97706;"}">${isPaid ? "Confirmed" : "Awaiting payment"}</td>
        </tr>
      </table>
      <p style="color:#374151;font-size:15px;line-height:1.6;">${isPaid
        ? "Your slot is confirmed — head to your dashboard when you're ready to start the exam."
        : "To confirm your slot, complete payment from your dashboard. You'll find all available payment options there."
      }</p>
    `;

    await sendEmail({
      to: email,
      subject: `Exam booked — ${levelName}`,
      html: buildEmail({
        heading: "Your exam is booked!",
        body,
        ctaLabel: isPaid ? "Go to Dashboard" : "Pay Now",
        ctaUrl: `${appUrl}/dashboard`,
        footerLink1Label: "My Dashboard",
        footerLink1Url: `${appUrl}/dashboard`,
        footerLink2Label: "Help Center",
        footerLink2Url: `${appUrl}/support`,
      }),
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
