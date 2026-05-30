import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail, buildEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Called by a Supabase Auth webhook (on_auth_user_created) or directly
// after signup. Payload: { user_id, email, full_name }
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, email, full_name } = await req.json();
    if (!email) return new Response(JSON.stringify({ error: "email required" }), { status: 400, headers: corsHeaders });

    const name = full_name?.split(" ")[0] ?? "there";
    const appUrl = Deno.env.get("APP_URL") ?? "https://toeflacademic.com";

    const body = `
      <p style="color:#374151;font-size:15px;line-height:1.6;">Hi ${name},</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;">Welcome to <strong>TOEFL Academic</strong> — your path to an internationally recognised English proficiency certificate.</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;">Here's how it works:</p>
      <ol style="color:#374151;font-size:15px;line-height:2;padding-left:20px;">
        <li>Choose your CEFR level (A2 → C2) and book a slot</li>
        <li>Complete a secure online exam in about 10 minutes</li>
        <li>Receive your verifiable certificate within 24–48 hours</li>
      </ol>
      <p style="color:#374151;font-size:15px;line-height:1.6;">Book your first exam from your dashboard whenever you're ready.</p>
    `;

    await sendEmail({
      to: email,
      subject: "Welcome to TOEFL Academic",
      html: buildEmail({
        heading: `Welcome, ${name}!`,
        body,
        ctaLabel: "Book Your Exam",
        ctaUrl: `${appUrl}/dashboard`,
        footerLink1Label: "Book Your Exam",
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
