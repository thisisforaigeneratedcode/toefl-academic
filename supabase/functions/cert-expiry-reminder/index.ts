import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail, buildEmail } from "../_shared/email.ts";

// Runs on a schedule (daily). Invoke via Supabase cron or pg_cron:
//   SELECT cron.schedule('cert-expiry-reminder', '0 8 * * *',
//     $$SELECT net.http_post(url:='<fn-url>', headers:='{}', body:='{}')$$);
//
// Also callable manually from the admin panel for testing.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LEVEL_NAMES: Record<string, string> = {
  A2: "Elementary (A2)", B1: "Intermediate (B1)", B2: "Upper-Intermediate (B2)",
  C1: "Advanced (C1)", C2: "Proficient (C2)",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const appUrl = Deno.env.get("APP_URL") ?? "https://toeflacademic.com";

  // Find certificates expiring in exactly 30 days that haven't been revoked
  const target = new Date();
  target.setDate(target.getDate() + 30);
  const targetDate = target.toISOString().split("T")[0]; // YYYY-MM-DD

  const { data: certs, error } = await db
    .from("certificates")
    .select("certificate_number, level, band, valid_until, user_id")
    .eq("valid_until", targetDate)
    .eq("revoked", false);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  for (const cert of certs ?? []) {
    const { data: profile } = await db
      .from("profiles")
      .select("full_name, email")
      .eq("id", cert.user_id)
      .maybeSingle();

    const toEmail = profile?.email;
    if (!toEmail) continue;

    const name = profile?.full_name?.split(" ")[0] ?? "there";
    const levelName = LEVEL_NAMES[cert.level] ?? cert.level;
    const expiryDate = new Date(cert.valid_until).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });

    const body = `
      <p style="color:#374151;font-size:15px;line-height:1.6;">Hi ${name},</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;">This is a reminder that your <strong>${levelName}</strong> TOEFL Academic certificate (<code style="font-size:13px;">${cert.certificate_number}</code>) will expire on <strong>${expiryDate}</strong> — 30 days from today.</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;">To keep your certification current, book a renewal exam from your dashboard. Retaining an up-to-date certificate strengthens your academic and professional profile.</p>
    `;

    await sendEmail({
      to: toEmail,
      subject: `Your TOEFL Academic certificate expires in 30 days`,
      html: buildEmail({
        heading: "Certificate expiry reminder",
        body,
        ctaLabel: "Renew Certification",
        ctaUrl: `${appUrl}/dashboard`,
        footerLink1Label: "Book New Exam",
        footerLink1Url: `${appUrl}/dashboard`,
        footerLink2Label: "My Dashboard",
        footerLink2Url: `${appUrl}/dashboard`,
      }),
    });
    sent++;
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
