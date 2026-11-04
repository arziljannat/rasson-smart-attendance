# Rasson Smart Attendance — Phase 1

Plain HTML, CSS and JavaScript admin foundation for a separate Supabase project.

## Included
- Supabase email/password admin login
- Admin authorization through profiles.role
- Multiple branch creation
- Employee directory with unique employee ID, mobile and branch
- Active/inactive employee status
- Dashboard counts
- Supabase Row Level Security policies

## Setup
1. Create a NEW Supabase project for this attendance app. Do not connect it to the live Kainat/Rasson production database.
2. In Supabase SQL Editor, run all of `supabase/schema.sql`.
3. In Supabase Authentication → Users, create your admin email/password.
4. Promote that account in SQL Editor:
   ```sql
   update public.profiles set role='admin' where email='YOUR_ADMIN_EMAIL';
   ```
5. Copy Project URL and anon/publishable key from Supabase Project Settings → API into `config.js`.
6. Run with VS Code Live Server, or import this repo into Vercel (Framework: Other, build command blank, output directory `.`).

Never put the Supabase service_role/secret key in browser code. Keep public sign-ups disabled for the admin panel.

## Planned later phases
- Employee phone OTP verification and face enrollment
- Mobile camera scanning and liveness/anti-spoof checks
- Branch/shift assignment and scheduled check-in/check-out
- Attendance reports, leave and payroll

Phase 1 does not send OTP, use the mobile camera, or mark attendance. Biometric data requires explicit employee consent, restricted access, secure storage, retention/deletion rules and audit logs before production use.
