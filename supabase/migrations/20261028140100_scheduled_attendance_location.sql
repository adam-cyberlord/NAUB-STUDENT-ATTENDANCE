-- Scheduled attendance previously created sessions with a 0,0 geofence, so every
-- GPS-checked check-in was rejected. The lecturer's device location at the start of
-- class now becomes the classroom geofence.

create or replace function public.start_scheduled_attendance(
  p_schedule_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_radius_metres integer default 50
)
returns table (session_id uuid, qr_token text) language plpgsql security definer set search_path='' as $$
declare v_schedule public.class_schedules%rowtype; v_session_id uuid; v_created record; begin
  select * into v_schedule from public.class_schedules where id=p_schedule_id for update;
  if not found or v_schedule.lecturer_id<>auth.uid() then
    raise exception 'not authorized for this schedule';
  end if;
  if v_schedule.status='cancelled' then
    raise exception 'cancelled schedule';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
     or (p_latitude = 0 and p_longitude = 0) then
    raise exception 'a valid classroom location is required';
  end if;
  if v_schedule.attendance_session_id is not null then
    return query select v_schedule.attendance_session_id, null::text;
    return;
  end if;
  select * into v_created from public.create_class_session(
    v_schedule.course_id, v_schedule.starts_at, v_schedule.ends_at, v_schedule.venue,
    p_latitude, p_longitude, coalesce(p_radius_metres, 50), 15
  );
  v_session_id := v_created.session_id;
  update public.sessions set schedule_id=p_schedule_id where id=v_session_id;
  update public.class_schedules set attendance_session_id=v_session_id where id=p_schedule_id;
  return query select v_session_id, v_created.qr_token;
end; $$;

drop function if exists public.start_scheduled_attendance(uuid);
revoke all on function public.start_scheduled_attendance(uuid, double precision, double precision, integer) from public;
grant execute on function public.start_scheduled_attendance(uuid, double precision, double precision, integer) to authenticated;
