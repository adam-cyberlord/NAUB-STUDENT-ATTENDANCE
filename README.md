# NAUB Student Attendance

NAUB Student Attendance is an attendance experience designed for university classes. This repository contains an interactive, browser-local MVP prototype and the first Supabase/Postgres schema for a server-verified MVP.

> **Important: prototype, not an official attendance system.** The current screens persist demo data in one browser. They do not authenticate users, share session state across phones, call Supabase, or create tamper-resistant attendance records. Client-side time, GPS, device IDs, and browser storage can all be changed. Do not use this prototype to determine examination eligibility. Connect the authenticated server workflow described below before collecting real student data.

## What works in the prototype

- Lecturer overview, session list, student roster, attendance-risk report, and CSV downloads.
- Create sessions with course, date/time, venue, coordinates, and a 10–2,000 m radius.
- Generate a QR link, copy it, close a session, and rotate its token. Rotation replaces the previous token.
- Student check-in with ordered token/session, time-window, GPS accuracy, radius, enrolment, duplicate, and device checks.
- Browser geolocation with readable permission/accuracy failures, plus an explicitly labelled simulated-location helper for local demonstrations.
- Responsive layouts, keyboard-dismissable dialogs, reduced-motion support, high-contrast status labels, and light/dark themes.
- NAUB seal on the left, Army insignia on the right, and a full-cover NAUB campus-photo background with dashboard photo accents; the palette uses warm ivory and sandstone with muted olive, NAUB red, and gold accents.
- Student portal login and registration form previews collect the requested student profile fields and validate the form locally. They do not authenticate, send, or save user credentials or registration details.
- Sample courses and student roster are included as non-production fixtures in the UI.

The Supabase SQL in [`supabase/schema.sql`](./supabase/schema.sql) provides tenant tables, RLS policies, server-created sessions and QR tokens, QR rotation/close RPCs, and an atomic `mark_attendance` RPC. The UI does not call these procedures yet; they are the backend integration boundary for the next implementation step.

## Run locally

No package install is required for the prototype. Serve the project over localhost (required for browser geolocation):

```sh
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000). If Python is unavailable, use any static-file server. Opening `index.html` directly from `file://` does not provide normal GPS permissions and QR links use the reserved example domain.

The QR renderer and web fonts are loaded from public CDNs. The rest of the demo works without a build step; without the QR library, the check-in URL is still available through “Copy link”.

## Supabase setup (backend foundation)

1. Create a Supabase project in the region appropriate for your users and configure Auth email/phone settings.
2. Apply [`supabase/schema.sql`](./supabase/schema.sql) using the Supabase SQL editor or Supabase CLI:

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

3. Optionally add the sample NAUB tenant and course catalogue:

   ```sh
   supabase db execute --file supabase/seed.sql
   ```

   Seed data does not create user accounts or enrolments. Never seed real student information in a public demo.
4. Bootstrap the first `super_admin` role assignment using a trusted database migration/admin connection. Do not allow a browser client to assign its own roles.
5. Before real check-ins, add authenticated server/API integration for signup, lecturer approval, device enrollment and approval, class creation, QR rotation, QR check-in, and session close. The scan endpoint must invoke `mark_attendance` with the user's Supabase JWT; never expose a service-role key to a browser.
6. Configure a private Supabase Storage bucket for excuse documents only when that feature is implemented. Restrict paths to the requesting student and reviewers; set file-size/type limits and retention.

### Environment variables for the planned Next.js integration

The static prototype does **not** read environment variables. When adding the Next.js/Supabase server:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=server-only-secret-never-prefix-with-NEXT_PUBLIC
NEXT_PUBLIC_APP_URL=https://your-domain.example
```

Keep the service-role key in Vercel's encrypted server-side environment only. Use separate development, preview, and production Supabase projects. Add email/SMS provider keys only on the server when those optional channels are enabled.

## Vercel preview deployment

Import the repository into Vercel and deploy it as a static site from the project root. Add the custom domain and enable HTTPS. The included [`vercel.json`](./vercel.json) rewrites `/a/<token>` to the app shell so QR links can open the demo page.

This deployment is a UI preview only; a rewrite does not provide an API, authentication, server time validation, or shared session storage. Do not publish production attendance data with it.

## Backend interface and trust boundary

The authenticated Postgres RPCs are:

- `create_class_session(...)` — verifies the assigned, approved lecturer or tenant admin; generates a 256-bit random QR token; persists only its SHA-256 digest.
- `update_class_session(session_id, ...)` — updates an open session's window and classroom geofence and records the edit.
- `rotate_session_qr(session_id)` — replaces the digest, invalidating the old link.
- `close_class_session(session_id)` — closes the session and writes an audit event.
- `mark_attendance(qr_token, device_identifier, latitude, longitude, accuracy_metres)` — uses database time, checks the session/token, time window, GPS accuracy/radius, active enrolment, duplicate attendance, and approved device, then records `present` or `late` atomically.

Check-in attempt outcomes are kept in `attendance_attempts`; successful attendance writes are unique per student/session. The RPC applies a per-user attempt limit of eight attempts per minute. IP attribution must be added in a trusted API/Edge Function using proxy-verified request metadata; never trust an IP address supplied in the request body. GPS values still originate from the phone and cannot prove that a student is physically present. Treat anomaly flags and lecturer review as necessary controls, not proof.

The current static client uses JavaScript only to make the MVP interaction demonstrable. For production, move **all** checks and writes to authenticated server code calling the SQL RPC, use Supabase Auth and per-university membership, and do not accept client-supplied time/status/role/device approval.

## Security review checklist

- [ ] **Replay:** use unpredictable tokens with a short active session window; store token digests only; rotate atomically; reject closed, expired, and previously used sessions; rate-limit by account and trusted network metadata.
- [ ] **Token expiry:** bind token validity to the database session start/end and status. QR rotation must replace the digest in one transaction. Persist only the digest on the server; redact the token path from access logs, analytics, and error reports.
- [ ] **GPS spoofing:** enforce accuracy and radius server-side; log coordinates/accuracy with short, documented retention; flag mock-location indicators and repeated identical coordinates; provide lecturer review and an appeal path. GPS is a signal, not cryptographic proof.
- [ ] **QR sharing:** limit each account to one attendance row per session, require a course enrolment and approved device, and consider short-lived rotating codes. A photographed QR is still shareable; require instructor review for suspicious attendance.
- [ ] **Brute force:** rate-limit at the edge and database; keep attempt logs; use generic invalid-token messaging; alert on repeated failures; never expose whether arbitrary tokens belong to another class.
- [ ] **Tenant isolation:** test every RLS policy as student, lecturer, course rep, university admin, and super admin in two different universities. Never rely on filtering by tenant only in the UI.
- [ ] **Role and lecturer approval:** only trusted admin workflows may assign roles or approve lecturers/devices. Verify every RPC independently of hidden UI controls.
- [ ] **Device changes:** revoke the lost device before approving the replacement; notify the student; audit the reviewer and reason.
- [ ] **Offline submissions:** do not accept a client timestamp as proof. Sign server-issued challenge data, bound offline acceptance tightly, and treat delayed sync as review-required until replay and clock-tampering controls are tested.
- [ ] **CSRF, transport, and secrets:** enforce HTTPS, use secure SameSite cookies for server sessions, CSRF protections for cookie-authenticated writes, strict CORS, server-only secrets, and dependency/security monitoring.
- [ ] **NDPA 2023:** collect consent before location use; provide purpose/retention notices, data access/correction/deletion request routes, a lawful-basis review, and a process for legal holds. Minimise precise location retention and restrict excuse-document access.
- [ ] **Operations:** enable database backups/PITR, recovery drills, error monitoring, audit-log retention, incident response, and an attendance dispute procedure.

## Manual MVP test plan

The browser prototype uses local sample data. Test the SQL RPCs separately in a non-production Supabase project with authenticated accounts, approved roles/devices, and seeded enrolments.

| Case | Setup/action | Expected result |
|---|---|---|
| In-radius check-in | Open session; enrolled student; registered device; accurate GPS inside radius | One `present` attendance row and one accepted attempt |
| Outside radius | Send coordinates beyond `radius_metres` | Friendly `outside_radius`; no attendance row |
| Poor GPS | Send accuracy greater than 100 m | `gps_accuracy_unacceptable`; no attendance row |
| Expired/not-yet-open | Use a session outside `starts_at..ends_at` | `outside_time_window`; no attendance row |
| Invalid/rotated token | Scan a random token, then rotate and use the old token | `invalid_token`; no attendance row |
| Closed session | Close a session and check in with its previous token | `session_closed`; no attendance row |
| Duplicate/replay | Submit the same user/session twice, including concurrent requests | Exactly one attendance row; later attempt is `already_checked_in` |
| Wrong course | Authenticated user has no active enrolment | `not_enrolled`; no attendance row |
| Wrong device | Use an unknown, pending, or revoked device identifier | `device_not_registered`; no attendance row |
| Late arrival | Check in after `starts_at + late_after_minutes` but before `ends_at` | One `late` attendance row |
| Brute force | Make nine attempts inside one minute | First eight are evaluated; subsequent request is `rate_limited` |
| Offline sync | Disconnect after opening a scan and reconnect after session end | No client-only attendance write; sync is rejected or review-required by server policy |
| Cross-tenant access | Use University A credentials to query/update University B rows | RLS denies access; no data is returned or modified |
| Session form validation | Set end before start, invalid coordinates, or radius below minimum | Form explains the invalid field; no session is created |

## Delivery order

1. **MVP:** Auth and role onboarding/approval → university course/enrolment setup → lecturer session creation → QR/token RPCs → authenticated student check-in with server time, GPS, radius, enrolment, duplicate and device validation → student dashboard and attendance history.
2. **Phase 2:** Rotating/projector QR, late rules and attendance thresholds, course rep permissions, manual adjustments with reasons/audit, live attendance, exports/reports, timetable/templates, anomaly review, excuse requests, admin imports, notifications.
3. **Phase 3:** Offline-tolerant sync with signed challenges and a strict sync limit, PWA/service worker, Hausa/Yoruba/Igbo translations, optional selfie checks, email/SMS, accessibility review, and production observability/backup drills.

## Current gaps before production

The requested Next.js App Router, TypeScript/Tailwind, Supabase Auth client integration, real API routes/server actions, authenticated student registration/login/dashboard/history, Realtime, service worker/offline queue, NDPA consent/deletion UI, admin/super-admin screens, automated RLS tests, trusted IP attribution, and scheduled retention/deletion jobs are not part of this vanilla-JavaScript workspace implementation. The schema covers core tenant/auth/attendance data and secure server-side MVP RPCs; it is a foundation, not a complete migration of every requested workflow. Add those pieces and complete the checklist above before using real student data.
