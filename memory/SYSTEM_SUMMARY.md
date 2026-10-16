# TheDayLaborers (DayLaborCrew) - System Summary

Source: https://github.com/cdinvestllc/DayLaborCrew_New10162026v2 (branch `main`, HEAD 41fbbd7).
Workspace /app already matched the repo; only workspace-specific preview URLs differ (kept as-is).

## What it is
On-demand blue-collar workforce marketplace. Contractors post day-labor jobs, crew members find/accept them in real time, admins run the platform. Branding: "TheDayLaborers - A Blue Collar ME Company".

## Stack
- Backend: FastAPI (Python 3.11) + Motor/MongoDB, all routes under `/api`
- Frontend: React 19 (CRA + Craco), Tailwind + shadcn/ui, react-router 7, MapLibre GL / Leaflet, recharts, sonner
- PWA: manifest.json, service worker `public/sw.js`, VAPID web push

## Directory layout
```
backend/
  server.py        app setup, env checks, CORS, security headers, startup (indexes, storage init, legacy migrations, admin bootstrap, default settings/trades/CMS)
  auth.py          JWT (HS256, iss/aud/jti/token_version), cookie session + CSRF, bcrypt, password policy, rate limiter (slowapi), role guards
  database.py      Mongo client (MONGO_URL, DB_NAME)
  models.py        Pydantic request/response models
  routes/
    auth_routes.py       register, login, logout(-all), forgot/reset password, Emergent Google OAuth callback, convert-to-contractor
    job_routes.py        job CRUD + lifecycle, ratings, contact, AI crew match, invites, notifications
    user_routes.py       profile, photo/portfolio uploads, location, crew search, favorites, referrals/points, messages, privacy, preferences, push subscribe
    admin_routes.py      analytics, users/jobs mgmt, trades, CMS, settings, coupons, bulk email, messages, import/export, seed, verified contractors, rating moderation, activity log
    payment_routes.py    plans, Stripe (emergentintegrations) + PayPal checkout, subscriptions, job boost, verified-contractor fee, contact unlock, guest job checkout, coupons
    public_routes.py     public CMS, trades, settings, verified contractors, files (object storage proxy), geocode
    advertiser_routes.py advertiser signup + ad submission, admin approve/reject
    ws_routes.py         WebSocket via one-time ticket (POST /api/ws/ticket -> /api/ws?ticket=), online users (admin)
  utils/ ai_utils (Gemini crew matching), email_utils (Resend), geocoding (Geoapify), push_utils (pywebpush), storage (Emergent object storage), notify, profile_view
  uploads/ legacy local images (migrated to object storage at startup)
  tests/ pytest suites (security, iteration2, new features)
frontend/src/
  App.js           routes + ProtectedRoute by role
  contexts/        AuthContext (cookie+CSRF axios), WebSocketContext, ThemeContext, LanguageContext
  pages/           Landing, Auth, AuthCallback, CrewDashboard, ContractorDashboard, AdminDashboard, Profile, PublicProfile, Subscription, GuestJob, Legal, Advertiser, VerifiedContractors, AppSettings, OurApp
  components/      JobCard, JobMap/MapComponent, BoostJobModal, OfferCrewModal, NotificationBell, TrustCard, Certifications, ProfileChecklist, AddressAutocomplete, PWAInstallPrompt, ui/* (shadcn)
memory/ PRD.md, SYSTEM_SUMMARY.md, test_credentials.md
test_reports/ iteration_1-4.json + pytest xml
```

## Roles
crew, contractor, advertiser, admin, super_admin. Admin/super_admin only bootstrapped from env creds; admins cannot grant admin roles; OAuth blocked for admin roles.

## Core logic
- Job lifecycle: open -> fulfilled (crew_needed reached) -> in_progress (start) -> completed_pending_review (crew completes) -> completed (contractor verifies) -> ratings. Side states: cancelled, suspended/resumed, closed. Accept is atomic (no double-accept).
- Crew matching: deterministic score (trade, skills, distance, rating, history, transport) + Gemini (`gemini-3-flash-preview`) AI match; notify threshold 0.6.
- Monetization: subscription plans per role (trial 30 days crew / 14 days contractor, contractor job-post quotas), job boost ($9.99 default), Verified Contractor badge ($39.99, 1 year), contact unlock, guest job post checkout, coupons. Stripe via Emergent; PayPal only if keys set.
- Engagement: referral codes + points, favorites, in-app messages, notifications (WS + push + email).
- Security: HttpOnly session cookie + double-submit CSRF, token revocation, lockout (10 fails/15 min), rate limits, hashed single-use reset tokens, magic-byte validated 5MB uploads.

## Environment (created in this workspace)
backend/.env: MONGO_URL, DB_NAME, CORS_ORIGINS, JWT_SECRET_KEY, JWT_EXPIRE_HOURS, TRUSTED_PROXY_HOPS, EMERGENT_LLM_KEY, STRIPE_API_KEY (sk_test_emergent), FRONTEND_URL, SUPER_ADMIN_/ADMIN_ EMAIL+PASSWORD.
Not set (features degrade gracefully): RESEND_API_KEY/SENDER_EMAIL (email), PAYPAL_CLIENT_ID/SECRET, GEOAPIFY_API_KEY (geocoding), VAPID_PUBLIC/PRIVATE_KEY (push).
frontend/.env: REACT_APP_BACKEND_URL (+ optional REACT_APP_PAYPAL_CLIENT_ID, REACT_APP_VAPID_PUBLIC_KEY).
frontend/.yarnrc: ignore-engines (maplibre dep wants Node 22, container has Node 20).
