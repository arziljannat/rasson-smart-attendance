-- Phase 1 schema. Run only in a NEW dedicated Rasson Smart Attendance Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 email text,
 role text not null default 'pending' check(role in ('admin','branch_manager','pending')),
 created_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.profiles(id,email,role) values(new.id,new.email,'pending')
 on conflict(id) do update set email=excluded.email;
 return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin');
$$;

create table if not exists public.branches(
 id uuid primary key default gen_random_uuid(),
 name text not null,
 code text not null unique,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);

create table if not exists public.shifts(
 id uuid primary key default gen_random_uuid(),
 branch_id uuid not null references public.branches(id) on delete restrict,
 name text not null,
 start_time time not null,
 end_time time not null,
 grace_minutes integer not null default 0 check(grace_minutes between 0 and 240),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(branch_id,name)
);

create table if not exists public.employees(
 id uuid primary key default gen_random_uuid(),
 employee_code text not null unique,
 full_name text not null,
 phone text not null,
 branch_id uuid not null references public.branches(id) on delete restrict,
 shift_id uuid references public.shifts(id) on delete set null,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists employees_branch_idx on public.employees(branch_id);
create index if not exists employees_phone_idx on public.employees(phone);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path=''
as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists employees_updated_at on public.employees;
create trigger employees_updated_at before update on public.employees
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.shifts enable row level security;
alter table public.employees enable row level security;

drop policy if exists "Profiles owner or admin read" on public.profiles;
create policy "Profiles owner or admin read" on public.profiles for select to authenticated
using(id=(select auth.uid()) or public.is_admin());
drop policy if exists "Admins manage profiles" on public.profiles;
create policy "Admins manage profiles" on public.profiles for all to authenticated
using(public.is_admin()) with check(public.is_admin());
drop policy if exists "Admins manage branches" on public.branches;
create policy "Admins manage branches" on public.branches for all to authenticated
using(public.is_admin()) with check(public.is_admin());
drop policy if exists "Admins manage shifts" on public.shifts;
create policy "Admins manage shifts" on public.shifts for all to authenticated
using(public.is_admin()) with check(public.is_admin());
drop policy if exists "Admins manage employees" on public.employees;
create policy "Admins manage employees" on public.employees for all to authenticated
using(public.is_admin()) with check(public.is_admin());

-- After creating the first user in Supabase Auth, promote it:
-- update public.profiles set role='admin' where email='YOUR_ADMIN_EMAIL';
