import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";
import { sendEmail, buildEmail } from "../_shared/email.ts";

const LEVEL_NAMES: Record<string, string> = {
  A2: "Elementary (A2)", B1: "Intermediate (B1)", B2: "Upper-Intermediate (B2)",
  C1: "Advanced (C1)", C2: "Proficient (C2)", WV: "Work & Visa English",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!PAYSTACK_SECRET) return json({ error: "Paystack not configured" }, 500);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    // ── Webhook ──
    if (req.method === "POST" && action === "webhook") {
      const body = await req.text();
      const sig = req.headers.get("x-paystack-signature") ?? "";
      const hash = createHmac("sha512", PAYSTACK_SECRET).update(body).digest("hex");
      if (hash !== sig) return new Response("Invalid signature", { status: 401 });

      const event = JSON.parse(body);
      if (event.event === "charge.success") {
        const bookingId = event.data.metadata?.booking_id;
        const reference = event.data.reference;
        const amount_kes = Math.round(event.data.amount / 100); // kobo → KES

        if (bookingId) {
          const { data: booking } = await db
            .from("bookings")
            .select("id, payment_status")
            .eq("id", bookingId)
            .maybeSingle();

          if (booking && booking.payment_status !== "completed") {
            await db.from("bookings").update({
              payment_status: "completed",
              status: "confirmed",
              mpesa_receipt: reference,
              paid_at: new Date().toISOString(),
            }).eq("id", bookingId);

            // Track API earnings — same split as Pretium payments
            const paystack_fee_kes = Math.round(amount_kes * 0.015); // ~1.5%
            const net_kes = amount_kes - paystack_fee_kes;
            const api_earnings_kes = Math.round(net_kes * 0.08);

            await db.from("apicosts").insert({
              type: "deposit",
              booking_id: bookingId,
              payment_id: reference,
              transaction_amount_kes: amount_kes,
              pretium_fee_kes: paystack_fee_kes,
              api_earnings_kes,
              owner_earnings_kes: api_earnings_kes,
              partner_earnings_kes: 0,
              combined_fee_kes: paystack_fee_kes + api_earnings_kes,
            });

            // Payment confirmed email
            const { data: fullBooking } = await db
              .from("bookings")
              .select("level, user_id, amount_kes")
              .eq("id", bookingId)
              .maybeSingle();
            if (fullBooking) {
              const { data: profile } = await db
                .from("profiles")
                .select("full_name, email")
                .eq("id", fullBooking.user_id)
                .maybeSingle();
              const toEmail = profile?.email;
              if (toEmail) {
                const appUrl = Deno.env.get("APP_URL") ?? "https://toeflacademic.com";
                const name = profile?.full_name?.split(" ")[0] ?? "there";
                const levelName = LEVEL_NAMES[fullBooking.level] ?? fullBooking.level;
                const paid = fullBooking.amount_kes
                  ? `KES ${fullBooking.amount_kes.toLocaleString()}`
                  : `KES ${amount_kes.toLocaleString()}`;
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
                    subject: `Payment received — ${levelName} (${paid})`,
                    html: buildEmail({
                      heading: "New payment received",
                      body: `
                        <p style="color:#374151;font-size:15px;line-height:1.6;">A card payment has been completed.</p>
                        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
                          <tr style="border-bottom:1px solid #f0f0f0;">
                            <td style="padding:10px 0;color:#6b7280;width:40%;">Candidate</td>
                            <td style="padding:10px 0;color:#111827;font-weight:600;">${profile?.full_name ?? "—"}</td>
                          </tr>
                          <tr style="border-bottom:1px solid #f0f0f0;">
                            <td style="padding:10px 0;color:#6b7280;">Level</td>
                            <td style="padding:10px 0;color:#111827;">${levelName}</td>
                          </tr>
                          <tr style="border-bottom:1px solid #f0f0f0;">
                            <td style="padding:10px 0;color:#6b7280;">Amount</td>
                            <td style="padding:10px 0;color:#111827;font-weight:600;">${paid}</td>
                          </tr>
                          <tr style="border-bottom:1px solid #f0f0f0;">
                            <td style="padding:10px 0;color:#6b7280;">Method</td>
                            <td style="padding:10px 0;color:#111827;">Card (Paystack)</td>
                          </tr>
                          <tr>
                            <td style="padding:10px 0;color:#6b7280;">Reference</td>
                            <td style="padding:10px 0;color:#111827;font-family:monospace;">${reference}</td>
                          </tr>
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
            }
          }
        }
      }
      return json({ received: true });
    }

    // ── Initialize ──
    if (req.method === "POST" && action === "initialize") {
      const body = await req.json();
      const { booking_id, email } = body;
      if (!booking_id || !email) return json({ error: "booking_id and email required" }, 400);

      const { data: booking } = await db
        .from("bookings")
        .select("id, amount_kes, level")
        .eq("id", booking_id)
        .maybeSingle();
      if (!booking) return json({ error: "Booking not found" }, 404);

      const origin = req.headers.get("origin") ?? "https://toeflacademic.com";
      const res = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          amount: (booking.amount_kes ?? 0) * 100, // kobo
          currency: "KES",
          reference: `TA-${booking_id.slice(0, 8)}-${Date.now()}`,
          metadata: { booking_id, level: booking.level },
          callback_url: `${origin}/dashboard?paystack=success&booking_id=${booking_id}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) return json({ error: "Payment initialization failed", details: data }, 400);

      await db.from("bookings").update({
        payment_status: "pending",
        mpesa_receipt: data.data.reference, // store ref for verify-on-return recovery
      }).eq("id", booking_id);

      return json({ authorization_url: data.data.authorization_url, reference: data.data.reference });
    }

    // ── Verify ──
    if (req.method === "POST" && action === "verify") {
      const { reference } = await req.json();
      if (!reference) return json({ error: "reference required" }, 400);

      const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      });
      const data = await res.json();

      if (data.data?.status === "success") {
        const bookingId = data.data.metadata?.booking_id;
        const amount_kes = Math.round((data.data.amount ?? 0) / 100);

        if (bookingId) {
          const { data: booking } = await db
            .from("bookings")
            .select("id, payment_status")
            .eq("id", bookingId)
            .maybeSingle();

          if (booking && booking.payment_status !== "completed") {
            await db.from("bookings").update({
              payment_status: "completed",
              status: "confirmed",
              mpesa_receipt: reference,
              paid_at: new Date().toISOString(),
            }).eq("id", bookingId);

            const paystack_fee_kes = Math.round(amount_kes * 0.015);
            const net_kes = amount_kes - paystack_fee_kes;
            const api_earnings_kes = Math.round(net_kes * 0.08);

            await db.from("apicosts").insert({
              type: "deposit",
              booking_id: bookingId,
              payment_id: reference,
              transaction_amount_kes: amount_kes,
              pretium_fee_kes: paystack_fee_kes,
              api_earnings_kes,
              owner_earnings_kes: api_earnings_kes,
              partner_earnings_kes: 0,
              combined_fee_kes: paystack_fee_kes + api_earnings_kes,
            });
          }
        }
        return json({ status: "success", booking_id: bookingId });
      }
      return json({ status: data.data?.status ?? "failed" });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("Paystack error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});