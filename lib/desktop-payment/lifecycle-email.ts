import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { db } from "./db";
import { PAID_NAME, TRIAL_NAME } from "./plan";

type Kind = "trial_started" | "trial_3" | "trial_1" | "trial_expired" |
  "paid_started" | "paid_renewed" | "paid_7" | "paid_3" | "paid_1" | "paid_expired";
type Event = {
  event_key: string; email: string; kind: Kind; subject_ref: string;
  started_at: Date; expires_at: Date; amount_paise: number | null;
  status: string; first_attempt_at: Date | null;
};

const put = (client: PoolClient, key: string, email: string, kind: Kind, ref: string,
  start: Date, end: Date, amount: number | null = null) => client.query(
  `INSERT INTO desktop_email_event(event_key,email,kind,subject_ref,started_at,expires_at,amount_paise)
   VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_key) DO NOTHING`,
  [key,email,kind,ref,start,end,amount]);

export async function enqueueTrialEmail(client: PoolClient, trial: {
  email: string; device: string; startedAt: Date; expiresAt: Date;
}) {
  await put(client, `trial:${trial.email}`, trial.email, "trial_started", trial.device, trial.startedAt, trial.expiresAt);
}

export async function enqueuePaidEmail(client: PoolClient, paid: {
  checkoutId: string; email: string; amountPaise: number; activatedAt: Date; expiresAt: Date; renewal: boolean;
}) {
  await put(client, `paid:${paid.checkoutId}`, paid.email, paid.renewal ? "paid_renewed" : "paid_started",
    paid.checkoutId, paid.activatedAt, paid.expiresAt, paid.amountPaise);
}

// Vercel's daily cron invokes this on Production. The same authenticated
// function can be run against an isolated Preview while validating its schema.
export async function queueDueReminders(now = new Date()): Promise<number> {
  const client = await db().connect();
  let queued = 0;
  try {
    await client.query("BEGIN");
    const trial = await client.query(
      `SELECT t.email,t.device_hash,t.started_at,t.expires_at FROM desktop_trial t
       WHERE (t.expires_at AT TIME ZONE 'Asia/Kolkata')::date
         BETWEEN ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date - 1
         AND ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date + 3
       AND NOT EXISTS (SELECT 1 FROM desktop_device_license d JOIN desktop_checkout c
         ON c.device_hash=d.device_hash AND c.customer_email=t.email AND c.state='paid'
         WHERE d.device_hash=t.device_hash AND d.expires_at > $1)
       LIMIT 500`, [now]);
    const localDay = (date: Date) => {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata",
        year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
      const part = (type: string) => parts.find(item => item.type === type)!.value;
      return `${part("year")}-${part("month")}-${part("day")}`;
    };
    const today = Date.parse(localDay(now) + "T00:00:00Z");
    for (const row of trial.rows) {
      const days = Math.round((Date.parse(localDay(new Date(row.expires_at)) + "T00:00:00Z") - today) / 86_400_000);
      if (![3,1].includes(days) && !(days <= 0 && new Date(row.expires_at) <= now)) continue;
      const kind = (days <= 0 ? "trial_expired" : `trial_${days}`) as Kind;
      await put(client, `trial:${row.email}:${kind}`, row.email, kind, row.device_hash,
        new Date(row.started_at), new Date(row.expires_at));
      queued++;
    }
    const paid = await client.query(
      `SELECT d.device_hash,d.expires_at,c.customer_email,c.amount,c.paid_at
       FROM desktop_device_license d JOIN LATERAL (
         SELECT customer_email,amount,paid_at FROM desktop_checkout
         WHERE device_hash=d.device_hash AND state='paid' AND customer_email IS NOT NULL
         ORDER BY paid_at DESC LIMIT 1
       ) c ON true
       WHERE (d.expires_at AT TIME ZONE 'Asia/Kolkata')::date
         BETWEEN ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date - 1
         AND ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date + 7
       LIMIT 500`, [now]);
    for (const row of paid.rows) {
      const days = Math.round((Date.parse(localDay(new Date(row.expires_at)) + "T00:00:00Z") - today) / 86_400_000);
      if (![7,3,1].includes(days) && !(days <= 0 && new Date(row.expires_at) <= now)) continue;
      const kind = (days <= 0 ? "paid_expired" : `paid_${days}`) as Kind;
      const end = new Date(row.expires_at);
      await put(client, `paid:${row.device_hash}:${end.toISOString()}:${kind}`, row.customer_email, kind,
        row.device_hash, new Date(row.paid_at), end, row.amount);
      queued++;
    }
    await client.query("COMMIT");
    return queued;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

function date(value: Date) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" }).format(value);
}
function escape(value: string) {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
export function renderLifecycleEmail(event: Event) {
  const trial = event.kind.startsWith("trial");
  const plan = trial ? TRIAL_NAME : PAID_NAME;
  const amount = trial ? "₹0" : `₹${((event.amount_paise || 0) / 100).toFixed(2)}`;
  const titles: Record<Kind,string> = {
    trial_started: "Welcome to PDFRoot Desktop Pro – Your 14-Day Free Trial Has Started",
    trial_3: "Your PDFRoot Desktop Pro Trial Ends in 3 Days",
    trial_1: "Your PDFRoot Desktop Pro Trial Ends Tomorrow",
    trial_expired: "Your PDFRoot Desktop Pro Free Trial Has Ended",
    paid_started: "Your PDFRoot Desktop Pro Plan Is Active",
    paid_renewed: "PDFRoot Desktop Pro Renewal Successful",
    paid_7: "Your PDFRoot Desktop Pro Plan Expires in 7 Days",
    paid_3: "Your PDFRoot Desktop Pro Plan Expires in 3 Days",
    paid_1: "Your PDFRoot Desktop Pro Plan Expires Tomorrow",
    paid_expired: "Your PDFRoot Desktop Pro Plan Has Expired",
  };
  const subject = titles[event.kind];
  const opening = event.kind === "trial_started" ? "Welcome to PDFRoot Desktop Pro. Your 14-day free trial is active."
    : event.kind === "paid_started" ? "Your payment is confirmed and your plan is active."
    : event.kind === "paid_renewed" ? "Your renewal payment is confirmed and your plan has been extended."
    : event.kind.endsWith("expired") ? "Your plan has ended. Renew to continue using premium tools."
    : "Your plan expires soon. Renew for uninterrupted access.";
  const label = trial ? "Trial expiry" : "Valid until";
  const rows = [["Email", event.email], ["Plan", plan], ["Price / amount paid", amount],
    ["Activated", date(new Date(event.started_at))], [label, date(new Date(event.expires_at))],
    ["Status", event.kind.endsWith("expired") ? "Expired" : "Active"]];
  const cta = event.kind === "trial_started" || event.kind === "paid_started" || event.kind === "paid_renewed"
    ? "Open PDFRoot Desktop Pro" : "Renew / Upgrade Now";
  const safeRows = rows.map(([key,value]) => `<tr><td style="padding:9px 0;color:#667085">${escape(key)}</td><td style="padding:9px 0;text-align:right;color:#182230;font-weight:600">${escape(value)}</td></tr>`).join("");
  const url = "https://www.pdfroot.com/desktop-pro";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#182230"><div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #eaecf0;border-radius:12px;padding:28px"><img src="https://www.pdfroot.com/pdfroot-logo-wide.png" alt="PDFRoot" width="170" style="max-width:100%;height:auto"><h1 style="font-size:24px;line-height:1.3;margin:24px 0 12px">${escape(subject)}</h1><p style="line-height:1.6">${escape(opening)}</p><table style="width:100%;border-collapse:collapse">${safeRows}</table><p style="margin:26px 0"><a href="${url}" style="background:#be1e20;color:#fff;text-decoration:none;padding:13px 18px;border-radius:7px;font-weight:600">${escape(cta)}</a></p><p style="line-height:1.6;color:#667085">Thank you for choosing PDFRoot Desktop Pro.</p><p>Team PDFRoot</p></div></body></html>`;
  return { subject, html, text: `${opening}\n${rows.map(([key,value]) => `${key}: ${value}`).join("\n")}\n${cta}: ${url}\nTeam PDFRoot` };
}

async function stillCurrent(event: Event): Promise<boolean> {
  if (event.kind === "trial_started" || event.kind === "paid_started" || event.kind === "paid_renewed") return true;
  const now = Date.now();
  if (event.kind.endsWith("expired")) {
    if (new Date(event.expires_at).getTime() > now) return false;
  } else {
    const days = Number(event.kind.split("_").at(-1));
    const indianDay = (value: Date) => new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(value).reduce((result, part) => {
      if (part.type === "year" || part.type === "month" || part.type === "day") result[part.type] = part.value;
      return result;
    }, {} as Record<string,string>);
    const end = indianDay(new Date(event.expires_at));
    const today = indianDay(new Date(now));
    const utcDay = (part: Record<string,string>) => Date.UTC(Number(part.year),Number(part.month)-1,Number(part.day));
    if ((utcDay(end)-utcDay(today))/86_400_000 !== days) return false;
  }
  if (event.kind.startsWith("trial")) {
    const row = await db().query(
      `SELECT 1 FROM desktop_trial t WHERE t.email=$1 AND t.device_hash=$2 AND t.expires_at=$3
       AND NOT EXISTS (SELECT 1 FROM desktop_device_license d JOIN desktop_checkout c
         ON c.device_hash=d.device_hash AND c.customer_email=t.email AND c.state='paid'
         WHERE d.device_hash=t.device_hash AND d.expires_at > now())`,
      [event.email,event.subject_ref,event.expires_at]);
    return Boolean(row.rowCount);
  }
  const row = await db().query("SELECT 1 FROM desktop_device_license WHERE device_hash=$1 AND expires_at=$2", [event.subject_ref,event.expires_at]);
  return Boolean(row.rowCount);
}

export async function deliverEmailEvent(key: string): Promise<"sent" | "skipped" | "failed"> {
  const client = await db().connect();
  let event: Event | undefined;
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT * FROM desktop_email_event WHERE event_key=$1 FOR UPDATE SKIP LOCKED", [key]);
    event = result.rows[0];
    if (!event || ["sent","suppressed","uncertain"].includes(event.status) ||
      (event.status === "processing" && event.first_attempt_at && Date.now() - new Date(event.first_attempt_at).getTime() < 5*60_000)) {
      await client.query("COMMIT"); return "skipped";
    }
    if (event.first_attempt_at && Date.now() - new Date(event.first_attempt_at).getTime() >= 23*60*60_000) {
      await client.query("UPDATE desktop_email_event SET status='uncertain',last_error='Provider idempotency window elapsed; manual review required' WHERE event_key=$1",[key]);
      await client.query("COMMIT"); return "skipped";
    }
    if (!(await stillCurrent(event))) {
      await client.query("UPDATE desktop_email_event SET status='suppressed' WHERE event_key=$1",[key]);
      await client.query("COMMIT"); return "skipped";
    }
    await client.query("UPDATE desktop_email_event SET status='processing',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,now()) WHERE event_key=$1",[key]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }

  if (!event) return "skipped";
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.PDFROOT_LOGIN_FROM;
    if (!apiKey || !from) throw new Error("Email provider is not configured");
    const rendered = renderLifecycleEmail(event);
    const idempotencyKey = crypto.createHash("sha256").update(event.event_key).digest("hex");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from, to: [event.email], ...rendered }),
    });
    if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`);
    const data = await response.json() as { id?: string };
    await db().query("UPDATE desktop_email_event SET status='sent',provider_id=$2,sent_at=now(),last_error=NULL WHERE event_key=$1 AND status='processing'",[key,typeof data.id === "string" ? data.id : null]);
    return "sent";
  } catch (error) {
    await db().query("UPDATE desktop_email_event SET status='failed',last_error=$2 WHERE event_key=$1 AND status='processing'",[key,error instanceof Error ? error.message.slice(0,180) : "Email provider failed"]);
    return "failed";
  }
}

export async function deliverPendingEmails(limit = 40) {
  const rows = await db().query(
    "SELECT event_key FROM desktop_email_event WHERE status IN ('pending','failed') OR (status='processing' AND first_attempt_at < now()-interval '5 minutes') ORDER BY created_at LIMIT $1",[limit]);
  const results = { sent: 0, failed: 0, skipped: 0 };
  for (const row of rows.rows) {
    try { results[await deliverEmailEvent(row.event_key)]++; }
    catch { results.failed++; console.error("PDFRoot lifecycle email: event processing failed."); }
  }
  return results;
}
