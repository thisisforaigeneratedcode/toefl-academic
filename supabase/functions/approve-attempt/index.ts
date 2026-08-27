import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail, buildEmail } from "../_shared/email.ts";

const LEVEL_NAMES: Record<string, string> = {
  A2: "Elementary (A2)", B1: "Intermediate (B1)", B2: "Upper-Intermediate (B2)",
  C1: "Advanced (C1)", C2: "Proficient (C2)", WV: "Work & Visa English",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function genCertNumber(): string {
  const yr = new Date().getFullYear();
  const rnd = Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  return `TA-${yr}-${rnd}`;
}

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

    // Verify admin role
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });

    const { attempt_id: rawAttemptId, booking_id, decision, band, notes } = await req.json();
    if (!decision || (decision !== "approve" && decision !== "reject")) {
      return new Response(JSON.stringify({ error: "Invalid decision" }), { status: 400, headers: corsHeaders });
    }
    if (!rawAttemptId && !booking_id) {
      return new Response(JSON.stringify({ error: "attempt_id or booking_id required" }), { status: 400, headers: corsHeaders });
    }

    let attempt_id = rawAttemptId as string | undefined;
    let attempt: any = null;

    if (attempt_id) {
      const { data } = await admin.from("exam_attempts").select("*").eq("id", attempt_id).maybeSingle();
      attempt = data;
    } else {
      // Look for an existing attempt on this booking; otherwise create one for the candidate
      const { data: booking } = await admin.from("bookings").select("*").eq("id", booking_id).maybeSingle();
      if (!booking) return new Response(JSON.stringify({ error: "Booking not found" }), { status: 404, headers: corsHeaders });

      const { data: existing } = await admin
        .from("exam_attempts")
        .select("*")
        .eq("booking_id", booking_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        attempt = existing;
      } else {
        const { data: created, error: createErr } = await admin.from("exam_attempts").insert({
          user_id: booking.user_id,
          booking_id: booking.id,
          level: booking.level,
          status: "submitted",
          approval_status: "pending",
          question_ids: [],
          submitted_at: new Date().toISOString(),
          admin_notes: "Issued by admin without candidate submission",
        }).select().single();
        if (createErr) throw createErr;
        attempt = created;
      }
      attempt_id = attempt.id;
    }

    if (!attempt) return new Response(JSON.stringify({ error: "Attempt not found" }), { status: 404, headers: corsHeaders });

    if (decision === "reject") {
      await admin.from("exam_attempts").update({
        status: "graded",
        approval_status: "rejected",
        admin_notes: notes ?? null,
        admin_band: "Did Not Pass",
        final_band: "Did Not Pass",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        graded_at: new Date().toISOString(),
      }).eq("id", attempt_id);

      // Rejection email
      const { data: rejProfile } = await admin.from("profiles").select("full_name, email").eq("id", attempt.user_id).maybeSingle();
      const rejEmail = rejProfile?.email;
      if (rejEmail) {
        const rejName = rejProfile?.full_name?.split(" ")[0] ?? "Candidate";
        const appUrl = Deno.env.get("APP_URL") ?? "https://toeflacademic.com";
        const levelName = LEVEL_NAMES[attempt.level] ?? attempt.level;
        const notesHtml = notes
          ? `<p style="color:#374151;font-size:14px;line-height:1.6;background:#fef3c7;border-left:3px solid #f59e0b;padding:10px 14px;border-radius:4px;"><strong>Reviewer notes:</strong> ${notes}</p>`
          : "";
        const rejBody = `
          <p style="color:#374151;font-size:15px;line-height:1.6;">Hi ${rejName},</p>
          <p style="color:#374151;font-size:15px;line-height:1.6;">Thank you for completing your <strong>${levelName}</strong> exam. Unfortunately, your attempt did not meet the passing standard on this occasion.</p>
          ${notesHtml}
          <p style="color:#374151;font-size:15px;line-height:1.6;">You may be eligible to retry — head to your dashboard to check your remaining attempts. We encourage you to review your responses and try again.</p>
        `;
        await sendEmail({
          to: rejEmail,
          subject: "Your TOEFL Academic Results",
          html: buildEmail({
            heading: "Result: Did Not Pass",
            body: rejBody,
            ctaLabel: "Return to Dashboard",
            ctaUrl: `${appUrl}/dashboard`,
            footerLink1Label: "My Dashboard",
            footerLink1Url: `${appUrl}/dashboard`,
            footerLink2Label: "Contact Support",
            footerLink2Url: `mailto:support@toeflacademic.com`,
          }),
        });
      }

      return new Response(JSON.stringify({ ok: true, decision: "rejected" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Approve — issue certificate
    const allowedBands = ["Pass", "Pass with Merit", "Distinction"];
    const finalBand = allowedBands.includes(band) ? band : "Pass";

    // Avoid duplicate certificates
    const { data: existingCert } = await admin.from("certificates").select("certificate_number").eq("attempt_id", attempt_id).maybeSingle();
    let certificate_number = existingCert?.certificate_number;

    if (!certificate_number) {
      const { data: profile } = await admin.from("profiles").select("full_name").eq("id", attempt.user_id).single();
      certificate_number = genCertNumber();

      // Base percentages from band, then small deterministic variation per skill
      const bandBase: Record<string, number> = { "Distinction": 92, "Pass with Merit": 82, "Pass": 72 };
      const base = bandBase[finalBand] ?? 72;
      // Hash the attempt_id so each cert has stable but unique skill spread
      let h = 0;
      for (const c of String(attempt_id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      const jitter = (seed: number, range: number) => ((seed % (range * 2 + 1)) - range);
      const clamp = (n: number) => Math.max(50, Math.min(99, n));
      const listening_pct = clamp(base + jitter(h, 6));
      const reading_pct   = clamp(base + jitter(h >> 3, 6));
      const speaking_pct  = clamp(base + jitter(h >> 6, 6));
      const writing_pct   = clamp(base + jitter(h >> 9, 6));
      const overall_pct   = Math.round((listening_pct + reading_pct + speaking_pct + writing_pct) / 4);

      await admin.from("certificates").insert({
        certificate_number,
        user_id: attempt.user_id,
        attempt_id,
        candidate_name: profile?.full_name ?? "Candidate",
        level: attempt.level,
        band: finalBand,
        score: overall_pct,
        total: 100,
        listening_pct,
        reading_pct,
        speaking_pct,
        writing_pct,
        overall_pct,
      });
    }

    await admin.from("exam_attempts").update({
      status: "graded",
      approval_status: "approved",
      admin_notes: notes ?? null,
      admin_band: finalBand,
      final_band: finalBand,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      graded_at: new Date().toISOString(),
    }).eq("id", attempt_id);

    // Certificate / approval email — covers normal approval, manual "Issue cert" tab,
    // and "Issue without submission" (BookingIssue) — all paths arrive here.
    const { data: appProfile } = await admin.from("profiles").select("full_name, email").eq("id", attempt.user_id).maybeSingle();
    const appEmail = appProfile?.email;
    if (appEmail) {
      const appName = appProfile?.full_name?.split(" ")[0] ?? "Candidate";
      const appUrl = Deno.env.get("APP_URL") ?? "https://toeflacademic.com";
      const levelName = LEVEL_NAMES[attempt.level] ?? attempt.level;

      // Fetch the certificate row we just created (or the pre-existing one)
      const { data: cert } = await admin.from("certificates")
        .select("listening_pct,reading_pct,speaking_pct,writing_pct,overall_pct,valid_until")
        .eq("certificate_number", certificate_number)
        .maybeSingle();

      const validUntil = cert?.valid_until
        ? new Date(cert.valid_until).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : "";

      const skillsTable = cert ? `
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:500;">Skill</th>
            <th style="padding:8px 12px;text-align:right;color:#6b7280;font-weight:500;">Score</th>
          </tr>
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 12px;color:#374151;">Listening</td>
            <td style="padding:10px 12px;text-align:right;color:#111827;font-weight:600;">${cert.listening_pct}%</td>
          </tr>
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 12px;color:#374151;">Reading</td>
            <td style="padding:10px 12px;text-align:right;color:#111827;font-weight:600;">${cert.reading_pct}%</td>
          </tr>
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 12px;color:#374151;">Speaking</td>
            <td style="padding:10px 12px;text-align:right;color:#111827;font-weight:600;">${cert.speaking_pct}%</td>
          </tr>
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 12px;color:#374151;">Writing</td>
            <td style="padding:10px 12px;text-align:right;color:#111827;font-weight:600;">${cert.writing_pct}%</td>
          </tr>
          <tr style="background:#f0fdf4;">
            <td style="padding:10px 12px;color:#111827;font-weight:700;">Overall</td>
            <td style="padding:10px 12px;text-align:right;color:#16a34a;font-weight:700;">${cert.overall_pct}%</td>
          </tr>
        </table>
      ` : "";

      const appBody = `
        <p style="color:#374151;font-size:15px;line-height:1.6;">Hi ${appName},</p>
        <p style="color:#374151;font-size:15px;line-height:1.6;">Your <strong>${levelName}</strong> exam has been reviewed. We're pleased to inform you that you have <strong>passed</strong> with a grade of <strong>${finalBand}</strong>.</p>
        ${skillsTable}
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 0;color:#6b7280;width:45%;">Certificate number</td>
            <td style="padding:10px 0;color:#111827;font-family:monospace;font-weight:600;">${certificate_number}</td>
          </tr>
          ${validUntil ? `<tr>
            <td style="padding:10px 0;color:#6b7280;">Valid until</td>
            <td style="padding:10px 0;color:#111827;">${validUntil}</td>
          </tr>` : ""}
        </table>
        <p style="color:#374151;font-size:14px;line-height:1.6;">Your certificate can be verified publicly at <a href="${appUrl}/verify/${certificate_number}" style="color:#4f46e5;">${appUrl}/verify/${certificate_number}</a>.</p>
      `;

      await sendEmail({
        to: appEmail,
        subject: "Your TOEFL Academic Certificate is Ready",
        html: buildEmail({
          heading: `Congratulations, ${appName}! You passed.`,
          body: appBody,
          ctaLabel: "Download Certificate",
          ctaUrl: `${appUrl}/certificate/${certificate_number}`,
          footerLink1Label: "Download Certificate",
          footerLink1Url: `${appUrl}/certificate/${certificate_number}`,
          footerLink2Label: "My Dashboard",
          footerLink2Url: `${appUrl}/dashboard`,
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true, decision: "approved", certificate_number }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
