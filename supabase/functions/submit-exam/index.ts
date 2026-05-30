import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail, buildEmail } from "../_shared/email.ts";

const LEVEL_NAMES: Record<string, string> = {
  A2: "Elementary (A2)", B1: "Intermediate (B1)", B2: "Upper-Intermediate (B2)",
  C1: "Advanced (C1)", C2: "Proficient (C2)",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { attempt_id, listening_response, reading_audio_url } = await req.json();
    if (!attempt_id) {
      return new Response(JSON.stringify({ error: "Missing attempt_id" }), { status: 400, headers: corsHeaders });
    }
    if (!listening_response || typeof listening_response !== "string" || listening_response.trim().length < 3) {
      return new Response(JSON.stringify({ error: "You must type what you heard in the listening section before submitting." }), { status: 400, headers: corsHeaders });
    }
    if (!reading_audio_url || typeof reading_audio_url !== "string") {
      return new Response(JSON.stringify({ error: "You must record the reading section before submitting." }), { status: 400, headers: corsHeaders });
    }

    const { data: attempt } = await admin.from("exam_attempts").select("*").eq("id", attempt_id).eq("user_id", user.id).maybeSingle();
    if (!attempt) return new Response(JSON.stringify({ error: "Attempt not found" }), { status: 404, headers: corsHeaders });
    if (attempt.status !== "in_progress" && attempt.status !== "not_started") {
      return new Response(JSON.stringify({ error: "Already submitted" }), { status: 400, headers: corsHeaders });
    }

    await admin.from("exam_attempts").update({
      status: "submitted",
      approval_status: "pending",
      listening_response: listening_response ?? null,
      reading_audio_url: reading_audio_url ?? null,
      submitted_at: new Date().toISOString(),
    }).eq("id", attempt_id);

    if (attempt.booking_id) {
      await admin.from("bookings").update({ status: "completed" }).eq("id", attempt.booking_id);
    }

    // Emails: candidate confirmation + admin alert
    const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
    const candidateEmail = profile?.email ?? user.email;
    const appUrl = Deno.env.get("APP_URL") ?? "https://toeflacademic.com";
    const levelName = LEVEL_NAMES[attempt.level] ?? attempt.level;
    const submittedAt = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

    if (candidateEmail) {
      const name = profile?.full_name?.split(" ")[0] ?? "there";
      const candidateBody = `
        <p style="color:#374151;font-size:15px;line-height:1.6;">Hi ${name},</p>
        <p style="color:#374151;font-size:15px;line-height:1.6;">Your <strong>${levelName}</strong> exam has been successfully submitted. Our team will review your responses and get back to you within <strong>24–48 hours</strong>.</p>
        <p style="color:#374151;font-size:15px;line-height:1.6;">You'll receive another email as soon as your results are ready. In the meantime, you can track your submission status from your dashboard.</p>
      `;
      await sendEmail({
        to: candidateEmail,
        subject: "Exam submitted — results within 24–48 hours",
        html: buildEmail({
          heading: "Exam received!",
          body: candidateBody,
          ctaLabel: "View Dashboard",
          ctaUrl: `${appUrl}/dashboard`,
          footerLink1Label: "My Dashboard",
          footerLink1Url: `${appUrl}/dashboard`,
          footerLink2Label: "Help Center",
          footerLink2Url: `${appUrl}/support`,
        }),
      });
    }

    const adminEmail = Deno.env.get("ADMIN_EMAIL");
    if (adminEmail) {
      const candidateName = profile?.full_name ?? candidateEmail ?? "Unknown candidate";
      const adminBody = `
        <p style="color:#374151;font-size:15px;line-height:1.6;">A new exam submission is pending review.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 0;color:#6b7280;width:40%;">Candidate</td>
            <td style="padding:10px 0;color:#111827;font-weight:600;">${candidateName}</td>
          </tr>
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 0;color:#6b7280;">Level</td>
            <td style="padding:10px 0;color:#111827;">${levelName}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#6b7280;">Submitted at</td>
            <td style="padding:10px 0;color:#111827;">${submittedAt}</td>
          </tr>
        </table>
      `;
      await sendEmail({
        to: adminEmail,
        subject: `New submission pending review — ${levelName}`,
        html: buildEmail({
          heading: "New exam submission",
          body: adminBody,
          ctaLabel: "Review Submission",
          ctaUrl: `${appUrl}/admin`,
          footerLink1Label: "Review Submission",
          footerLink1Url: `${appUrl}/admin`,
          footerLink2Label: "Admin Panel",
          footerLink2Url: `${appUrl}/admin`,
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
