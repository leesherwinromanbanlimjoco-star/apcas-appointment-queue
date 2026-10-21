# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

APCAS Appointments & Queue: students book make-up classes and consultations, teachers approve them and run a live queue, and an admin manages accounts, rooms, records and reports. React 18 + Vite frontend, PHP 8 API, MySQL/MariaDB.

## Commands

```
npm install
npm run dev       # Vite dev server (usually http://localhost:5173)
npm run build     # production build into dist/
npm run preview
```

There is no test suite, linter or formatter configured.

The dev server proxies `/api/*` to `http://localhost/apcas-appointment-queue/api/*`, so XAMPP's Apache and MySQL must be running with `apcas-appointment-queue/` in `C:\xampp\htdocs\` (copied or `mklink /D`-linked). PHP files are served live by Apache; no build step for the backend.

Database setup:
- Fresh install (drops and recreates `apcas_appointment_queue`): `C:\xampp\mysql\bin\mysql -u root < apcas-appointment-queue/sql/apcas_appointment_queue.sql`
- Keep existing data: run `apcas-appointment-queue/sql/upgrade_existing_database.sql`. Schema changes must be made in **both** files.

Sample logins: `admin`/`admin123`, student `lee`/`leelee`, teacher `marjo`/`marjomarjo`.

## Architecture

### Frontend: one file
Nearly the whole UI is `src/App.jsx` (~7k lines): constants and validation rules at the top, the `App` component (session, polling, toast/undo, confirm dialog), shared UI components, then per-role sections (`BookSection`, `RequestsSection`, `QueueSection`, `AdminAccounts`, `AdminRooms`, `AdminReports`, `ProfileSection`, ...), and finally all CSS as a template string `CSS` injected via `<style>`. Navigation is tab state per role (`STUDENT_TABS`/`TEACHER_TABS`/`ADMIN_TABS`), not a router. User display prefs live in `localStorage` (`apcas-prefs`).

### Data flow: whole-state polling
- `api(path, body)` in App.jsx is the only fetch wrapper (GET without body, POST JSON with body; throws `Error` with the server's `error` message and `.status`).
- The app polls `GET /api/state.php?v=<version>` every `POLL_MS` (4s). `build_state()` in `api/state_lib.php` returns everything the signed-in user's screens show, sliced by role (students never get other students' details). `version` is an md5 of the state; an unchanged version returns `{ unchanged: true }`.
- Every mutation is `POST { action, ... }` to `api/actions.php` (students/teachers: `book`, `assign`, `appt_status`, `queue_status`, `call_next`, `walk_in`, `save_hours`, `undo`, ...) or `api/admin.php` (accounts, rooms). Both are a single `switch` on `action` and reply via `finish()` with the fresh `state` + `version`, so the client replaces its data wholesale rather than patching it.
- `build_state()` also runs `close_missed_appointments()`, which auto-marks past `confirmed` appointments as `no_show` and past `checked_in` as `completed`.

### Backend conventions (`api/db.php`)
- `db()` is a lazy PDO singleton; credentials default to XAMPP root/no password, overridden by an untracked `api/config.php` (written by the deploy).
- Errors: `fail($msg, $status)` responds `{ error }` and exits. The global exception handler maps SQLSTATE `45000` (trigger `SIGNAL`) to 409 with the trigger's message and duplicate keys (1062) to 409. Error messages are written for end users in plain language — keep that tone.
- `require_user([$roles])` authenticates via PHP session and then calls `session_write_close()` so polls don't serialize requests; don't write to `$_SESSION` after it.
- Every change is recorded with `log_event()` into `activity_log` (feeds admin history/reports).
- Timezone is fixed to Asia/Manila in both PHP and the MySQL session. Times are stored as minutes-from-midnight (`start_min`/`end_min`) and quarter-hour aligned; the client does the same.
- Uploads arrive as base64 data URLs, are type-checked by content (JPG/PNG/PDF, ≤5 MB, ≤3 files), written to `uploads/` with random names, and removed again via `discard_uploads()` if the request fails. Call `keep_uploads()` after the transaction commits. Files are served only through `api/file.php` (with access checks).

### Approval receipts and student alerts
- Approved appointments (`confirmed`, `checked_in`, `completed`) carry a `receiptRef` like `APCAS-000123-7F3A91C2`: the id plus an HMAC computed by `receipt_ref()` in `db.php`. The key is derived from `config()`, so the hosted copy's secret DB login doubles as the signing key and nothing is stored in the database. Changing the DB credentials on the host invalidates every printed receipt.
- `api/verify.php` (teacher/admin, GET) checks a reference. The QR code on a receipt links to `/?verify=<ref>`, which `App` picks up after sign-in and opens `VerifyReceiptDialog`.
- Students' status labels (Pending / Approved / In line / Your turn / Completed) come from `studentStage()`, which combines the appointment status with its queue ticket. `useStudentAlerts` compares each poll with what the device last saw (`localStorage` `apcas-seen-<studentId>`) to raise approval/decline notices, and rings while the student's ticket is `called`. A student with an open ticket keeps polling while the tab is hidden. Browser notifications go through `public/sw.js` and need HTTPS.

### Business rules exist in three places
Status machines (`APPT_NEXT`, `QUEUE_NEXT`, `BLOCKING`), hour validation (`scheduleProblem`/`schedule_problem`) and slot rules are duplicated in `src/App.jsx` (for instant UI feedback) and the PHP API (authoritative), and the SQL file also defines triggers for clash and transition checks. Change them together.

The production host (InfinityFree, MariaDB 11) **refuses `CREATE TRIGGER`** and CHECKs on columns touched by cascading FKs, so the PHP must enforce everything itself without relying on triggers: bookings that take time or a room run under `booking_lock()` (MySQL `GET_LOCK`), and status updates use `UPDATE ... WHERE status = <expected>` and check `rowCount()`. `force()` sets `@apcas_undo = 1` so Undo can bypass the transition triggers where they exist. Students and teachers are never deleted (accounts are switched off via `is_active`).

### Deployment
`.github/workflows/deploy.yml` deploys on every push to `main`: builds `dist/`, assembles `site/` (built app at the root, `api/*.php`, `uploads/.htaccess`), writes `api/config.php` from repo secrets, and FTP-uploads to InfinityFree `/htdocs/`. On the host the API lives at `/api/` directly (no `apcas-appointment-queue/` prefix), matching the paths the app requests. User-uploaded files on the server are excluded from the sync.

### `supabase/`
An unused Postgres port of the schema and seed data (mirrors the App.jsx data model). The running app uses only the MySQL schema in `apcas-appointment-queue/sql/`.
