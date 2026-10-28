-- Explicit read grants for tables the UI loads; RLS policies still restrict rows.
grant select on public.class_schedules, public.class_schedule_history, public.venues, public.lecturer_attendance to authenticated;
