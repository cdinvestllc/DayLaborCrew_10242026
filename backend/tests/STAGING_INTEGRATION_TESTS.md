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

Also configure the staging deployment itself to use that database, the same JWT secret, and sandbox Stripe settings. The workflow validates the declared target, pinned Mongo host, database name and Stripe mode before attempting a test. The suites must not be run concurrently against one staging database because the security suite uses a cleanup prefix and other tests modify shared seeded-account state.

## Run

After the environment is configured, open Actions → **Legacy Backend Integration Tests (Staging)** → Run workflow, choose the branch `fix/payment-webhook-security-2026-10`, check `confirm_staging`, and start the run. The workflow is manual-only so normal pushes do not attempt destructive integration tests before staging has been provisioned.
