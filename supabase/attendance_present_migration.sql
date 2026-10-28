-- Safe additive migration for immediate Present sign-in/sign-out recording.
-- Run after supabase/schema.sql. Existing records are preserved.

alter table public.users
  add column if not exists normalized_matric_number text generated always as (
    nullif(regexp_replace(upper(coalesce(matric_number, '')), '\s+', '', 'g'), '')
  ) stored;

create unique index if not exists users_normalized_matric_unique
  on public.users (university_id, normalized_matric_number)
  where normalized_matric_number is not null;

alter table public.attendance
  add column if not exists matric_number text,
  add column if not exists attendance_date date,
  add column if not exists signed_in_at timestamptz,
  add column if not exists signed_out_at timestamptz;

update public.attendance a
set matric_number = nullif(regexp_replace(upper(coalesce(u.matric_number, '')), '\s+', '', 'g'), ''),
    attendance_date = coalesce(attendance_date, (checked_at at time zone 'Africa/Lagos')::date),
    signed_in_at = coalesce(signed_in_at, checked_at),
    signed_out_at = coalesce(signed_out_at, checked_at)
from public.users u
where u.id = a.student_id;

alter table public.attendance
  alter column signed_in_at set default now(),
  alter column signed_out_at set default now(),
  alter column attendance_date set default ((now() at time zone 'Africa/Lagos')::date);

alter table public.attendance
  drop constraint if exists attendance_sign_out_not_before_sign_in;
alter table public.attendance
  add constraint attendance_sign_out_not_before_sign_in
  check (signed_out_at is null or signed_in_at is null or signed_out_at >= signed_in_at);

create or replace function public.attendance_fill_student_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_matric text;
begin
  if new.student_id <> auth.uid() and auth.role = 'authenticated' then
    raise exception 'cannot create attendance for another student';
  end if;
  select nullif(regexp_replace(upper(coalesce(u.matric_number, '')), '\s+', '', 'g'), '')
  into v_matric from public.users u where u.id = new.student_id;
  new.matric_number := v_matric;
  new.attendance_date := coalesce(new.attendance_date, (clock_timestamp() at time zone 'Africa/Lagos')::date);
  new.signed_in_at := coalesce(new.signed_in_at, clock_timestamp());
  new.signed_out_at := coalesce(new.signed_out_at, new.signed_in_at);
  return new;
end;
$$;

drop trigger if exists attendance_fill_student_identity on public.attendance;
create trigger attendance_fill_student_identity
before insert on public.attendance
for each row execute function public.attendance_fill_student_identity();

create or replace function public.mark_present(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_attendance_id uuid;
  v_status text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'authentication_required');
  end if;
  select * into v_session from public.sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid_session');
  end if;
  if v_session.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'session_closed');
  end if;
  if clock_timestamp() < v_session.starts_at or clock_timestamp() > v_session.ends_at then
    return jsonb_build_object('ok', false, 'reason', 'outside_time_window');
  end if;
  if not public.has_role(v_session.university_id, 'student') then
    return jsonb_build_object('ok', false, 'reason', 'student_role_required');
  end if;
  if not exists (
    select 1 from public.enrollments
    where course_id = v_session.course_id and student_id = v_user_id and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_enrolled');
  end if;
  if exists (select 1 from public.attendance where session_id = p_session_id and student_id = v_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'already_checked_in');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || p_session_id::text, 0));
  if exists (select 1 from public.attendance where session_id = p_session_id and student_id = v_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'already_checked_in');
  end if;

  v_status := case when clock_timestamp() <= v_session.starts_at + make_interval(mins => v_session.late_after_minutes)
    then 'present' else 'late' end;
  begin
    insert into public.attendance (
      university_id, session_id, course_id, student_id, status, checked_at, source
    ) values (
      v_session.university_id, p_session_id, v_session.course_id, v_user_id, v_status, clock_timestamp(), 'session_code'
    ) returning id into v_attendance_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_checked_in');
  end;
  return jsonb_build_object('ok', true, 'status', v_status, 'attendance_id', v_attendance_id,
    'message', 'Present — your attendance and both timestamps have been recorded successfully.');
end;
$$;

revoke all on function public.mark_present(uuid) from public;
grant execute on function public.mark_present(uuid) to authenticated;
