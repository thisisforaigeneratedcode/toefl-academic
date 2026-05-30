const RESEND_API = "https://api.resend.com/emails";
const FROM = "TOEFL Academic <support@toeflacademic.com>";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  try {
    await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, ...payload }),
    });
  } catch (_) {
    // never crash the calling function due to email failure
  }
}

// Sentry-style: dark patterned outer background, white centered card,
// logo at top, CTA button, two footer nav links.
export function buildEmail(opts: {
  heading: string;
  body: string; // pre-built inner HTML (use <p> tags)
  ctaLabel?: string;
  ctaUrl?: string;
  footerLink1Label?: string;
  footerLink1Url?: string;
  footerLink2Label?: string;
  footerLink2Url?: string;
}): string {
  const appUrl = Deno.env.get("APP_URL") ?? "https://toeflacademic.com";

  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<a href="${opts.ctaUrl}" style="display:inline-block;margin-top:28px;padding:14px 32px;background:#4f46e5;color:#fff;font-size:15px;font-weight:600;border-radius:6px;text-decoration:none;">${opts.ctaLabel}</a>`
      : "";

  const fl1Label = opts.footerLink1Label ?? "My Dashboard";
  const fl1Url = opts.footerLink1Url ?? `${appUrl}/dashboard`;
  const fl2Label = opts.footerLink2Label ?? "Help Center";
  const fl2Url = opts.footerLink2Url ?? `${appUrl}/support`;

  // Tiled SVG icon pattern — mortarboards and certificates at low opacity
  const patternSvg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'>
      <text x='8' y='40' font-size='28' opacity='0.10' fill='%23ffffff'>🎓</text>
      <text x='44' y='72' font-size='22' opacity='0.08' fill='%23ffffff'>📜</text>
    </svg>
  `.replace(/\s+/g, " ").trim();
  const encodedPattern = encodeURIComponent(patternSvg);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${opts.heading}</title>
</head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <!-- dark patterned outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;background-image:url('data:image/svg+xml,${encodedPattern}');min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- white card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">

          <!-- logo row -->
          <tr>
            <td align="center" style="padding:32px 40px 24px;border-bottom:1px solid #f0f0f0;">
              <img src="${appUrl}/logo.png" alt="TOEFL Academic" width="160" style="display:block;height:auto;" />
            </td>
          </tr>

          <!-- content -->
          <tr>
            <td style="padding:36px 40px 12px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">${opts.heading}</h1>
              ${opts.body}
              <div style="text-align:center;">${cta}</div>
            </td>
          </tr>

          <!-- footer nav links -->
          <tr>
            <td align="center" style="padding:28px 40px 32px;border-top:1px solid #f0f0f0;margin-top:16px;">
              <a href="${fl1Url}" style="color:#6b7280;font-size:13px;text-decoration:none;margin:0 16px;">${fl1Label}</a>
              <a href="${fl2Url}" style="color:#6b7280;font-size:13px;text-decoration:none;margin:0 16px;">${fl2Label}</a>
            </td>
          </tr>

        </table>

        <!-- below-card note -->
        <p style="color:#4b5563;font-size:12px;margin-top:20px;">
          © ${new Date().getFullYear()} TOEFL Academic &nbsp;·&nbsp;
          <a href="mailto:support@toeflacademic.com" style="color:#6b7280;">support@toeflacademic.com</a>
        </p>

      </td>
    </tr>
  </table>

</body>
</html>`;
}
