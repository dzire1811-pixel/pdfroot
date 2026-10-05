# Beta 7 validation — 5 October 2026

This is a staged Preview rollout. PR #9 remains a draft; no Production merge,
database migration, installer publication, or updater release is recorded here.

## Evidence already collected

- The previous release's live ₹199 payment and 30-day renewal were successfully
  tested by the owner. Do not ask for another real payment to repeat that test.
- Resend's `pdfroot.com` sending domain is verified.
- Beta 7 Preview OTP delivery and verification returned HTTP 200.
- Trial creation returned HTTP 201 with a signed license and 14-day expiry.
- Repeating the same email/device returned HTTP 200 with the same license and expiry.
- The same email on another synthetic device returned HTTP 409.
- Another verified email on the original synthetic device returned HTTP 409.
- The seven schema tables were confirmed in the separate Neon Preview branch.
- Screenshots show newly added Test payment keys scoped to Preview and the old
  Production payment entries still present. Secret values were not inspected.

These browser tests use synthetic device IDs. They do not verify Windows
device identification, installer activation, or offline license enforcement.

## Database connection change

The initial OTP request returned HTTP 503 with a database connection timeout;
a later attempt succeeded after database activity. A cold-start delay is a
possible cause, not a confirmed root cause.

Login and payment now share one lazily created pool with a maximum of three
clients, a bounded 15-second connection timeout (previously five seconds), and
a handler for idle connection errors. Queries and payment/email operations are
not automatically replayed.

Local validation:

```sh
node --test tests/desktop-payment.test.mjs tests/desktop-database.test.mjs
```

Five tests passed, including a real `pg` connection against a local protocol
stub that delays startup for 5.5 seconds, then disconnects an idle client and
accepts a fresh connection. Strict TypeScript checking passed for the four
desktop backend modules. A full Next.js build was not run locally.

## Remaining Beta 7 checks

- Confirm a Preview request succeeds after Neon has suspended, without a manual
  warm-up. The local stub does not prove the hosted network issue is resolved.
- Check the newly introduced five-minute checkout expiry and late captured
  settlement in an isolated test setup. The earlier live payment is not evidence
  for these new behaviours; another real payment is not required.
- Build and test the Windows Beta 7 installer against Preview.
- Review and apply the additive schema migration to Production only as part of
  the eventual Production rollout. Do not change the existing Live keys.
