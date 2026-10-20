-- APCAS Appointment Scheduling & Queue Management: initial schema.
-- Mirrors the data model in src/App.jsx (providers, services, appointments, queue).

-- ----------------------------------------------------------------- enums

create type public.appointment_status as enum (
  'booked', 'confirmed', 'checked_in', 'completed', 'declined', 'cancelled', 'no_show'
);

create type public.queue_status as enum ('waiting', 'called', 'in_service', 'done', 'left');

-- ------------------------------------------------------------- providers

-- Teachers. id keeps the app's "CICT-001" format.
create table public.providers (
  id          text primary key check (id ~ '^[A-Z]+-\d{3}$'),
  name        text not null,
  college     text not null,
  work_start  time not null default '09:00',
  work_end    time not null default '17:00',
  lunch_start time not null default '12:00',
  lunch_end   time not null default '13:00',
  created_at  timestamptz not null default now(),
  check (work_start >= '06:00' and work_end <= '21:00'),
  check (work_start < work_end),
  check (lunch_start < lunch_end),
  check (lunch_start >= work_start and lunch_end <= work_end)
);

-- -------------------------------------------------------------- services

-- Booking types. provider_id null = standard type offered by every teacher.
create table public.services (
  id          text primary key,
  provider_id text references public.providers (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  duration    integer not null check (duration in (15, 30, 45, 60, 90, 120)),
  description text not null default '' check (char_length(description) <= 140),
  question    text not null default '',
  example     text not null default '',
  one_off     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index services_provider_id_idx on public.services (provider_id);

-- Which booking types each teacher offers, in the order students see them.
create table public.provider_services (
  provider_id text not null references public.providers (id) on delete cascade,
  service_id  text not null references public.services (id) on delete cascade,
  position    integer not null default 0,
  primary key (provider_id, service_id)
);

create index provider_services_service_id_idx on public.provider_services (service_id);

-- -------------------------------------------------------------- students

create table public.students (
  student_id text primary key check (student_id ~ '^\d{4}-\d{5}$'),
  name       text not null check (char_length(name) between 2 and 60),
  course     text check (char_length(course) <= 30),
  year_level smallint check (year_level between 1 and 5),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------- appointments

create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  student_id      text not null references public.students (student_id) on update cascade,
  -- Snapshot of the student at booking time (the app shows these per appointment).
  student_name    text not null,
  student_course  text,
  student_year    smallint check (student_year between 1 and 5),
  provider_id     text not null references public.providers (id),
  service_id      text not null references public.services (id),
  date            date not null,
  start_min       integer not null check (start_min between 0 and 1439),
  end_min         integer not null check (end_min between 1 and 1440),
  status          public.appointment_status not null default 'booked',
  note            text not null default '' check (char_length(note) <= 300),
  -- Message the teacher gave when declining or cancelling.
  status_reason   text,
  -- 'teacher' when a teacher set the time (starts out confirmed).
  assigned_by     text check (assigned_by in ('student', 'teacher')) default 'student',
  -- Class-wide assignments share a group id and label like "BSIT · 2nd year".
  group_id        uuid,
  group_label     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (start_min < end_min),
  check (extract(isodow from date) <> 7)  -- no Sundays
);

create index appointments_provider_date_idx on public.appointments (provider_id, date);
create index appointments_student_date_idx on public.appointments (student_id, date);
create index appointments_service_id_idx on public.appointments (service_id);
create index appointments_group_id_idx on public.appointments (group_id) where group_id is not null;

-- The clash rule: no two time-blocking appointments overlap for the same teacher.
create extension if not exists btree_gist with schema extensions;

alter table public.appointments
  add constraint appointments_no_provider_overlap
  exclude using gist (
    provider_id with =,
    date with =,
    int4range(start_min, end_min) with &&
  ) where (status in ('booked', 'confirmed', 'checked_in', 'completed'));

alter table public.appointments
  add constraint appointments_no_student_overlap
  exclude using gist (
    student_id with =,
    date with =,
    int4range(start_min, end_min) with &&
  ) where (status in ('booked', 'confirmed', 'checked_in', 'completed') and group_id is null);

-- Proof files (JPG, PNG, PDF) uploaded by the student or teacher.
create table public.appointment_attachments (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  uploaded_by    text not null check (uploaded_by in ('student', 'teacher')),
  file_name      text not null,
  file_size      integer not null check (file_size > 0),
  mime_type      text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  storage_path   text not null,
  created_at     timestamptz not null default now()
);

create index appointment_attachments_appointment_id_idx on public.appointment_attachments (appointment_id);

-- ----------------------------------------------------------------- queue

create table public.queue_entries (
  id             uuid primary key default gen_random_uuid(),
  ticket         text not null check (ticket ~ '^A-\d{3,}$'),
  name           text not null,
  provider_id    text not null references public.providers (id),
  appointment_id uuid unique references public.appointments (id) on delete set null,
  queue_date     date not null default current_date,
  status         public.queue_status not null default 'waiting',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (provider_id, queue_date, ticket)
);

create index queue_entries_provider_date_idx on public.queue_entries (provider_id, queue_date);

-- ------------------------------------------------------- status machines

create or replace function public.check_appointment_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and not (
       (old.status = 'booked'     and new.status in ('confirmed', 'declined', 'cancelled'))
    or (old.status = 'confirmed'  and new.status in ('checked_in', 'cancelled', 'no_show'))
    or (old.status = 'checked_in' and new.status = 'completed')
  ) then
    raise exception 'Appointment cannot go from % to %', old.status, new.status;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger appointments_transition
  before update on public.appointments
  for each row execute function public.check_appointment_transition();

create or replace function public.check_queue_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and not (
       (old.status = 'waiting'    and new.status in ('called', 'left'))
    or (old.status = 'called'     and new.status in ('in_service', 'left'))
    or (old.status = 'in_service' and new.status = 'done')
  ) then
    raise exception 'Queue entry cannot go from % to %', old.status, new.status;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger queue_entries_transition
  before update on public.queue_entries
  for each row execute function public.check_queue_transition();

-- --------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

-- ------------------------------------------------------------------- RLS

-- RLS is on everywhere. Reference data is readable by anyone; appointment,
-- student and queue tables have no policies yet, so only the service role can
-- touch them until Supabase Auth replaces the demo sign-in.
alter table public.providers               enable row level security;
alter table public.services                enable row level security;
alter table public.provider_services       enable row level security;
alter table public.students                enable row level security;
alter table public.appointments            enable row level security;
alter table public.appointment_attachments enable row level security;
alter table public.queue_entries           enable row level security;

create policy "Anyone can read providers" on public.providers
  for select to anon, authenticated using (true);
create policy "Anyone can read services" on public.services
  for select to anon, authenticated using (true);
create policy "Anyone can read provider services" on public.provider_services
  for select to anon, authenticated using (true);
