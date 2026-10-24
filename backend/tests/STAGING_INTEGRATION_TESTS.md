# Running legacy backend integration tests safely

These suites call a running API and some create/delete test jobs, edit seeded contractor verification, update admin fee settings, and write directly to MongoDB. Run them only against a dedicated staging deployment and its isolated database. Do not use the shared `*.preview.emergentagent.com` API.

## GitHub Actions setup

Create/configure the GitHub Actions environment named `staging` under repository Settings → Environments. Protect it with approval if appropriate. Populate the following environment variables and secrets. Use disposable seeded test users and test-only payment credentials; do not use production users, databases, or payment keys.

Required environment variables:
- `STAGING_API_URL`: HTTPS origin for the dedicated API, with a hostname containing `staging`, `stage`, `stg`, or `test`; no path.
- `STAGING_WEB_ORIGIN`: HTTPS origin allowed by staging CORS; hostname marked as staging/test; no path.
- `STAGING_MONGO_HOST`: exact hostname of the isolated staging MongoDB deployment.
- `STAGING_DB_NAME`: dedicated database name containing `staging`, `stage`, `stg`, or `test`.
- `STAGING_STRIPE_MODE`: exactly `test`.
- `STAGING_SUPERADMIN_EMAIL`, `STAGING_ADMIN_EMAIL`, `STAGING_CONTRACTOR1_EMAIL`, `STAGING_CONTRACTOR2_EMAIL`, `STAGING_CONTRACTOR3_EMAIL`, `STAGING_CREW_EMAIL`, `STAGING_CREW2_EMAIL`: seeded non-production account emails.

Required environment secrets:
- `STAGING_MONGO_URL`: restricted-access URI to the same isolated database the staging API uses.
- `STAGING_JWT_SECRET_KEY`: staging API JWT signing secret (at least 32 characters).
- `STAGING_SUPERADMIN_PASSWORD`, `STAGING_ADMIN_PASSWORD`, `STAGING_CONTRACTOR1_PASSWORD`, `STAGING_CONTRACTOR2_PASSWORD`, `STAGING_CONTRACTOR3_PASSWORD`, `STAGING_CREW_PASSWORD`, `STAGING_CREW2_PASSWORD`: credentials for those seeded accounts.

Optional sandbox payment secrets (validated when present; live keys are refused):
- `STAGING_STRIPE_API_KEY`: Stripe **test-mode** secret key (`sk_test_`/`rk_test_`). Used to verify the webhook endpoint below.
- `STAGING_STRIPE_WEBHOOK_SECRET`: signing secret (`whsec_`) of the test-mode webhook endpoint. Must equal the staging API's `STRIPE_WEBHOOK_SECRET`; enables the signed-webhook tests.
- `STAGING_STRIPE_WEBHOOK_ENDPOINT_ID`: id (`we_`) of that endpoint. The workflow checks it is enabled, test mode, points at `STAGING_API_URL/api/payments/stripe/webhook`, and subscribes to `checkout.session.completed` + `checkout.session.async_payment_succeeded`.
- `STAGING_PAYPAL_CLIENT_ID`, `STAGING_PAYPAL_SECRET`: PayPal **sandbox** app credentials (set both or neither). When set, the PayPal tests expect real sandbox orders instead of "not configured".
- `STAGING_PAYPAL_WEBHOOK_ID`: sandbox webhook id pointing at `STAGING_API_URL/api/payments/paypal/webhook` with `PAYMENT.CAPTURE.COMPLETED`.

These must match the staging API's own `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_WEBHOOK_ID` (with `STRIPE_MODE=test`, `PAYPAL_MODE=sandbox`).

## Creating the staging copy (Emergent)

1. Create a MongoDB Atlas cluster whose name contains `staging` (e.g. `daylabor-staging` → host `daylabor-staging.xxxxx.mongodb.net`). Create a database user, and allow GitHub Actions runners in Network Access (runner IPs change, so this usually means `0.0.0.0/0` with a strong, staging-only password).
2. Import this GitHub repo into a **new** Emergent project and deploy it (separate deployment, separate secrets).
3. In that deployment's Secrets set: `MONGO_URL` (Atlas URI), `DB_NAME=daylaborcrew_staging`, `JWT_SECRET_KEY` (= `STAGING_JWT_SECRET_KEY`), `CORS_ORIGINS` and `FRONTEND_URL` = `https://staging.thedaylaborers.com`, `SEED_DEMO_ACCOUNTS=false`, `STRIPE_MODE=test` + test Stripe/PayPal sandbox values, and `SUPER_ADMIN_*` / `ADMIN_*` = the staging staff accounts.
4. Connect the custom domain `staging.thedaylaborers.com` (the default `*.emergent.host` name has no staging marker and is rejected by the gate).
5. Seed the Atlas database with `python backend/scripts/seed_staging.py --reset` using the `STAGING_*` values, then `--check`.
6. Add the variables/secrets to the GitHub `staging` environment and run the workflow.

Also configure the staging deployment itself to use that database, the same JWT secret, and sandbox Stripe settings. The workflow validates the declared target, pinned Mongo host, database name and Stripe mode before attempting a test. The suites must not be run concurrently against one staging database because the security suite uses a cleanup prefix and other tests modify shared seeded-account state.

## One-command seeding (`backend/scripts/seed_staging.py`)

The script reads the same `STAGING_*` names as the workflow and creates everything listed in the next section, then prints a pass/fail checklist:

```bash
export STAGING_MONGO_URL="<staging Mongo URI>"  STAGING_MONGO_HOST="<its host>"  STAGING_DB_NAME=daylaborcrew_staging
export STAGING_SUPERADMIN_EMAIL=... STAGING_SUPERADMIN_PASSWORD=... STAGING_ADMIN_EMAIL=... STAGING_ADMIN_PASSWORD=...
# optional: STAGING_CONTRACTOR{1,2,3}_EMAIL/_PASSWORD, STAGING_CREW_EMAIL/_PASSWORD, STAGING_CREW2_EMAIL/_PASSWORD
# (defaults: contractorN@test.com / Test@1234, testcrew[2]@thedaylaborers.com / Crew@1234)
python backend/scripts/seed_staging.py --reset   # fresh DB; omit --reset to re-assert idempotently
python backend/scripts/seed_staging.py --check   # verify only
```

It refuses to run unless the DB name and Mongo host carry a staging/stage/stg/test marker (use `--allow-localhost` only for a local rehearsal), rejects emails the login API would refuse (e.g. `*.test` domains) and passwords that fail the password policy. Staff passwords must contain upper/lower case, a number and a symbol. If you use non-default contractor/crew emails, set `SEED_DEMO_ACCOUNTS=false` on the staging API so its startup doesn't add the default demo accounts too.

## Seed-data prerequisites

Seed the staging database with the seven accounts above and the minimum fixtures expected by the legacy tests:
- At least three demo jobs for each contractor test account, including Atlanta-area coordinates.
- At least three Atlanta-area jobs available to the crew account.
- An in-progress `Drywall Hanging` job assigned to the `CREW2` test account.
- The `TEST20` coupon and plan settings used by the legacy subscription/coupon assertions.
- A disposable `CONTRACTOR1` account whose verified-contractor flag can be revoked and restored by the integration test.

Use a fresh or resettable staging dataset. The integration suite intentionally writes job records, updates admin fee settings, revokes/restores contractor verification, and creates pending payment/session records. The additional payment regression suites (`test_iteration8_payments_e2e.py` and `test_iteration9_payment_fixes.py`) also create unpaid test checkouts. They now read API/web origins, seeded account credentials, and Mongo settings only from the guarded `STAGING_*` configuration; run them only from the manual staging workflow, never against the shared preview. Do not overlap these suites with manual testers or other runs.

## Run

After the environment and seed data are configured, open Actions → **Legacy Backend Integration Tests (Staging)** → Run workflow, choose the branch `fix/payment-webhook-security-2026-10`, check `confirm_staging`, and start the run. The workflow is manual-only so normal pushes do not attempt destructive integration tests before staging has been provisioned.
