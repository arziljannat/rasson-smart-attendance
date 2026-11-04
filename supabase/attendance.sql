-- Phase 3 migration: run this once in the existing Rasson Smart Attendance Supabase project.
-- Attendance is admin-managed in this phase. Employee self-service/mobile camera capture comes later.
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  shift_id uuid references public.shifts(id) on delete set null,
  work_date date not null,
  scheduled_start time,
  scheduled_end time,
  grace_minutes integer not null default 0 check (grace_minutes between 0 and 240),
  check_in timestamptz,
  check_out timestamptz,
  attendance_status text not null default 'not_marked'
    check (attendance_status in ('not_marked','present','late','absent','half_day')),
  source text not null default 'admin_manual'
    check (source in ('admin_manual','mobile_camera')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id, work_date),
  check (check_out is null or check_in is not null),
  check (check_out is null or check_out >= check_in)
);

create index if not exists attendance_records_work_date_idx
  on public.attendance_records(work_date);
create index if not exists attendance_records_branch_date_idx
  on public.attendance_records(branch_id, work_date);
create index if not exists attendance_records_employee_date_idx
  on public.attendance_records(employee_id, work_date);

alter table public.attendance_records enable row level security;

drop policy if exists "Admins manage attendance records" on public.attendance_records;
create policy "Admins manage attendance records"
  on public.attendance_records for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.attendance_records to authenticated;

create or replace function public.set_attendance_updated_at()
returns trigger language plpgsql set search_path=''
as $$ begin new.updated_at=now(); return new; end; $$;

drop trigger if exists attendance_records_updated_at on public.attendance_records;
create trigger attendance_records_updated_at
before update on public.attendance_records
for each row execute function public.set_attendance_updated_at();
