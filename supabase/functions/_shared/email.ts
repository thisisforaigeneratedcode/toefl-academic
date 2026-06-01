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

  // Real hosted PNG tile — PNG works in far more email clients than SVG.
  // Falls back to solid #0d1117 in clients that block remote images.
  const bgTileUrl = `${appUrl}/email-bg.png?v=2`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${opts.heading}</title>
</head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <!-- dark patterned outer wrapper — background attribute works in more clients than CSS -->
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f0e8"
    style="background-color:#f5f0e8;background-image:url('${bgTileUrl}');background-repeat:repeat;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;"
        background="${bgTileUrl}">

        <!-- white card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">

          <!-- logo -->
          <tr>
            <td align="center" style="padding:28px 40px 20px;border-bottom:1px solid #f0f0f0;background:#1E1D4C;border-radius:8px 8px 0 0;">
              <img src="${appUrl}/email-logo.png?v=2" alt="TOEFL Academic" width="64" height="64" style="display:block;border-radius:8px;" />
              <p style="margin:10px 0 0;color:#EEE9DC;font-size:13px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">TOEFL Academic</p>
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
        <p style="color:#7c6f5a;font-size:12px;margin-top:20px;">
          © ${new Date().getFullYear()} TOEFL Academic &nbsp;·&nbsp;
          <a href="mailto:support@toeflacademic.com" style="color:#7c6f5a;">support@toeflacademic.com</a>
        </p>

      </td>
    </tr>
  </table>

</body>
</html>`;
}
