# Five-minute checkout cancellation — not yet enabled for customers

The owner chose to retain a five-minute checkout window on 5 October 2026.
Razorpay's current Standard Payment Link documentation describes a minimum
15-minute future expiry. Passing the app's five-minute timestamp directly to
`expire_by` can therefore reject link creation.

References:
- https://razorpay.com/docs/api/payments/payment-links/create-standard/
- https://razorpay.com/docs/api/payments/payment-links/cancel-standard/
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/queues/quickstart
- https://vercel.com/docs/queues/concepts
- https://vercel.com/docs/queues/pricing

## Prepared implementation

- Beta 7 clients receive a five-minute application deadline.
- Razorpay receives a 20-minute fallback expiry, safely above its minimum.
- An authenticated status poll at or after the app deadline cancels the unpaid
  link. Confirmed closure is persisted in `desktop_checkout.cancelled_at`.
- Failed cancellation remains retryable and is not marked as successful.
- Each Beta 7 link gets a delayed Vercel Queue message before its URL is returned.
  Only the checkout ID is queued. The stored Postgres deadline controls closure.
  A failed publish withholds the URL and attempts immediate provider cancellation.
- The private queue consumer is wired by `vercel.json`; Vercel invokes it after
  the deadline even if the desktop app is closed. Early deliveries are retried,
  duplicate deliveries are safe, and failed cancellation retries after 15 seconds.
  Messages are retained for one hour with at most 50 deliveries. Each deployment
  consumes its own messages, using its own database and payment configuration.
- A protected worker at `/v1/internal/expire-checkouts` closes due links even
  when the desktop app has stopped polling. It accepts GET with
  `Authorization: Bearer <CRON_SECRET>`; the secret must have at least 32 characters.
  Up to ten due links are handled per invocation. Retry responses use HTTP 503.
- A full captured-payment webhook remains the only path to issuing a paid
  license. Late confirmed payment is honored; duplicates do not extend it twice.
- Beta 6 checkouts without an expiry remain compatible.

## Hosted validation gates

The primary scheduler is now a delayed Vercel Queue job per checkout. Vercel
authenticates the producer automatically on deployment, and the configured
consumer has no public URL. No external scheduler account, new credential or
paid-plan change is required by this implementation. The existing protected
batch worker is an optional operator recovery path, not a required cron job.

Build success and local tests do not prove hosted queue delivery. Verify a real
Test Mode link with desktop polling stopped, measure provider closure relative
to the stored five-minute deadline, and verify retries before customer release.
Do not promise exact-to-the-second gateway closure: delivery and provider
network latency can delay cancellation. The provider's 20-minute expiry remains
a fallback during an outage. Honor signed captured payments even if cancellation
and payment raced; an unpaid/expired status alone never issues a paid license.

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
