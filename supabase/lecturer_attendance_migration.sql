-- Server-authoritative lecturer check-in records. Additive and non-destructive.
alter table public.users
  add column if not exists academic_session text;

create table if not exists public.lecturer_attendance (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  lecturer_id uuid not null references public.users(id) on delete cascade,
  schedule_id uuid not null references public.class_schedules(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete set null,
  checked_in_at timestamptz not null default clock_timestamp(),
  status text not null default 'on_time' check (status in ('on_time', 'late')),
  unique (lecturer_id, schedule_id)
);

create index if not exists lecturer_attendance_lecturer_time
  on public.lecturer_attendance (lecturer_id, checked_in_at desc);

alter table public.lecturer_attendance enable row level security;

create policy "lecturers and admins can view lecturer attendance"
  on public.lecturer_attendance for select to authenticated
  using (
    lecturer_id = auth.uid()
    or public.has_role(university_id, 'university_admin')
    or public.has_role(null, 'super_admin')
  );

create or replace function public.check_in_lecturer(p_schedule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.class_schedules%rowtype;
  v_record public.lecturer_attendance%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_schedule
  from public.class_schedules
  where id = p_schedule_id and lecturer_id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'schedule_not_found');
  end if;
  if v_schedule.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'schedule_cancelled');
  end if;
  if v_now < v_schedule.starts_at or v_now > v_schedule.ends_at then
    return jsonb_build_object('ok', false, 'reason', 'outside_time_window');
  end if;
  insert into public.lecturer_attendance (
    university_id, lecturer_id, schedule_id, course_id, venue_id, checked_in_at, status
  ) values (
    v_schedule.university_id, auth.uid(), v_schedule.id, v_schedule.course_id,
    v_schedule.venue_id, v_now,
    case when v_now <= v_schedule.starts_at + interval '15 minutes' then 'on_time' else 'late' end
  )
  on conflict (lecturer_id, schedule_id) do nothing
  returning * into v_record;
  if v_record.id is null then
    return jsonb_build_object('ok', false, 'reason', 'already_checked_in');
  end if;
  return jsonb_build_object(
    'ok', true, 'status', v_record.status, 'checked_in_at', v_record.checked_in_at,
    'schedule_id', v_record.schedule_id, 'course_id', v_record.course_id
  );
end;
$$;

revoke all on function public.check_in_lecturer(uuid) from public;
grant execute on function public.check_in_lecturer(uuid) to authenticated;
