-- Fix attendance identity trigger: `auth.role` is not a valid column reference
-- (must be the function auth.role()), which made every attendance insert fail.

create or replace function public.attendance_fill_student_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_matric text;
begin
  if auth.uid() is not null and new.student_id <> auth.uid() and auth.role() = 'authenticated' then
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
