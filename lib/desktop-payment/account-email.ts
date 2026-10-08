import nodemailer from "nodemailer";

type Environment = NodeJS.ProcessEnv;
export type AccountEmail = { to: string; subject: string; text: string; html: string };

function smtp(env: Environment) {
  return nodemailer.createTransport({ host: env.CONTACT_SMTP_HOST || "smtp.titan.email",
    port: Number(env.CONTACT_SMTP_PORT || 465), secure: Number(env.CONTACT_SMTP_PORT || 465) === 465,
    auth: { user: env.CONTACT_SMTP_USER, pass: env.CONTACT_SMTP_PASSWORD },
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 8000 });
}

export function accountEmailConfigured(env: Environment): boolean {
  return Boolean((env.CONTACT_SMTP_USER && env.CONTACT_SMTP_PASSWORD) ||
    (env.RESEND_API_KEY && env.PDFROOT_LOGIN_FROM));
}

export async function sendAccountEmail(message: AccountEmail, env: Environment): Promise<void> {
  if (env.CONTACT_SMTP_USER && env.CONTACT_SMTP_PASSWORD) {
    const transport = smtp(env);
    try { await transport.sendMail({ ...message, from: { name: "PDFRoot", address: env.CONTACT_SMTP_USER } }); }
    finally { transport.close(); }
    return;
  }
  if (!env.RESEND_API_KEY || !env.PDFROOT_LOGIN_FROM) throw new Error("Desktop email delivery is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...message, from: env.PDFROOT_LOGIN_FROM, to: [message.to] }),
  });
  if (!response.ok) throw new Error("Desktop email delivery failed");
}

export async function verifyAccountEmailTransport(env: Environment): Promise<void> {
  if (env.CONTACT_SMTP_USER && env.CONTACT_SMTP_PASSWORD) {
    const transport = smtp(env);
    try { await transport.verify(); } finally { transport.close(); }
    return;
  }
  if (!env.RESEND_API_KEY || !env.PDFROOT_LOGIN_FROM) throw new Error("Desktop email delivery is not configured");
  const response = await fetch("https://api.resend.com/domains", {
    signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  });
  if (!response.ok) throw new Error("Desktop email delivery is unavailable");
}
