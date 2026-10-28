-- Additive security and attendance corrections. Apply after all prior migrations.

create or replace function public.has_role(p_university_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.users u on u.id = ur.user_id
    where ur.user_id = auth.uid()
      and u.deleted_at is null
      and u.account_status = 'active'
      and r.name = p_role
      and (ur.university_id = p_university_id or (p_role = 'super_admin' and ur.university_id is null))
      and (r.name not in ('lecturer') or ur.approved_at is not null)
  );
$$;

create or replace function public.is_university_member(p_university_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.users u on u.id = ur.user_id
    where ur.user_id = auth.uid()
      and u.deleted_at is null
      and u.account_status = 'active'
      and ur.university_id = p_university_id
      and (r.name <> 'lecturer' or ur.approved_at is not null)
  ) or public.has_role(null, 'super_admin');
$$;

alter table public.attendance
  alter column signed_out_at drop default;

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
  return new;
end;
$$;

create or replace function public.sign_out_attendance(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attendance public.attendance%rowtype;
begin
  update public.attendance
  set signed_out_at = coalesce(signed_out_at, clock_timestamp())
  where session_id = p_session_id and student_id = auth.uid()
  returning * into v_attendance;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'attendance_not_found');
  end if;
  return jsonb_build_object('ok', true, 'signed_out_at', v_attendance.signed_out_at);
end;
$$;

revoke all on function public.sign_out_attendance(uuid) from public;
grant execute on function public.sign_out_attendance(uuid) to authenticated;

create or replace function public.cancel_class_schedule(p_schedule_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.class_schedules
  set status = 'cancelled', updated_at = clock_timestamp()
  where id = p_schedule_id
    and lecturer_id = auth.uid()
    and public.has_role(university_id, 'lecturer');
  if not found then
    raise exception 'not authorized or schedule not found';
  end if;
end;
$$;

revoke all on function public.cancel_class_schedule(uuid) from public;
grant execute on function public.cancel_class_schedule(uuid) to authenticated;