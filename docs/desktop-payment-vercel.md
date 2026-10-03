# Desktop Pro payment handoff (test mode first)

This branch prepares an API for the Beta3 Desktop Pro payment client. **It is not live yet.** Beta2 remains the public download with manual activation. The agreed price is **₹199 per 30 days** (`MONTHLY_PRICE_PAISE=19900`). This is a one-time Payment Link per renewal, not an automatic recurring debit.

## Setup before releasing Beta3

1. Set up a Razorpay merchant account and use its **Test Mode** key ID and secret. Enable Payment Links and create a webhook subscribing to `payment_link.paid` at `https://www.pdfroot.com/v1/razorpay/webhook`. Set a separate webhook secret.
2. Provision managed PostgreSQL (for example Neon through Vercel Marketplace) and connect its pooled `DATABASE_URL` to the website project. Apply [desktop-payment-schema.sql](desktop-payment-schema.sql) in that database. Do not put credentials in Git.
3. Generate an Ed25519 signing key pair securely. Put its private PKCS#8 PEM in the website's `LICENSE_PRIVATE_KEY_PEM` secret environment variable. Package **only the matching public PEM** in Desktop Pro. Never put the private key in the installer or repository.
4. In the **preview/test** Vercel environment set `DATABASE_URL`, `MONTHLY_PRICE_PAISE=19900`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `LICENSE_PRIVATE_KEY_PEM`. The API returns 503 while these are absent. Keep production payment variables unset until live validation.
5. Build Beta3 from the developer kit with `resources/payment-api.json` containing the deployed HTTPS `baseUrl` and the matching public key. Complete a Test Mode payment. Verify webhook delivery, automatic activation (desktop polls every 5 seconds while running), exact 30-day expiry, renewal while time remains, and a second Windows installation before publishing the installer.
6. Switch to Razorpay **Live Mode** keys/webhook only after merchant approval and a real small end-to-end transaction. Then publish the configured Beta3 installer and update the website download link. Refund/chargeback handling, customer support, and clock rollback resistance need decisions before commercial rollout.

### API

The desktop sends `POST /v1/checkout` with `{deviceId, customerName}` and saves the returned checkout ID, bearer token, and Payment Link. It polls `GET /v1/status?checkoutId=...`. The webhook checks its raw-body HMAC and the captured full INR payment. The database transaction locks the checkout and device, issues a signed device-bound `PDR1` code, and extends expiry from the later of payment time or current expiry. Replayed events cannot extend the licence twice. This is a 30-day access period, not a promise that all PDFs finish in 1–2 seconds.

The desktop currently evaluates the licence against the local PC clock. A customer can alter that clock, so this is not yet robust tamper-resistant licensing. Keep manual customer support and transaction review available during the beta.
