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
  const fromName = process.env.SMTP_FROM_NAME?.trim() || "FitClass Support";
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
// HTML Email Templates (Branded with FitClass Obsidian / Royal Blue / Electric Cyan)
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
  const { customerName, ticketNumber, customerPhone = "", branchName = "FitClass Club", categoryName = "General", description } = params;
  const baseUrl = params.appUrl || process.env.NEXT_PUBLIC_APP_URL || "https://fitclass.dev";
  const trackUrl = `${baseUrl.replace(/\/$/, "")}/track`;
  const supportEmail = getSupportEmail();

  const subject = `FitClass Support: We are working on your request (Ticket #${ticketNumber})`;

  const text = `Dear ${customerName},

Thank you for reaching out to FitClass Support. We have received your complaint and our support team is actively working on your request.

Your Request Details:
- Ticket Number: ${ticketNumber}
- Registered Mobile: ${customerPhone}
- Club Branch: ${branchName}
- Category: ${categoryName}
- Details: ${description}

Track Your Request Live:
You can check real-time progress and updates on your ticket anytime by visiting:
${trackUrl}
(Enter your Ticket Number "${ticketNumber}" and your registered mobile number).

Our customer success executive has been assigned to your case and will follow up with you shortly.

Warm regards,
FitClass Support Team
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
<body style="margin: 0; padding: 0; background-color: #0d1117; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e6edf3;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0d1117; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #161b22; border-radius: 12px; border: 1px solid #30363d; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f2744 0%, #1a4971 100%); padding: 30px 24px; text-align: center; border-bottom: 2px solid #72bdd0;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #ffffff;">FITCLASS</h1>
              <p style="margin: 6px 0 0; font-size: 13px; color: #72bdd0; letter-spacing: 1px; text-transform: uppercase; font-weight: 600;">Customer Care & Support</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px 28px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; color: #ffffff; font-weight: 600;">We are working on your request</h2>
              
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #c9d1d9;">
                Dear <strong style="color: #ffffff;">${customerName}</strong>,
              </p>
              
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #c9d1d9;">
                Thank you for contacting FitClass Support. We have received your complaint and our support team is actively reviewing the details. We are committed to providing you with the best gym experience and will resolve your concern swiftly.
              </p>

              <!-- Ticket Badge Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px; background-color: #0d1117; border-radius: 8px; border: 1px solid #30363d; border-left: 4px solid #72bdd0;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #8b949e; font-weight: 600;">Your Ticket Reference Number</p>
                    <p style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #72bdd0; font-family: monospace; letter-spacing: 1px;">${ticketNumber}</p>
                    
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 4px 0; font-size: 13px; color: #8b949e; width: 35%;">Branch:</td>
                        <td style="padding: 4px 0; font-size: 13px; color: #ffffff; font-weight: 500;">${branchName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-size: 13px; color: #8b949e;">Category:</td>
                        <td style="padding: 4px 0; font-size: 13px; color: #ffffff; font-weight: 500;">${categoryName}</td>
                      </tr>
                      ${customerPhone ? `
                      <tr>
                        <td style="padding: 4px 0; font-size: 13px; color: #8b949e;">Mobile:</td>
                        <td style="padding: 4px 0; font-size: 13px; color: #ffffff; font-weight: 500;">${customerPhone}</td>
                      </tr>` : ""}
                      <tr>
                        <td style="padding: 8px 0 4px; font-size: 13px; color: #8b949e; vertical-align: top;">Summary:</td>
                        <td style="padding: 8px 0 4px; font-size: 13px; color: #c9d1d9; line-height: 1.5;">${description}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0 20px; text-align: center;">
                <tr>
                  <td align="center">
                    <a href="${trackUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; background-color: #22618B; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 600; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(34, 97, 139, 0.4);">
                      Track Your Complaint Live →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; color: #8b949e; text-align: center;">
                Use your Ticket ID <strong>${ticketNumber}</strong> and mobile number to see progress.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 28px; background-color: #0d1117; border-top: 1px solid #30363d; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 13px; color: #8b949e;">
                Need more assistance? Reply directly to this email or reach us at <a href="mailto:${supportEmail}" style="color: #72bdd0; text-decoration: none;">${supportEmail}</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #484f58;">
                © 2026 FitClass Gym & Fitness. All rights reserved.
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
  const baseUrl = params.appUrl || process.env.NEXT_PUBLIC_APP_URL || "https://fitclass.dev";
  const adminUrl = `${baseUrl.replace(/\/$/, "")}/admin`;

  const subject = `[FitClass Alert] New Complaint Raised — Ticket #${ticketNumber} (${branchName})`;

  const text = `NEW COMPLAINT ALERT

A new complaint has been registered in the system.

Ticket Number: ${ticketNumber}
Customer: ${customerName}
Email: ${customerEmail}
Phone: ${customerPhone}
Branch: ${branchName}
Category: ${categoryName}
Priority: ${priority}
Source: ${source}

Description:
${description}

Review and assign in the dashboard:
${adminUrl}
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: sans-serif; color: #f8fafc;">
  <div style="max-width: 600px; margin: 30px auto; background-color: #1e293b; border-radius: 8px; border: 1px solid #334155; overflow: hidden;">
    <div style="background-color: #0284c7; padding: 20px 24px;">
      <h2 style="margin: 0; font-size: 18px; color: #ffffff;">FitClass Support System: New Complaint Alert</h2>
    </div>
    <div style="padding: 24px;">
      <p style="margin-top: 0; font-size: 15px; color: #cbd5e1;">A new complaint requires review or action:</p>
      
      <div style="background-color: #0f172a; border-radius: 6px; padding: 16px; margin-bottom: 20px; border-left: 4px solid #38bdf8;">
        <p style="margin: 0 0 10px; font-size: 20px; font-weight: bold; color: #38bdf8; font-family: monospace;">#${ticketNumber}</p>
        <p style="margin: 4px 0; font-size: 14px;"><strong>Customer:</strong> ${customerName} &lt;${customerEmail}&gt;</p>
        <p style="margin: 4px 0; font-size: 14px;"><strong>Phone:</strong> ${customerPhone}</p>
        <p style="margin: 4px 0; font-size: 14px;"><strong>Branch:</strong> ${branchName}</p>
        <p style="margin: 4px 0; font-size: 14px;"><strong>Category:</strong> ${categoryName}</p>
        <p style="margin: 4px 0; font-size: 14px;"><strong>Priority:</strong> ${priority}</p>
        <p style="margin: 4px 0; font-size: 14px;"><strong>Source:</strong> ${source}</p>
      </div>

      <div style="margin-bottom: 24px;">
        <p style="margin: 0 0 6px; font-size: 13px; text-transform: uppercase; color: #94a3b8; font-weight: bold;">Complaint Description:</p>
        <div style="background-color: #0f172a; padding: 12px 16px; border-radius: 6px; font-size: 14px; line-height: 1.5; color: #e2e8f0;">
          ${description}
        </div>
      </div>

      <div style="text-align: center;">
        <a href="${adminUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0284c7; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Open Support Dashboard →</a>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}
