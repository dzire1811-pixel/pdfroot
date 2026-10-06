# Desktop Pro lifecycle email rollout

Resend already sends sign-in OTPs from PDFRoot's verified domain. This change
reuses `RESEND_API_KEY` and `PDFROOT_LOGIN_FROM` for branded HTML and plain-text
trial, payment and renewal mail. The image URL points to the existing public
`https://www.pdfroot.com/pdfroot-logo-wide.png` asset. No OTP, signing key,
checkout token, or license code is included in these messages.

## Before Preview deployment

Run the additive statements in `docs/desktop-payment-schema.sql` against **only
the Preview deployment's own Neon branch**. The migration backfills
`desktop_trial.started_at` from the existing expiry and adds
`desktop_email_event`. Apply it before deploying the changed handlers.
Do not run it against Production until the production rollout.

Set `CRON_SECRET` to a new random 32+ character value in Vercel. The existing
Resend sending variables and monthly price must be scoped to the chosen Preview
branch. Keep the existing live Razorpay entries untouched. Do not paste secrets
in PRs, screenshots, or support messages. `PAYMENT_MODE=test` and a matching
Test key must be used for Preview checkout verification.

The daily Vercel cron runs at `02:30 UTC` (08:00 IST), with Hobby timing within
that hour. Vercel only invokes cron for Production. In Preview, an operator
can invoke `GET /v1/internal/lifecycle-email` with its scoped `CRON_SECRET` as a
Bearer token to exercise the exact same path. The endpoint returns aggregate
counts only. No customer email addresses appear in logs or the response.

## Event and retry behaviour

- Trial starts once per verified email and computer; repeat start returns the
  existing signed license and expiry. A unique `trial:<email>` event sends one
  welcome message. Login itself never resends it.
- A verified full captured payment extends the existing device license in the
  webhook transaction. A matching immutable event is committed with the
  license and sent afterwards. Email failure leaves that payment and license
  active. Repeated webhook delivery is ignored.
- Daily reminders are keyed by account/term/day. Trial: 3 days, 1 day,
  expired. Paid: 7 days, 3 days, 1 day, expired. Dates use Asia/Kolkata;
  the backend/database determine expiry. Renewed terms suppress old pending
  reminders. The daily job continues after an individual email failure.
- The database record serializes sends and Resend's Idempotency-Key covers
  retries for 24 hours. If delivery remains ambiguous near the end of that
  window, the event is marked `uncertain` for operator review rather than
  automatically risking a second email. Provider IDs and small failure
  summaries are recorded; the full email and secrets are not stored.

## Validation gate

Local PostgreSQL-WASM tests cover trial reuse, account summary, one-time
welcome/reminder, signed payment, renewal extension, failed-email retry and
duplicate webhook delivery. They do not verify Resend delivery, actual Vercel
cron scheduling, Razorpay Test webhook delivery, Windows display scaling or a
closed-app end-to-end flow. Run those against an isolated Preview before
publishing the Beta 7 installer. Avoid a second real ₹199 payment.
