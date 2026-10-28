# Nigerian Army University Biu Student Attendance

## Product direction
An attendance platform for Nigerian universities, designed for low-bandwidth mobile use and separated by university tenant. Lecturers open time- and location-bound class sessions; enrolled students check in using a QR link. Attendance used for exam eligibility must be verified and written on the authenticated server.

## Current MVP prototype
- Lecturer overview, session list, student roster, reports, and CSV export.
- Create sessions with course, date/time, named venue, map coordinates, and a configurable radius.
- Display, copy, regenerate, and close a session QR/check-in link.
- Student browser check-in flow with time-window, GPS accuracy, distance, course enrolment, duplicate, and device checks.
- Responsive interface, light/dark theme, sample fixtures, and clear demo-only warnings.
- Supabase schema for university tenants, roles, courses, enrolments, sessions, attendance, devices, excuses, notifications, audit logs, RLS, and secure MVP RPCs.

The browser prototype is not an authoritative attendance service. It has no production authentication or cross-device shared state and its client-side checks can be bypassed. The SQL RPCs are not yet wired to the screens.

## Delivery order
1. **MVP:** Auth and lecturer approval, university course/enrolment setup, session creation, QR generation, authenticated server-side check-in validation, and student dashboard/history.
2. **Phase 2:** Rotating/projector QR, late and eligibility rules, course rep, live attendance, manual corrections/audit, exports, reusable schedules, anomalies, excuse requests, admin imports, and notifications.
3. **Phase 3:** Signed offline sync, PWA/service worker, Hausa/Yoruba/Igbo, optional selfie checks, email/SMS, and production monitoring/backup drills.

See [README.md](./README.md) for run instructions, current limitations, database setup, security checklist, and test plan.
