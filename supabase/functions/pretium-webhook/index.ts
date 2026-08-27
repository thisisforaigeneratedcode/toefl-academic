import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { pretiumDisburseFee } from "../_shared/pretium.ts";
import { sendEmail, buildEmail } from "../_shared/email.ts";

const LEVEL_NAMES: Record<string, string> = {
  A2: "Elementary (A2)", B1: "Intermediate (B1)", B2: "Upper-Intermediate (B2)",
  C1: "Advanced (C1)", C2: "Proficient (C2)", WV: "Work & Visa English",
};

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

// Admin-initiated "Collect payment" prompt (no booking): same fee split as
// a booking deposit, credited to the same apicosts ledger with booking_id
// null, so it counts toward the wallet balance exactly like a real exam
// payment does.
async function handleDirectPayment(
  db: ReturnType<typeof createClient>,
  transaction_code: string,
  status: string | undefined,
  receipt_number: string | undefined,
) {
  const { data: direct } = await db
    .from("direct_payments")
    .select("id, status, amount_kes")
    .eq("pretium_reference", transaction_code)
    .maybeSingle();

  if (!direct) return json({ ok: true });
  if (direct.status !== "pending") return json({ ok: true });

  if (status === "FAILED") {
    await db.from("direct_payments").update({
      status: "failed",
      completed_at: new Date().toISOString(),
    }).eq("id", direct.id);
    return json({ ok: true });
  }

  if (status === "COMPLETE") {
    const amount_kes = direct.amount_kes ?? 0;
    const pretium_fee_kes = Math.round(amount_kes * 0.02);
    const net_kes = amount_kes - pretium_fee_kes;
    const api_earnings_kes = Math.round(net_kes * 0.08);

    const { error: ledgerErr } = await db.from("apicosts").insert({
      type: "deposit",
      booking_id: null,
      payment_id: transaction_code,
      transaction_amount_kes: amount_kes,
      pretium_fee_kes,
      api_earnings_kes,
      owner_earnings_kes: api_earnings_kes,
      partner_earnings_kes: 0,
      combined_fee_kes: pretium_fee_kes + api_earnings_kes,
    });
    if (ledgerErr) {
      console.error("apicosts insert failed (direct payment)", ledgerErr.message);
      return json({ error: "ledger write failed" }, 500);
    }

    await db.from("direct_payments").update({
      status: "completed",
      receipt_number: receipt_number ?? null,
      completed_at: new Date().toISOString(),
    }).eq("id", direct.id);
  }

  return json({ ok: true });
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

  if (!booking) return handleDirectPayment(db, transaction_code, status, receipt_number);
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

    // Payment confirmed email
    const { data: profile } = await db.from("profiles").select("full_name, email").eq("id", booking.user_id).maybeSingle();
    const toEmail = profile?.email;
    if (toEmail) {
      const appUrl = Deno.env.get("APP_URL") ?? "https://toeflacademic.com";
      const name = profile?.full_name?.split(" ")[0] ?? "there";
      const levelName = LEVEL_NAMES[booking.level] ?? booking.level;
      const paid = booking.amount_kes ? `KES ${booking.amount_kes.toLocaleString()}` : "";
      const payBody = `
        <p style="color:#374151;font-size:15px;line-height:1.6;">Hi ${name},</p>
        <p style="color:#374151;font-size:15px;line-height:1.6;">Your payment has been received and your <strong>${levelName}</strong> exam slot is now confirmed.</p>
        <p style="color:#374151;font-size:15px;line-height:1.6;">Head to your dashboard to start your exam whenever you're ready.</p>
      `;
      await sendEmail({
        to: toEmail,
        subject: "Payment confirmed — your exam is ready",
        html: buildEmail({
          heading: "Payment confirmed!",
          body: payBody,
          ctaLabel: "Start Exam",
          ctaUrl: `${appUrl}/dashboard`,
          footerLink1Label: "My Dashboard",
          footerLink1Url: `${appUrl}/dashboard`,
          footerLink2Label: "Help Center",
          footerLink2Url: `${appUrl}/support`,
        }),
      });

      const adminEmail = Deno.env.get("ADMIN_EMAIL");
      if (adminEmail) {
        await sendEmail({
          to: adminEmail,
          subject: `Payment received — ${levelName}${paid ? ` (${paid})` : ""}`,
          html: buildEmail({
            heading: "New payment received",
            body: `
              <p style="color:#374151;font-size:15px;line-height:1.6;">A mobile payment has been completed.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
                <tr style="border-bottom:1px solid #f0f0f0;">
                  <td style="padding:10px 0;color:#6b7280;width:40%;">Candidate</td>
                  <td style="padding:10px 0;color:#111827;font-weight:600;">${profile?.full_name ?? "—"}</td>
                </tr>
                <tr style="border-bottom:1px solid #f0f0f0;">
                  <td style="padding:10px 0;color:#6b7280;">Level</td>
                  <td style="padding:10px 0;color:#111827;">${levelName}</td>
                </tr>
                ${paid ? `<tr style="border-bottom:1px solid #f0f0f0;">
                  <td style="padding:10px 0;color:#6b7280;">Amount</td>
                  <td style="padding:10px 0;color:#111827;font-weight:600;">${paid}</td>
                </tr>` : ""}
                <tr style="border-bottom:1px solid #f0f0f0;">
                  <td style="padding:10px 0;color:#6b7280;">Method</td>
                  <td style="padding:10px 0;color:#111827;">Mobile payment</td>
                </tr>
                ${receipt_number ? `<tr>
                  <td style="padding:10px 0;color:#6b7280;">Receipt</td>
                  <td style="padding:10px 0;color:#111827;font-family:monospace;">${receipt_number}</td>
                </tr>` : ""}
              </table>
            `,
            ctaLabel: "View Admin Panel",
            ctaUrl: `${appUrl}/admin`,
            footerLink1Label: "Admin Panel",
            footerLink1Url: `${appUrl}/admin`,
            footerLink2Label: "All Bookings",
            footerLink2Url: `${appUrl}/admin`,
          }),
        });
      }
    }

  } else if (status === "FAILED") {
    await db.from("bookings").update({
      payment_status: "failed",
      status: "pending",
    }).eq("id", booking.id);

    // Payment failed email
    const { data: failProfile } = await db.from("profiles").select("full_name, email").eq("id", booking.user_id).maybeSingle();
    const failEmail = failProfile?.email;
    if (failEmail) {
      const appUrl = Deno.env.get("APP_URL") ?? "https://toeflacademic.com";
      const name = failProfile?.full_name?.split(" ")[0] ?? "there";
      const levelName = LEVEL_NAMES[booking.level] ?? booking.level;
      const failBody = `
        <p style="color:#374151;font-size:15px;line-height:1.6;">Hi ${name},</p>
        <p style="color:#374151;font-size:15px;line-height:1.6;">Unfortunately your payment for the <strong>${levelName}</strong> exam could not be processed. Please return to your dashboard to complete payment using your preferred method.</p>
        <p style="color:#374151;font-size:15px;line-height:1.6;">Please return to your dashboard to retry the payment. Your booking is still reserved.</p>
      `;
      await sendEmail({
        to: failEmail,
        subject: "Payment unsuccessful — please try again",
        html: buildEmail({
          heading: "Payment unsuccessful",
          body: failBody,
          ctaLabel: "Retry Payment",
          ctaUrl: `${appUrl}/dashboard`,
          footerLink1Label: "Retry Payment",
          footerLink1Url: `${appUrl}/dashboard`,
          footerLink2Label: "Contact Support",
          footerLink2Url: "mailto:support@toeflacademic.com",
        }),
      });
    }

    console.log(`Payment failed for booking ${booking.id}: ${message ?? "no reason"}`);
  }

  return json({ ok: true });
});
