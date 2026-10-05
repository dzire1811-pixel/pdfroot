# Five-minute checkout cancellation — not yet enabled for customers

The owner chose to retain a five-minute checkout window on 5 October 2026.
Razorpay's current Standard Payment Link documentation describes a minimum
15-minute future expiry. Passing the app's five-minute timestamp directly to
`expire_by` can therefore reject link creation.

References:
- https://razorpay.com/docs/api/payments/payment-links/create-standard/
- https://razorpay.com/docs/api/payments/payment-links/cancel-standard/
- https://vercel.com/docs/cron-jobs/usage-and-pricing

## Prepared implementation

- Beta 7 clients receive a five-minute application deadline.
- Razorpay receives a 20-minute fallback expiry, safely above its minimum.
- An authenticated status poll at or after the app deadline cancels the unpaid
  link. Confirmed closure is persisted in `desktop_checkout.cancelled_at`.
- Failed cancellation remains retryable and is not marked as successful.
- A protected worker at `/v1/internal/expire-checkouts` closes due links even
  when the desktop app has stopped polling. It accepts GET with
  `Authorization: Bearer <CRON_SECRET>`; the secret must have at least 32 characters.
  Up to ten due links are handled per invocation. Retry responses use HTTP 503.
- A full captured-payment webhook remains the only path to issuing a paid
  license. Late confirmed payment is honored; duplicates do not extend it twice.
- Beta 6 checkouts without an expiry remain compatible.

## Deployment blockers

This worker endpoint is code, not a configured scheduler. A durable delayed job
or sufficiently frequent authenticated scheduler is required before making any
five-minute gateway-closure promise. Network latency and job delays must be
measured. Without a running worker or desktop polling, a link may remain payable
until its 20-minute gateway fallback; the UI deadline alone does not close it.

The current Vercel project was shown on Hobby. Its built-in cron runs at most
daily, so it cannot provide the five-minute requirement. Do not add a once-per-
minute Vercel cron to this project: deployment would fail on Hobby. No paid plan,
external scheduling account, or new secret has been configured by this change.
Prefer a delayed job per checkout rather than continuously polling an idle Neon
database. Verify cancellation with the app closed and retry handling before
customer release.

Apply the additive schema (`cancelled_at` and its partial index) in a separate
Preview database before testing this branch's hosted API. Do not replace the
working Beta 7 Preview or merge into Production before migration and scheduling
are ready. Existing Live payment keys must remain unchanged.

## Installer evidence

The saved `PDFRoot-Desktop-Pro-Beta7-Trial-Login-Build-Kit.zip` was inspected.
Its package version is `0.7.0-beta.7`; its configured API points at
`https://www.pdfroot.com`. It contains source and Windows build commands, not
the compiled installer. After installing runtime dependencies, all 55 included
Node tests passed on Linux, including trial expiry and late-payment activation.
This does not verify Electron UI, Windows shortcuts, machine identification,
or an installed Windows executable.

For a Windows Preview build, set `resources/payment-api.json` to the verified
Preview backend and run `BUILD-WINDOWS-INSTALLER.cmd`. The executable, blockmap,
and `beta.yml` are produced under `desktop/resources/app/release`. Validate on
Windows before publishing these assets or changing the website download link.
No additional real-money transaction is needed to repeat the earlier successful
payment and renewal checks.

## Local service tests

`node --test tests/desktop-payment.test.mjs tests/desktop-database.test.mjs tests/desktop-checkout-expiry.test.mjs`

The expiry tests run the actual service modules and schema against isolated
PostgreSQL in WASM. Only Razorpay's network responses and advisory locks are
substituted. They verify the deadline boundary, cancellation, retry behavior,
worker authorization, legacy compatibility, and signed late-payment settlement.
They do not verify real gateway requests, scheduler delivery, hosted Neon, or
concurrent database sessions.
