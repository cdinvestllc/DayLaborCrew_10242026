# DayLaborCrew - PRD & Implementation Log

## Problem Statement
Full-stack upgrade of DayLaborCrew (communitylandscapeatlanta/DayLaborCrew_FourthDraft) on branch `admin-dashboard-upgrade`.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor), Python 3.11
- **Frontend**: React 19, Tailwind CSS, Craco, MapLibre GL JS
- **Auth**: JWT-based custom auth
- **Payments**: Stripe (Emergent) + PayPal graceful fallback
- **Email**: Resend via `email_utils.py`
- **PWA**: manifest.json + Service Worker v2 + VAPID Push

---

## Session 1 – Bugs + New Features
- Bug fixes (PayPal graceful fallback, admin messages archive, data-testid, coupon flow)
- PWA (manifest.json, SW, Add to Home Screen prompt)
- App Settings page (sound/vibration/push/analytics toggles)
- Verified Contractors page (MapLibre + clustering, list/map, admin CMS)
- "Our App" page linking to JobStack

## Session 2 – P1/P2 Backlog
- Stripe Verified Contractor Checkout ($39.99 one-time, idempotent)
- Admin Coupon Test UI (preview discount before sharing)
- VAPID Push notifications hooked into job_accepted + job_completed
- MapLibre GeoJSON cluster source (50+ pins)
- Service Worker v2 (background sync, stale-while-revalidate)

## Session 3 – Next Action Items (March 25, 2026)

### P1: Verified Contractor Confirmation Email
- Added `send_verified_contractor_email(email, name, company_name, fee)` to `email_utils.py`
- Called in `payment_routes.py` → `verified_contractor_status()` when `payment_status == "paid"` (fire-and-forget, no blocking)
- Branded HTML email: congratulations, explains verified benefits, links to /verified-contractors page

### P1: Crew Dashboard Push Notification Subscribe
- `PushNotifyWidget` component added directly above the default export in `CrewDashboard.jsx`
- Reads existing SW subscription state on mount (checks `pushManager.getSubscription()`)
- Three states: idle (enable button), subscribed (disable button), blocked (help text)
- On subscribe: requests browser permission → subscribes via SW → posts to `/api/users/push/subscribe`
- Renders in the right sidebar as a card (`data-testid="push-notify-widget"`)

### P2: Admin Revoke Verified Flow
- `VerifiedContractorsAdminSection` redesigned with **Revoke** / **Grant** action buttons
- Revoke opens a modal (`data-testid="revoke-modal"`) with a textarea for an optional revocation reason
- On confirm: `PUT /api/admin/verified-contractors/{id}` with `{is_verified_contractor: false, revoke_note: "..."}` 
- Backend stores `verified_revoked_at` and `verified_revoke_note` on user document
- Revocation email `send_revoke_verified_email(email, name, company_name, note)` sent automatically
- Revoke note shown in admin table under contractor's status

### Code Quality Fixes
- Fixed `list_users` admin role filter: when `role` param is passed and admin is `"admin"`, role filter is preserved (no longer overwritten to `{$ne: super_admin}`)

---

## Test Results
- Iteration 1: 95% → fixed → 100%
- Iteration 2: 100%
- Iteration 3: 100% (6/6 backend, all frontend)

---

## Credentials
- Admin: admin@thedaylaborers.com / Admin@123
- Super Admin: superadmin@thedaylaborers.com / SuperAdmin@123
- Contractor 1-3: contractor1-3@test.com / Test@1234
- Crew: testcrew@thedaylaborers.com / Crew@1234
- Test Coupon: `TEST20` (20% off all plans)

---

## Prioritized Backlog

### P0 (All Done)
Everything from Sessions 1-3 complete and tested.

### P1 (Next)
- Verified Contractor "Spotlight" weekly email to homeowners (high conversion)
- Crew push notification for newly posted jobs near their location

### P2 (Future)
- Verified contractor analytics (page views, profile clicks in admin)
- MapLibre satellite/terrain tile toggle on verified contractors page
- Bulk revoke/grant verified status (admin select all)

## Security Hardening (2026-06)
- HttpOnly/Secure/SameSite=Lax session cookie `tdl_session` + double-submit CSRF (`tdl_csrf` cookie → `X-CSRF-Token` header). Bearer still accepted for API clients.
- JWT: env-only secret (>=32 chars, fail on start), HS256 fixed, iss/aud/iat/nbf/exp/jti/tv/typ validated; DB role + active + token_version checked per request.
- Logout revokes jti (`revoked_tokens`, TTL); logout-all / reset / suspend / role change bump `token_version` and close WS.
- Reset tokens SHA-256 hashed, 1h TTL, atomic single-use; password policy 8-72 + upper/lower/digit/symbol.
- WS: POST /api/ws/ticket → wss /api/ws?ticket= (60s, single use). /api/ws/online-users admin only.
- Rate limits (slowapi, per-IP using TRUSTED_PROXY_HOPS) + per-account lockout (10 fails/15 min).
- Admin bootstrap only from strong env creds; admins can't grant admin/super_admin; OAuth blocked for admin roles.
- Uploads → Emergent object storage, served at /api/public/files/... (magic-byte validated, 5MB). Legacy /uploads migrated at startup.
- Tests: backend/tests/test_security.py (23 tests).
