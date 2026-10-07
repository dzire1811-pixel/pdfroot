import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 5;
const requestsByAddress = new Map<string, number[]>();

function plainText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function requestAddress(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function isRateLimited(address: string) {
  const now = Date.now();
  const recent = (requestsByAddress.get(address) || []).filter((time) => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  requestsByAddress.set(address, recent);
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const name = plainText(input.name, 100);
    const email = plainText(input.email, 254).toLowerCase();
    const subject = plainText(input.subject, 160);
    const message = plainText(input.message, 5000);
    const company = plainText(input.company, 200);

    // Quietly accept submissions completed by basic form bots.
    if (company) return NextResponse.json({ message: "Your message has been sent to PDFRoot Support." });

    if (!name || !EMAIL_PATTERN.test(email) || !subject || message.length < 10) {
      return NextResponse.json({ message: "Please complete all fields with a valid email address." }, { status: 400 });
    }

    if (isRateLimited(requestAddress(request))) {
      return NextResponse.json({ message: "Too many messages were sent. Please wait a few minutes and try again." }, { status: 429 });
    }

    const smtpHost = process.env.CONTACT_SMTP_HOST || "smtp.titan.email";
    const smtpPort = Number(process.env.CONTACT_SMTP_PORT || 465);
    const smtpUser = process.env.CONTACT_SMTP_USER;
    const smtpPassword = process.env.CONTACT_SMTP_PASSWORD;
    const supportEmail = process.env.CONTACT_TO_EMAIL || smtpUser;

    if (!smtpUser || !smtpPassword || !supportEmail) {
      console.error("PDFRoot contact email environment variables are not configured.");
      return NextResponse.json({ message: "Support email is being configured. Please email support@pdfroot.com directly for now." }, { status: 503 });
    }

    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPassword },
    });

    const logoUrl = new URL("/branding/horizontal-logo.png", request.nextUrl.origin).toString();

    await transport.sendMail({
      from: { name: "PDFRoot Website", address: smtpUser },
      to: supportEmail,
      replyTo: { name, address: email },
      subject: `[PDFRoot Support] ${subject}`,
      text: `New PDFRoot support message\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`,
      html: `<div style="margin:0;background:#f5f5f5;padding:28px 12px;font-family:Arial,sans-serif;color:#111111"><div style="max-width:640px;margin:0 auto;border:1px solid #e5e7eb;border-radius:14px;background:#ffffff;overflow:hidden"><div style="padding:24px 28px;border-bottom:3px solid #c91d25"><img src="cid:pdfroot-logo" width="215" height="80" alt="PDFRoot" style="display:block;width:215px;height:auto;max-width:100%;border:0"></div><div style="padding:28px"><h2 style="margin:0 0 22px;font-size:22px;font-weight:600;color:#111111">New support message</h2><p style="margin:0 0 10px"><strong>Name:</strong> ${escapeHtml(name)}</p><p style="margin:0 0 10px"><strong>Email:</strong> ${escapeHtml(email)}</p><p style="margin:0 0 10px"><strong>Subject:</strong> ${escapeHtml(subject)}</p><hr style="margin:22px 0;border:0;border-top:1px solid #e5e7eb"><p style="margin:0;white-space:pre-wrap">${escapeHtml(message)}</p></div><div style="padding:16px 28px;background:#111111;color:#ffffff;font-size:12px">Sent from the PDFRoot website contact form.</div></div></div>`,
      attachments: [
        {
          filename: "pdfroot-logo.png",
          path: logoUrl,
          cid: "pdfroot-logo",
          contentDisposition: "inline",
        },
      ],
    });

    return NextResponse.json({ message: "Thank you. Your message has been sent to PDFRoot Support." });
  } catch (error) {
    console.error("PDFRoot contact form failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ message: "Your message could not be sent. Please try again or email support@pdfroot.com." }, { status: 500 });
  }
}
