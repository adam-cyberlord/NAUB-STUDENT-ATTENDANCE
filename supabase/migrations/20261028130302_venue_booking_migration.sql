-- Venue management and conflict-free classroom booking.
-- Apply after base schema, attendance_present_migration, and class_schedule_migration.

create extension if not exists btree_gist;

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  name text not null,
  faculty text not null,
  department text,
  campus text not null,
  building text,
  floor_location text,
  venue_type text not null check (venue_type in ('Lecture Hall', 'Classroom', 'Laboratory', 'Seminar Room')),
  capacity integer not null check (capacity > 0),
  status text not null default 'available' check (status in ('available', 'unavailable')),
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 240),
  unavailable_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, university_id)
);

create unique index if not exists venues_identity_unique
  on public.venues (university_id, lower(name), lower(coalesce(building, '')), lower(campus));
create index if not exists venues_lookup
  on public.venues (university_id, status, lower(faculty), lower(campus));

create table if not exists public.venue_history (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  changed_by uuid references public.users(id) on delete set null,
  action text not null,
  snapshot jsonb not null,
  changed_at timestamptz not null default now()
);

alter table public.class_schedules
  add column if not exists venue_id uuid references public.venues(id) on delete restrict;
create index if not exists class_schedules_venue_time
  on public.class_schedules (venue_id, starts_at, ends_at)
  where status <> 'cancelled';

alter table public.venues enable row level security;
alter table public.venue_history enable row level security;

create policy "members can view venues"
  on public.venues for select to authenticated
  using (public.is_university_member(university_id));
create policy "admins manage venues"
  on public.venues for insert to authenticated
  with check (public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'));
create policy "admins update venues"
  on public.venues for update to authenticated
  using (public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'))
  with check (public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'));
create policy "admins view venue history"
  on public.venue_history for select to authenticated
  using (public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'));

create or replace function public.prevent_venue_booking_conflict()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue public.venues%rowtype;
  v_conflict boolean;
begin
  if new.venue_id is null or new.status = 'cancelled' then
    return new;
  end if;
  select * into v_venue from public.venues where id = new.venue_id for update;
  if not found or v_venue.status <> 'available' then
    raise exception using errcode = 'P0001', message = 'venue_unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.venue_id::text, 0));
  select exists (
    select 1
    from public.class_schedules s
    join public.venues booked on booked.id = s.venue_id
    where s.venue_id = new.venue_id
      and s.id <> new.id
      and s.status <> 'cancelled'
      and s.starts_at < new.ends_at + make_interval(mins => booked.buffer_minutes)
      and new.starts_at < s.ends_at + make_interval(mins => v_venue.buffer_minutes)
  ) into v_conflict;
  if v_conflict then
    raise exception using errcode = '23P01', message = 'venue_booking_conflict';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_venue_booking_conflict on public.class_schedules;
create trigger prevent_venue_booking_conflict
before insert or update of venue_id, starts_at, ends_at, status on public.class_schedules
for each row execute function public.prevent_venue_booking_conflict();

create or replace function public.record_venue_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.venue_history(university_id, venue_id, changed_by, action, snapshot)
  values(new.university_id, new.id, auth.uid(), case when tg_op = 'INSERT' then 'created' else 'updated' end, to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists record_venue_history on public.venues;
create trigger record_venue_history
after insert or update on public.venues
for each row execute function public.record_venue_history();

create or replace function public.manage_venue(
  p_venue_id uuid,
  p_name text,
  p_faculty text,
  p_department text,
  p_campus text,
  p_building text,
  p_floor_location text,
  p_venue_type text,
  p_capacity integer,
  p_status text default 'available',
  p_buffer_minutes integer default 0,
  p_unavailable_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_university_id uuid;
  v_id uuid := coalesce(p_venue_id, gen_random_uuid());
begin
  select university_id into v_university_id
  from public.users where id = auth.uid();
  if v_university_id is null
     or not (public.has_role(v_university_id, 'university_admin') or public.has_role(null, 'super_admin')) then
    raise exception using errcode = '42501', message = 'not_authorized_to_manage_venues';
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2
     or length(btrim(coalesce(p_faculty, ''))) < 2
     or length(btrim(coalesce(p_campus, ''))) < 2
     or p_capacity is null or p_capacity < 1
     or p_buffer_minutes not between 0 and 240
     or p_status not in ('available', 'unavailable') then
    raise exception using errcode = '22023', message = 'invalid_venue_details';
  end if;
  insert into public.venues(
    id, university_id, name, faculty, department, campus, building,
    floor_location, venue_type, capacity, status, buffer_minutes, unavailable_reason
  ) values (
    v_id, v_university_id, btrim(p_name), btrim(p_faculty), nullif(btrim(p_department), ''),
    btrim(p_campus), nullif(btrim(p_building), ''), nullif(btrim(p_floor_location), ''),
    p_venue_type, p_capacity, p_status, p_buffer_minutes, nullif(btrim(p_unavailable_reason), '')
  )
  on conflict (id) do update set
    name = excluded.name, faculty = excluded.faculty, department = excluded.department,
    campus = excluded.campus, building = excluded.building, floor_location = excluded.floor_location,
    venue_type = excluded.venue_type, capacity = excluded.capacity, status = excluded.status,
    buffer_minutes = excluded.buffer_minutes, unavailable_reason = excluded.unavailable_reason,
    updated_at = clock_timestamp();
  return v_id;
exception when unique_violation then
  raise exception using errcode = '23505', message = 'venue_already_exists';
end;
$$;

create or replace function public.publish_class_schedule(
  p_course_id uuid,
  p_class_date date,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_venue_id uuid,
  p_instructions text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course public.courses%rowtype;
  v_venue public.venues%rowtype;
  v_id uuid;
begin
  select * into v_course from public.courses where id = p_course_id;
  select * into v_venue from public.venues where id = p_venue_id;
  if not found or v_course.lecturer_id <> auth.uid()
     or not public.has_role(v_course.university_id, 'lecturer') then
    raise exception using errcode = '42501', message = 'not_authorized_for_course';
  end if;
  if v_venue.university_id <> v_course.university_id or v_venue.status <> 'available' then
    raise exception using errcode = 'P0001', message = 'venue_unavailable';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception using errcode = '22023', message = 'invalid_schedule_time';
  end if;
  if v_venue.capacity < coalesce((select count(*) from public.enrollments where course_id = p_course_id and status = 'active'), 1) then
    raise exception using errcode = '22023', message = 'venue_capacity_insufficient';
  end if;
  insert into public.class_schedules(
    university_id, course_id, lecturer_id, class_date, starts_at, ends_at,
    venue, venue_id, instructions
  ) values (
    v_course.university_id, p_course_id, auth.uid(), p_class_date, p_starts_at,
    p_ends_at, v_venue.faculty || ' — ' || v_venue.name || ' — ' || v_venue.campus,
    p_venue_id, coalesce(p_instructions, '')
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_class_schedule(
  p_schedule_id uuid,
  p_class_date date,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_venue_id uuid,
  p_instructions text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.class_schedules%rowtype;
  v_venue public.venues%rowtype;
begin
  select * into v_schedule from public.class_schedules where id = p_schedule_id for update;
  select * into v_venue from public.venues where id = p_venue_id;
  if not found or v_schedule.lecturer_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'not_authorized_for_schedule';
  end if;
  if v_venue.status <> 'available' or v_venue.university_id <> v_schedule.university_id then
    raise exception using errcode = 'P0001', message = 'venue_unavailable';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception using errcode = '22023', message = 'invalid_schedule_time';
  end if;
  update public.class_schedules
  set class_date = p_class_date, starts_at = p_starts_at, ends_at = p_ends_at,
      venue = v_venue.faculty || ' — ' || v_venue.name || ' — ' || v_venue.campus,
      venue_id = p_venue_id, instructions = coalesce(p_instructions, ''),
      status = case when class_date <> p_class_date or starts_at <> p_starts_at
        or ends_at <> p_ends_at or venue_id <> p_venue_id then 'rescheduled' else status end,
      updated_at = clock_timestamp()
  where id = p_schedule_id;
end;
$$;

revoke all on function public.manage_venue(uuid,text,text,text,text,text,text,text,integer,text,integer,text) from public;
revoke all on function public.publish_class_schedule(uuid,date,timestamptz,timestamptz,uuid,text) from public;
revoke all on function public.update_class_schedule(uuid,date,timestamptz,timestamptz,uuid,text) from public;
grant execute on function public.manage_venue(uuid,text,text,text,text,text,text,text,integer,text,integer,text) to authenticated;
grant execute on function public.publish_class_schedule(uuid,date,timestamptz,timestamptz,uuid,text) to authenticated;
grant execute on function public.update_class_schedule(uuid,date,timestamptz,timestamptz,uuid,text) to authenticated;