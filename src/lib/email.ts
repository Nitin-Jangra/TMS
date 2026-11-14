import nodemailer from "nodemailer";

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

const DEFAULT_SUPPORT_EMAIL = "nitin98175@gmail.com";

export function getSupportEmail(): string {
  return (
    process.env.SUPPORT_NOTIFICATION_EMAIL?.trim() ||
    process.env.INBOUND_SUPPORT_EMAIL?.trim() ||
    process.env.SMTP_USER?.trim() ||
    DEFAULT_SUPPORT_EMAIL
  );
}

export function getDefaultFrom(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (from) return from;
  const fromName = process.env.SMTP_FROM_NAME?.trim() || "Msquare Professionals Support";
  const supportEmail = getSupportEmail();
  return `${fromName} <${supportEmail}>`;
}

/**
 * Universal email sender.
 * 1. If RESEND_API_KEY is present, sends via Resend REST API (Edge/Cloudflare compatible).
 * 2. If SMTP_USER & SMTP_PASS are set, sends via SMTP (Gmail App Password or custom SMTP).
 * 3. If credentials are missing, logs delivery gracefully without failing the caller.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const to = options.to.trim();
  if (!to) {
    return { success: false, error: "Recipient email is blank." };
  }

  const from = options.from || getDefaultFrom();
  const replyTo = options.replyTo || getSupportEmail();

  // Mode 1: Resend HTTP API (works in Edge/Cloudflare Workers and Node.js)
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          reply_to: replyTo,
          subject: options.subject,
          text: options.text,
          html: options.html,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) {
        console.error("[fcms:email] Resend delivery error:", data);
        return { success: false, error: data.message || `Resend HTTP error ${res.status}` };
      }
      return { success: true, messageId: data.id };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[fcms:email] Resend fetch exception:", msg);
      return { success: false, error: msg };
    }
  }

  // Mode 2: SMTP / Gmail App Password
  const smtpUser = process.env.SMTP_USER?.trim() || process.env.GMAIL_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim() || process.env.GMAIL_APP_PASSWORD?.trim();

  if (smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT || 465),
        secure: process.env.SMTP_SECURE !== "false", // true for 465, false for 587
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const info = await transporter.sendMail({
        from,
        to,
        replyTo,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      return { success: true, messageId: info.messageId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[fcms:email] SMTP delivery error:", msg);
      return { success: false, error: msg };
    }
  }

  // Mode 3: Development / Unconfigured fallback
  console.info(
    `[fcms:email] [SIMULATED] To: ${to} | Subject: ${options.subject} | (Configure SMTP_USER & SMTP_PASS or RESEND_API_KEY in .env for live dispatch)`
  );
  return {
    success: true,
    simulated: true,
    messageId: `simulated-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

// ---------------------------------------------------------------------------
// HTML Email Templates (Branded with MSquare Professionals Obsidian #0c0c10 + Brand Orange #ff6b00)
// ---------------------------------------------------------------------------

export function renderCustomerConfirmationEmail(params: {
  customerName: string;
  ticketNumber: string;
  customerPhone?: string;
  branchName?: string;
  categoryName?: string;
  description: string;
  appUrl?: string;
}): { subject: string; text: string; html: string } {
  const { customerName, ticketNumber, customerPhone = "", branchName = "MSquare Professionals", categoryName = "General", description } = params;
  const baseUrl = params.appUrl || process.env.NEXT_PUBLIC_APP_URL || "https://msquareprofessionals.com";
  const trackUrl = `${baseUrl.replace(/\/$/, "")}/track?ticket=${encodeURIComponent(ticketNumber)}`;
  const supportEmail = getSupportEmail();

  const subject = `MSquare Professionals Support: We are working on your request (Ticket #${ticketNumber})`;

  const text = `Dear ${customerName},

Thank you for reaching out to MSquare Professionals Support. We have received your complaint and our client care team is actively working on your request.

Your Request Details:
- Ticket Number: ${ticketNumber}
- Registered Contact: ${customerPhone}
- Service Branch / Office: ${branchName}
- Category: ${categoryName}
- Details: ${description}

Track Your Request Live:
You can check real-time progress and updates on your ticket anytime by visiting:
${trackUrl}
(Enter your Ticket Number "${ticketNumber}" and your registered mobile number).

Our customer success executive has been assigned to your case and will follow up with you shortly.

Warm regards,
MSquare Professionals Support Team
Email: ${supportEmail}
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0c0c10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f7;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0c0c10; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #13131a; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.08); overflow: hidden; box-shadow: 0 12px 30px rgba(0,0,0,0.6);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #0c0c10; padding: 28px 24px; text-align: center; border-bottom: 2px solid #ff6b00;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #ffffff;">MSQUARE PROFESSIONALS</h1>
              <p style="margin: 6px 0 0; font-size: 12px; color: #ff6b00; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 700;">Client Care & Resolution</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px 28px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; color: #ffffff; font-weight: 700;">We are working on your request</h2>
              
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #d4d4d8;">
                Dear <strong style="color: #ffffff;">${customerName}</strong>,
              </p>
              
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #a1a1aa;">
                Thank you for contacting MSquare Professionals Support. We have received your complaint and our service management team is actively reviewing the details. We are committed to high service standards and will resolve your concern swiftly.
              </p>

              <!-- Ticket Badge Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px; background-color: #171722; border-radius: 12px; border: 1px solid rgba(255, 107, 0, 0.25); border-left: 5px solid #ff6b00;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #a1a1aa; font-weight: 700;">Your Ticket Reference Number</p>
                    <p style="margin: 0 0 16px; font-size: 26px; font-weight: 800; color: #ff6b00; font-family: monospace; letter-spacing: 1px;">${ticketNumber}</p>
                    
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 5px 0; font-size: 13px; color: #a1a1aa; width: 35%;">Office / Branch:</td>
                        <td style="padding: 5px 0; font-size: 13px; color: #ffffff; font-weight: 600;">${branchName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; font-size: 13px; color: #a1a1aa;">Category:</td>
                        <td style="padding: 5px 0; font-size: 13px; color: #ffffff; font-weight: 600;">${categoryName}</td>
                      </tr>
                      ${customerPhone ? `
                      <tr>
                        <td style="padding: 5px 0; font-size: 13px; color: #a1a1aa;">Contact:</td>
                        <td style="padding: 5px 0; font-size: 13px; color: #ffffff; font-weight: 600;">${customerPhone}</td>
                      </tr>` : ""}
                      <tr>
                        <td style="padding: 8px 0 4px; font-size: 13px; color: #a1a1aa; vertical-align: top;">Summary:</td>
                        <td style="padding: 8px 0 4px; font-size: 13px; color: #d4d4d8; line-height: 1.5;">${description}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0 20px; text-align: center;">
                <tr>
                  <td align="center">
                    <a href="${trackUrl}" target="_blank" style="display: inline-block; padding: 14px 30px; background: linear-gradient(135deg, #ff6b00, #ff7d1a); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 700; letter-spacing: 0.5px; box-shadow: 0 4px 16px rgba(255, 107, 0, 0.45);">
                      Track Your Request Live →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; color: #71717a; text-align: center;">
                Use your Ticket ID <strong>${ticketNumber}</strong> and contact number to see progress.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 28px; background-color: #0c0c10; border-top: 1px solid rgba(255, 255, 255, 0.08); text-align: center;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #a1a1aa;">
                Need more assistance? Reply directly to this email or reach us at <a href="mailto:${supportEmail}" style="color: #ff6b00; text-decoration: none;">${supportEmail}</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #71717a;">
                © 2026 MSquare Professionals. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

export function renderAdminAlertEmail(params: {
  ticketNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  branchName: string;
  categoryName: string;
  priority?: string;
  description: string;
  source?: string;
  appUrl?: string;
}): { subject: string; text: string; html: string } {
  const { ticketNumber, customerName, customerEmail, customerPhone, branchName, categoryName, priority = "MEDIUM", description, source = "PORTAL" } = params;
  const baseUrl = params.appUrl || process.env.NEXT_PUBLIC_APP_URL || "https://msquareprofessionals.com";
  const adminUrl = `${baseUrl.replace(/\/$/, "")}/admin`;

  const subject = `[MSquare Professionals Alert] New Complaint Raised — Ticket #${ticketNumber} (${branchName})`;

  const text = `NEW COMPLAINT ALERT

A new client complaint has been registered in MSquare Professionals CMS.

Ticket Number: ${ticketNumber}
Client: ${customerName}
Email: ${customerEmail}
Phone: ${customerPhone}
Branch / Office: ${branchName}
Category: ${categoryName}
Priority: ${priority}
Source: ${source}

Description:
${description}

Review and assign in the operations dashboard:
${adminUrl}
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0c0c10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f7;">
  <div style="max-width: 600px; margin: 30px auto; background-color: #13131a; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.08); overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
    <div style="background-color: #0c0c10; padding: 20px 24px; border-bottom: 2px solid #ff6b00;">
      <h2 style="margin: 0; font-size: 17px; font-weight: 800; color: #ffffff; letter-spacing: 1px;">MSQUARE PROFESSIONALS: NEW COMPLAINT ALERT</h2>
    </div>
    <div style="padding: 24px;">
      <p style="margin-top: 0; font-size: 14px; color: #a1a1aa;">A new client complaint requires review and assignment:</p>
      
      <div style="background-color: #171722; border-radius: 8px; padding: 16px; margin-bottom: 20px; border-left: 4px solid #ff6b00;">
        <p style="margin: 0 0 10px; font-size: 22px; font-weight: 800; color: #ff6b00; font-family: monospace;">#${ticketNumber}</p>
        <p style="margin: 4px 0; font-size: 13px;"><strong>Client:</strong> ${customerName} &lt;${customerEmail}&gt;</p>
        <p style="margin: 4px 0; font-size: 13px;"><strong>Contact:</strong> ${customerPhone}</p>
        <p style="margin: 4px 0; font-size: 13px;"><strong>Office / Branch:</strong> ${branchName}</p>
        <p style="margin: 4px 0; font-size: 13px;"><strong>Category:</strong> ${categoryName}</p>
        <p style="margin: 4px 0; font-size: 13px;"><strong>Priority:</strong> ${priority}</p>
        <p style="margin: 4px 0; font-size: 13px;"><strong>Source:</strong> ${source}</p>
      </div>

      <div style="margin-bottom: 24px;">
        <p style="margin: 0 0 6px; font-size: 12px; text-transform: uppercase; color: #a1a1aa; font-weight: 700;">Complaint Description:</p>
        <div style="background-color: #171722; padding: 12px 16px; border-radius: 8px; font-size: 13px; line-height: 1.5; color: #e4e4e7;">
          ${description}
        </div>
      </div>

      <div style="text-align: center;">
        <a href="${adminUrl}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #ff6b00, #ff7d1a); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 13px; box-shadow: 0 4px 14px rgba(255, 107, 0, 0.4);">Open Operations Dashboard →</a>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}
