-- Lecturer-managed class schedules, history, and notifications.
-- Apply after base schema and attendance_present_migration.

create table if not exists public.class_schedules (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  lecturer_id uuid not null references public.users(id) on delete restrict,
  class_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue text not null,
  instructions text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled', 'rescheduled', 'cancelled', 'completed')),
  attendance_session_id uuid references public.sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.class_schedule_history (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.class_schedules(id) on delete cascade,
  changed_by uuid references public.users(id) on delete set null,
  previous_class_date date,
  previous_starts_at timestamptz,
  previous_ends_at timestamptz,
  previous_venue text,
  changed_at timestamptz not null default now()
);

alter table public.sessions add column if not exists schedule_id uuid references public.class_schedules(id) on delete set null;
alter table public.attendance add column if not exists class_schedule_id uuid references public.class_schedules(id) on delete set null;
alter table public.notifications add column if not exists event_key text;
alter table public.notifications add column if not exists schedule_id uuid references public.class_schedules(id) on delete cascade;
create unique index if not exists notifications_user_event_unique on public.notifications(user_id, event_key) where event_key is not null;

create or replace function public.attendance_fill_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.class_schedule_id is null then
    select s.schedule_id into new.class_schedule_id
    from public.sessions s
    where s.id = new.session_id;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_fill_schedule on public.attendance;
create trigger attendance_fill_schedule
before insert on public.attendance
for each row execute function public.attendance_fill_schedule();

alter table public.class_schedules enable row level security;
alter table public.class_schedule_history enable row level security;

create policy "scheduled classes visible to enrolled students and their lecturer"
  on public.class_schedules for select to authenticated using (
    lecturer_id = auth.uid()
    or public.has_role(university_id, 'university_admin')
    or public.has_role(null, 'super_admin')
    or exists (select 1 from public.enrollments e where e.course_id = class_schedules.course_id and e.student_id = auth.uid() and e.status = 'active')
  );
create policy "schedule history visible to authorized course users"
  on public.class_schedule_history for select to authenticated using (
    exists (
      select 1 from public.class_schedules s
      where s.id = schedule_id and (s.lecturer_id = auth.uid()
        or public.has_role(s.university_id, 'university_admin')
        or exists (select 1 from public.enrollments e where e.course_id=s.course_id and e.student_id=auth.uid() and e.status='active'))
    )
  );

create or replace function public.publish_class_schedule(p_course_id uuid, p_class_date date, p_starts_at timestamptz, p_ends_at timestamptz, p_venue text, p_instructions text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_schedule_id uuid; v_university_id uuid; begin
  select university_id into v_university_id from public.courses where id=p_course_id and lecturer_id=auth.uid();
  if v_university_id is null or not public.has_role(v_university_id, 'lecturer') then raise exception 'not authorized for this course'; end if;
  if p_ends_at <= p_starts_at then raise exception 'end time must follow start time'; end if;
  insert into public.class_schedules(university_id,course_id,lecturer_id,class_date,starts_at,ends_at,venue,instructions)
  values(v_university_id,p_course_id,auth.uid(),p_class_date,p_starts_at,p_ends_at,btrim(p_venue),coalesce(p_instructions,'')) returning id into v_schedule_id;
  return v_schedule_id;
end; $$;

create or replace function public.update_class_schedule(p_schedule_id uuid, p_class_date date, p_starts_at timestamptz, p_ends_at timestamptz, p_venue text, p_instructions text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_schedule public.class_schedules%rowtype; begin
  select * into v_schedule from public.class_schedules where id=p_schedule_id;
  if not found or v_schedule.lecturer_id<>auth.uid() or not public.has_role(v_schedule.university_id,'lecturer') then raise exception 'not authorized for this schedule'; end if;
  if v_schedule.status='cancelled' then raise exception 'cancelled schedules cannot be edited'; end if;
  if p_ends_at <= p_starts_at then raise exception 'end time must follow start time'; end if;
  insert into public.class_schedule_history(schedule_id,changed_by,previous_class_date,previous_starts_at,previous_ends_at,previous_venue)
  values(p_schedule_id,auth.uid(),v_schedule.class_date,v_schedule.starts_at,v_schedule.ends_at,v_schedule.venue);
  update public.class_schedules set class_date=p_class_date,starts_at=p_starts_at,ends_at=p_ends_at,venue=btrim(p_venue),instructions=coalesce(p_instructions,''),status='rescheduled',updated_at=clock_timestamp() where id=p_schedule_id;
end; $$;

create or replace function public.cancel_class_schedule(p_schedule_id uuid)
returns void language plpgsql security definer set search_path = '' as $$ begin
  update public.class_schedules set status='cancelled',updated_at=clock_timestamp() where id=p_schedule_id and lecturer_id=auth.uid();
  if not found then raise exception 'not authorized or schedule not found'; end if;
end; $$;

create or replace function public.class_schedule_notify() returns trigger language plpgsql security definer set search_path='' as $$
declare v_action text; v_title text; v_key text; v_student record; v_previous text; begin
  if tg_op='UPDATE'
    and old.class_date is not distinct from new.class_date
    and old.starts_at is not distinct from new.starts_at
    and old.ends_at is not distinct from new.ends_at
    and old.venue is not distinct from new.venue
    and old.instructions is not distinct from new.instructions
    and old.status is not distinct from new.status then
    return new;
  end if;
  if tg_op='INSERT' then
    v_action='published';
  elsif new.status='cancelled' and old.status is distinct from new.status then
    v_action='cancelled';
  elsif new.status='rescheduled' then
    v_action='rescheduled';
  elsif old.venue is distinct from new.venue then
    v_action='venue_changed';
  else
    v_action='updated';
  end if;
  v_title := case v_action
    when 'cancelled' then 'Class cancelled'
    when 'rescheduled' then 'Class rescheduled'
    when 'venue_changed' then 'Class venue changed'
    else 'Class schedule published'
  end;
  v_key := new.id::text || ':' || v_action || ':' || new.updated_at::text;
  if tg_op='UPDATE' and v_action in ('rescheduled', 'venue_changed') then
    v_previous := format('Previous: %s %s–%s at %s. Now: ', old.class_date, to_char(old.starts_at,'HH24:MI'), to_char(old.ends_at,'HH24:MI'), old.venue);
  else
    v_previous := '';
  end if;
  for v_student in select e.student_id from public.enrollments e where e.course_id=new.course_id and e.status='active' loop
    insert into public.notifications(university_id,user_id,schedule_id,event_key,kind,title,body)
    values(new.university_id,v_student.student_id,new.id,v_key,coalesce(v_action,'schedule'),v_title,
      v_previous || format('%s %s–%s at %s',new.class_date,to_char(new.starts_at,'HH24:MI'),to_char(new.ends_at,'HH24:MI'),new.venue))
    on conflict (user_id,event_key) do nothing;
  end loop;
  return new;
end; $$;

drop trigger if exists class_schedule_notify on public.class_schedules;
create trigger class_schedule_notify after insert or update on public.class_schedules for each row execute function public.class_schedule_notify();

create or replace function public.start_scheduled_attendance(p_schedule_id uuid)
returns table (session_id uuid, qr_token text) language plpgsql security definer set search_path='' as $$
declare v_schedule public.class_schedules%rowtype; v_session_id uuid; v_created record; begin
  select * into v_schedule from public.class_schedules where id=p_schedule_id;
  if not found or v_schedule.lecturer_id<>auth.uid() then
    raise exception 'not authorized for this schedule';
  end if;
  if v_schedule.status='cancelled' then
    raise exception 'cancelled schedule';
  end if;
  if v_schedule.attendance_session_id is not null then
    return query select v_schedule.attendance_session_id, null::text;
    return;
  end if;
  select * into v_created from public.create_class_session(
    v_schedule.course_id, v_schedule.starts_at, v_schedule.ends_at, v_schedule.venue,
    0, 0, 50, 15
  );
  v_session_id := v_created.session_id;
  update public.sessions set schedule_id=p_schedule_id where id=v_session_id;
  update public.class_schedules set attendance_session_id=v_session_id where id=p_schedule_id;
  return query select v_session_id, v_created.qr_token;
end; $$;

revoke all on function public.publish_class_schedule(uuid,date,timestamptz,timestamptz,text,text) from public;
revoke all on function public.update_class_schedule(uuid,date,timestamptz,timestamptz,text,text) from public;
revoke all on function public.cancel_class_schedule(uuid) from public;
revoke all on function public.start_scheduled_attendance(uuid) from public;
grant execute on function public.publish_class_schedule(uuid,date,timestamptz,timestamptz,text,text) to authenticated;
grant execute on function public.update_class_schedule(uuid,date,timestamptz,timestamptz,text,text) to authenticated;
grant execute on function public.cancel_class_schedule(uuid) to authenticated;
grant execute on function public.start_scheduled_attendance(uuid) to authenticated;