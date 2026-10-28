-- NAUB Student Attendance MVP database foundation for Supabase Postgres.
-- Apply with: supabase db push
-- Authenticated writes to attendance are intentionally limited to RPC functions.

create extension if not exists pgcrypto with schema extensions;

create table public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  country_code text not null default 'NG' check (country_code = 'NG'),
  timezone text not null default 'Africa/Lagos',
  attendance_threshold numeric(5,2) not null default 75 check (attendance_threshold between 0 and 100),
  retention_days integer not null default 730 check (retention_days between 30 and 3650),
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  university_id uuid references public.universities(id) on delete restrict,
  full_name text not null,
  matric_number text,
  staff_id text,
  faculty text,
  department text,
  level text,
  phone text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, university_id),
  constraint user_identity_role_fields check (
    (matric_number is not null and staff_id is null)
    or (matric_number is null and staff_id is not null)
    or (matric_number is null and staff_id is null)
  )
);
create unique index users_matric_number_per_university
  on public.users (university_id, lower(matric_number))
  where matric_number is not null;
create unique index users_staff_id_per_university
  on public.users (university_id, lower(staff_id))
  where staff_id is not null;

create table public.roles (
  id smallint generated always as identity primary key,
  name text not null unique check (name in ('student', 'lecturer', 'course_rep', 'university_admin', 'super_admin'))
);
insert into public.roles (name)
values ('student'), ('lecturer'), ('course_rep'), ('university_admin'), ('super_admin')
on conflict (name) do nothing;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  university_id uuid references public.universities(id) on delete cascade,
  role_id smallint not null references public.roles(id),
  approved_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index user_roles_tenant_role_unique
  on public.user_roles (user_id, role_id, university_id)
  where university_id is not null;
create unique index user_roles_platform_role_unique
  on public.user_roles (user_id, role_id)
  where university_id is null;

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  course_code text not null,
  title text not null,
  department text not null,
  semester text not null,
  lecturer_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (university_id, course_code, semester),
  unique (id, university_id)
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'withdrawn')),
  created_at timestamptz not null default now(),
  unique (course_id, student_id),
  foreign key (course_id, university_id) references public.courses(id, university_id) on delete cascade,
  foreign key (student_id, university_id) references public.users(id, university_id) on delete cascade
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  device_identifier uuid not null unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  approved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  foreign key (user_id, university_id) references public.users(id, university_id) on delete cascade
);
create unique index devices_one_active_per_student
  on public.devices (user_id) where status = 'active';

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location_name text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_metres integer not null default 50 check (radius_metres between 10 and 2000),
  late_after_minutes integer not null default 15 check (late_after_minutes between 0 and 240),
  token_hash bytea not null unique,
  token_rotated_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '8 hours'),
  unique (id, university_id),
  unique (id, course_id, university_id),
  foreign key (course_id, university_id) references public.courses(id, university_id) on delete cascade
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  status text not null check (status in ('present', 'late', 'absent', 'excused')),
  checked_at timestamptz not null default now(),
  latitude double precision,
  longitude double precision,
  accuracy_metres double precision,
  device_id uuid references public.devices(id) on delete set null,
  source text not null default 'qr' check (source in ('qr', 'session_code', 'manual')),
  unique (session_id, student_id),
  foreign key (session_id, course_id, university_id) references public.sessions(id, course_id, university_id) on delete cascade,
  foreign key (session_id, university_id) references public.sessions(id, university_id) on delete cascade,
  foreign key (course_id, university_id) references public.courses(id, university_id) on delete cascade,
  foreign key (student_id, university_id) references public.users(id, university_id) on delete cascade
);
create index attendance_course_student on public.attendance (course_id, student_id);
create index attendance_university_checked_at on public.attendance (university_id, checked_at desc);

create table public.attendance_attempts (
  id bigint generated always as identity primary key,
  user_id uuid references public.users(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  token_hash bytea not null,
  device_identifier uuid,
  latitude double precision,
  longitude double precision,
  accuracy_metres double precision,
  ip_address inet,
  outcome text not null,
  attempted_at timestamptz not null default now()
);
create index attendance_attempts_user_time on public.attendance_attempts (user_id, attempted_at desc);

create table public.excuse_requests (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  reason text not null check (reason in ('sickness', 'official_duty', 'other')),
  document_path text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, session_id),
  foreign key (session_id, university_id) references public.sessions(id, university_id) on delete cascade,
  foreign key (student_id, university_id) references public.users(id, university_id) on delete cascade
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (user_id, university_id) references public.users(id, university_id) on delete cascade
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  university_id uuid references public.universities(id) on delete set null,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_time on public.audit_logs (university_id, created_at desc);

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
    where ur.user_id = auth.uid()
      and ur.role_id is not null
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
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and ur.university_id = p_university_id
      and (r.name <> 'lecturer' or ur.approved_at is not null)
  ) or public.has_role(null, 'super_admin');
$$;

alter table public.universities enable row level security;
alter table public.users enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.courses enable row level security;
alter table public.enrollments enable row level security;
alter table public.devices enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.attendance_attempts enable row level security;
alter table public.excuse_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy "university members can read their tenant"
  on public.universities for select to authenticated
  using (public.is_university_member(id));
create policy "platform admins can onboard universities"
  on public.universities for insert to authenticated
  with check (public.has_role(null, 'super_admin'));
create policy "university admins can update their tenant"
  on public.universities for update to authenticated
  using (public.has_role(id, 'university_admin') or public.has_role(null, 'super_admin'))
  with check (public.has_role(id, 'university_admin') or public.has_role(null, 'super_admin'));

create policy "users can read self and authorized university profiles"
  on public.users for select to authenticated
  using (
    id = auth.uid()
    or public.has_role(university_id, 'university_admin')
    or public.has_role(null, 'super_admin')
    or exists (
      select 1 from public.enrollments e
      join public.courses c on c.id = e.course_id
      where e.student_id = users.id and c.lecturer_id = auth.uid()
    )
  );
create policy "users can update their own basic profile"
  on public.users for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
create policy "users can read roles for their tenant"
  on public.roles for select to authenticated
  using (true);
create policy "users can read their own role assignments"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'));
create policy "admins can assign tenant roles"
  on public.user_roles for insert to authenticated
  with check (
    public.has_role(null, 'super_admin')
    or (
      public.has_role(university_id, 'university_admin')
      and exists (select 1 from public.users u where u.id = user_id and u.university_id = user_roles.university_id)
    )
  );
create policy "admins can update tenant role approvals"
  on public.user_roles for update to authenticated
  using (public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'))
  with check (
    public.has_role(null, 'super_admin')
    or (
      public.has_role(university_id, 'university_admin')
      and exists (select 1 from public.users u where u.id = user_id and u.university_id = user_roles.university_id)
    )
  );

create policy "members can read their tenant courses"
  on public.courses for select to authenticated
  using (public.is_university_member(university_id));
create policy "approved lecturers and admins can create courses"
  on public.courses for insert to authenticated
  with check (
    public.has_role(university_id, 'university_admin')
    or (lecturer_id = auth.uid() and public.has_role(university_id, 'lecturer'))
  );
create policy "course lecturers and admins can update courses"
  on public.courses for update to authenticated
  using (lecturer_id = auth.uid() and public.has_role(university_id, 'lecturer') or public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'))
  with check (lecturer_id = auth.uid() and public.has_role(university_id, 'lecturer') or public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'));

create policy "students see own enrolments and lecturers see course rosters"
  on public.enrollments for select to authenticated
  using (
    student_id = auth.uid()
    or public.has_role(university_id, 'university_admin')
    or public.has_role(null, 'super_admin')
    or exists (select 1 from public.courses c where c.id = course_id and c.lecturer_id = auth.uid())
  );
create policy "admins manage course enrolments"
  on public.enrollments for all to authenticated
  using (public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'))
  with check (public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'));

create policy "users and admins can view registered devices"
  on public.devices for select to authenticated
  using (user_id = auth.uid() or public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'));
create policy "university admins approve or revoke devices"
  on public.devices for update to authenticated
  using (public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'))
  with check (public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'));

create policy "members can view sessions in their university"
  on public.sessions for select to authenticated
  using (public.is_university_member(university_id));
create policy "students can read their own attendance"
  on public.attendance for select to authenticated
  using (
    student_id = auth.uid()
    or public.has_role(university_id, 'university_admin')
    or public.has_role(null, 'super_admin')
    or exists (select 1 from public.courses c where c.id = course_id and c.lecturer_id = auth.uid())
  );
create policy "lecturers and admins can read attempt review data"
  on public.attendance_attempts for select to authenticated
  using (
    public.has_role(null, 'super_admin')
    or exists (
      select 1 from public.sessions s
      join public.courses c on c.id = s.course_id
      where s.id = session_id
        and (c.lecturer_id = auth.uid() or public.has_role(s.university_id, 'university_admin'))
    )
  );

create policy "students read and create their excuse requests"
  on public.excuse_requests for select to authenticated
  using (
    student_id = auth.uid()
    or public.has_role(university_id, 'university_admin')
    or public.has_role(null, 'super_admin')
    or exists (select 1 from public.sessions s join public.courses c on c.id=s.course_id where s.id=session_id and c.lecturer_id=auth.uid())
  );
create policy "students can request an excuse for their own session"
  on public.excuse_requests for insert to authenticated
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.sessions s
      join public.enrollments e on e.course_id = s.course_id
      where s.id = session_id
        and s.university_id = excuse_requests.university_id
        and e.student_id = auth.uid()
        and e.status = 'active'
    )
  );
create policy "lecturers and admins can review excuses"
  on public.excuse_requests for update to authenticated
  using (
    public.has_role(university_id, 'university_admin')
    or public.has_role(null, 'super_admin')
    or exists (select 1 from public.sessions s join public.courses c on c.id=s.course_id where s.id=session_id and c.lecturer_id=auth.uid())
  )
  with check (
    public.has_role(university_id, 'university_admin')
    or public.has_role(null, 'super_admin')
    or exists (select 1 from public.sessions s join public.courses c on c.id=s.course_id where s.id=session_id and c.lecturer_id=auth.uid())
  );

create policy "users read and mark their own notifications"
  on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "users update their own notifications"
  on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "university admins read their audit trail"
  on public.audit_logs for select to authenticated
  using (public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'));

revoke all on table public.universities, public.users, public.roles, public.user_roles,
  public.courses, public.enrollments, public.devices, public.sessions, public.attendance,
  public.attendance_attempts, public.excuse_requests, public.notifications, public.audit_logs
  from anon, authenticated;
grant select on public.universities, public.users, public.roles, public.user_roles,
  public.courses, public.enrollments, public.devices, public.sessions, public.attendance,
  public.attendance_attempts, public.excuse_requests, public.notifications, public.audit_logs
  to authenticated;
revoke select on public.users, public.sessions, public.attendance_attempts from authenticated;
grant select (id, university_id, full_name, matric_number, staff_id, faculty, department, level, created_at, deleted_at)
  on public.users to authenticated;
grant select (id, university_id, course_id, created_by, starts_at, ends_at, location_name,
  latitude, longitude, radius_metres, late_after_minutes, token_rotated_at, status, closed_at, created_at)
  on public.sessions to authenticated;
grant select (id, user_id, session_id, device_identifier, latitude, longitude, accuracy_metres, ip_address, outcome, attempted_at)
  on public.attendance_attempts to authenticated;
grant insert, update on public.universities to authenticated;
grant insert, update on public.user_roles to authenticated;
grant insert, update on public.courses to authenticated;
grant insert, update, delete on public.enrollments to authenticated;
grant update on public.devices to authenticated;
grant insert, update on public.excuse_requests to authenticated;
revoke update on public.users from authenticated;
grant update (full_name, phone) on public.users to authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke update on public.excuse_requests from authenticated;
grant update (status, reviewed_by, reviewed_at) on public.excuse_requests to authenticated;

create or replace function public.create_class_session(
  p_course_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location_name text,
  p_latitude double precision,
  p_longitude double precision,
  p_radius_metres integer default 50,
  p_late_after_minutes integer default 15
)
returns table (session_id uuid, qr_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course public.courses%rowtype;
  v_token text;
  v_session_id uuid;
begin
  select * into v_course from public.courses where id = p_course_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'course_not_found';
  end if;
  if not (v_course.lecturer_id is not distinct from auth.uid() and public.has_role(v_course.university_id, 'lecturer'))
    and not public.has_role(v_course.university_id, 'university_admin') then
    raise exception using errcode = '42501', message = 'not_authorized_to_create_sessions';
  end if;
  if p_starts_at is null or p_ends_at is null or p_radius_metres is null
    or p_late_after_minutes is null or p_latitude is null or p_longitude is null
    or p_location_name is null then
    raise exception using errcode = '22023', message = 'invalid_session_details';
  end if;
  if p_ends_at <= p_starts_at or p_ends_at - p_starts_at > interval '8 hours' then
    raise exception using errcode = '22023', message = 'invalid_session_time_window';
  end if;
  if p_radius_metres not between 10 and 2000
    or p_late_after_minutes not between 0 and 240
    or p_latitude not between -90 and 90
    or p_longitude not between -180 and 180
    or length(trim(p_location_name)) not between 2 and 160 then
    raise exception using errcode = '22023', message = 'invalid_session_details';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.sessions (
    university_id, course_id, created_by, starts_at, ends_at, location_name,
    latitude, longitude, radius_metres, late_after_minutes, token_hash
  ) values (
    v_course.university_id, v_course.id, auth.uid(), p_starts_at, p_ends_at, trim(p_location_name),
    p_latitude, p_longitude, p_radius_metres, p_late_after_minutes,
    extensions.digest(convert_to(v_token, 'UTF8'), 'sha256')
  ) returning id into v_session_id;

  insert into public.audit_logs (university_id, actor_id, action, entity_type, entity_id, details)
  values (v_course.university_id, auth.uid(), 'session.created', 'session', v_session_id,
    jsonb_build_object('course_id', v_course.id, 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'radius_metres', p_radius_metres));

  return query select v_session_id, v_token;
end;
$$;

create or replace function public.rotate_session_qr(p_session_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
  v_token text;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'session_not_found';
  end if;
  if not (
    (v_session.created_by = auth.uid() and public.has_role(v_session.university_id, 'lecturer'))
    or public.has_role(v_session.university_id, 'university_admin')
  ) then
    raise exception using errcode = '42501', message = 'not_authorized_to_rotate_qr';
  end if;
  if v_session.status <> 'open' or now() > v_session.ends_at then
    raise exception using errcode = 'P0001', message = 'session_not_open';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.sessions
    set token_hash = extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
        token_rotated_at = now()
    where id = p_session_id;
  insert into public.audit_logs (university_id, actor_id, action, entity_type, entity_id)
  values (v_session.university_id, auth.uid(), 'session.qr_rotated', 'session', p_session_id);
  return v_token;
end;
$$;

create or replace function public.update_class_session(
  p_session_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location_name text,
  p_latitude double precision,
  p_longitude double precision,
  p_radius_metres integer,
  p_late_after_minutes integer default 15
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'session_not_found';
  end if;
  if not (
    (v_session.created_by = auth.uid() and public.has_role(v_session.university_id, 'lecturer'))
    or public.has_role(v_session.university_id, 'university_admin')
  ) then
    raise exception using errcode = '42501', message = 'not_authorized_to_edit_session';
  end if;
  if v_session.status <> 'open' or now() > v_session.ends_at then
    raise exception using errcode = 'P0001', message = 'session_not_open';
  end if;
  if p_starts_at is null or p_ends_at is null or p_location_name is null
    or p_latitude is null or p_longitude is null or p_radius_metres is null
    or p_late_after_minutes is null
    or p_ends_at <= p_starts_at or p_ends_at - p_starts_at > interval '8 hours'
    or p_radius_metres not between 10 and 2000
    or p_late_after_minutes not between 0 and 240
    or p_latitude not between -90 and 90
    or p_longitude not between -180 and 180
    or length(trim(p_location_name)) not between 2 and 160 then
    raise exception using errcode = '22023', message = 'invalid_session_details';
  end if;

  update public.sessions set
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    location_name = trim(p_location_name),
    latitude = p_latitude,
    longitude = p_longitude,
    radius_metres = p_radius_metres,
    late_after_minutes = p_late_after_minutes
  where id = p_session_id;
  insert into public.audit_logs (university_id, actor_id, action, entity_type, entity_id, details)
  values (v_session.university_id, auth.uid(), 'session.updated', 'session', p_session_id,
    jsonb_build_object('starts_at', p_starts_at, 'ends_at', p_ends_at, 'location_name', trim(p_location_name), 'radius_metres', p_radius_metres));
end;
$$;

create or replace function public.close_class_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'session_not_found';
  end if;
  if not (
    (v_session.created_by = auth.uid() and public.has_role(v_session.university_id, 'lecturer'))
    or public.has_role(v_session.university_id, 'university_admin')
  ) then
    raise exception using errcode = '42501', message = 'not_authorized_to_close_session';
  end if;
  update public.sessions set status = 'closed', closed_at = now() where id = p_session_id;
  insert into public.audit_logs (university_id, actor_id, action, entity_type, entity_id)
  values (v_session.university_id, auth.uid(), 'session.closed', 'session', p_session_id);
end;
$$;

create or replace function public.mark_attendance(
  p_qr_token text,
  p_device_identifier uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_metres double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_token_hash bytea;
  v_distance_metres double precision;
  v_status text;
  v_attendance_id uuid;
  v_attempt_id bigint;
  v_outcome text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'authentication_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  v_token_hash := extensions.digest(convert_to(left(coalesce(p_qr_token, ''), 128), 'UTF8'), 'sha256');
  if (
    select count(*) from public.attendance_attempts aa
    where aa.user_id = v_user_id and aa.attempted_at > now() - interval '1 minute'
  ) >= 8 then
    insert into public.attendance_attempts (user_id, token_hash, device_identifier, latitude, longitude, accuracy_metres, outcome)
    values (v_user_id, v_token_hash, p_device_identifier, p_latitude, p_longitude, p_accuracy_metres, 'rate_limited');
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  if p_qr_token is null or length(p_qr_token) <> 64 then
    insert into public.attendance_attempts (user_id, token_hash, device_identifier, latitude, longitude, accuracy_metres, outcome)
    values (v_user_id, v_token_hash, p_device_identifier, p_latitude, p_longitude, p_accuracy_metres, 'invalid_token');
    return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;
  v_token_hash := extensions.digest(convert_to(p_qr_token, 'UTF8'), 'sha256');

  select * into v_session from public.sessions where token_hash = v_token_hash;
  if not found then
    insert into public.attendance_attempts (user_id, token_hash, device_identifier, latitude, longitude, accuracy_metres, outcome)
    values (v_user_id, v_token_hash, p_device_identifier, p_latitude, p_longitude, p_accuracy_metres, 'invalid_token');
    return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;
  if v_session.status <> 'open' then
    v_outcome := 'session_closed';
  elsif now() < v_session.starts_at or now() > v_session.ends_at then
    v_outcome := 'outside_time_window';
  elsif p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
    or p_accuracy_metres is null or p_accuracy_metres <= 0
    or p_accuracy_metres > 100 then
    v_outcome := 'gps_accuracy_unacceptable';
  else
    v_distance_metres := 6371000 * 2 * asin(sqrt(least(1::double precision, greatest(0::double precision,
      power(sin(radians(p_latitude - v_session.latitude) / 2), 2)
      + cos(radians(v_session.latitude)) * cos(radians(p_latitude))
      * power(sin(radians(p_longitude - v_session.longitude) / 2), 2)
    ))));
    if v_distance_metres > v_session.radius_metres then
      v_outcome := 'outside_radius';
    elsif not public.has_role(v_session.university_id, 'student') then
      v_outcome := 'student_role_required';
    elsif not exists (
      select 1 from public.enrollments e
      where e.course_id = v_session.course_id and e.student_id = v_user_id and e.status = 'active'
    ) then
      v_outcome := 'not_enrolled';
    elsif exists (
      select 1 from public.attendance a
      where a.session_id = v_session.id and a.student_id = v_user_id
    ) then
      v_outcome := 'already_checked_in';
    elsif not exists (
      select 1 from public.devices d
      where d.user_id = v_user_id
        and d.university_id = v_session.university_id
        and d.device_identifier = p_device_identifier
        and d.status = 'active'
    ) then
      v_outcome := 'device_not_registered';
    else
      v_outcome := 'accepted';
    end if;
  end if;

  insert into public.attendance_attempts (
    user_id, session_id, token_hash, device_identifier, latitude, longitude, accuracy_metres, outcome
  ) values (
    v_user_id, v_session.id, v_token_hash, p_device_identifier, p_latitude, p_longitude, p_accuracy_metres, v_outcome
  ) returning id into v_attempt_id;

  if v_outcome <> 'accepted' then
    return jsonb_build_object('ok', false, 'reason', v_outcome);
  end if;

  v_status := case
    when now() <= v_session.starts_at + make_interval(mins => v_session.late_after_minutes) then 'present'
    else 'late'
  end;
  begin
    insert into public.attendance (
      university_id, session_id, course_id, student_id, status, latitude, longitude,
      accuracy_metres, device_id, source
    ) values (
      v_session.university_id, v_session.id, v_session.course_id, v_user_id, v_status,
      p_latitude, p_longitude, p_accuracy_metres,
      (select d.id from public.devices d where d.device_identifier = p_device_identifier and d.user_id = v_user_id),
      'qr'
    ) returning id into v_attendance_id;
  exception when unique_violation then
    update public.attendance_attempts set outcome = 'already_checked_in' where id = v_attempt_id;
    return jsonb_build_object('ok', false, 'reason', 'already_checked_in');
  end;

  update public.attendance_attempts set outcome = v_status where id = v_attempt_id;
  insert into public.audit_logs (university_id, actor_id, action, entity_type, entity_id, details)
  values (v_session.university_id, v_user_id, 'attendance.checked_in', 'attendance', v_attendance_id,
    jsonb_build_object('session_id', v_session.id, 'status', v_status));
  return jsonb_build_object('ok', true, 'status', v_status, 'attendance_id', v_attendance_id);
end;
$$;

create or replace function public.audit_admin_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_university_id uuid;
  v_entity_id uuid;
  v_changed_fields text[];
begin
  v_university_id := coalesce(nullif(v_new ->> 'university_id', '')::uuid, nullif(v_old ->> 'university_id', '')::uuid);
  if tg_table_name = 'universities' then
    v_university_id := coalesce(nullif(v_new ->> 'id', '')::uuid, nullif(v_old ->> 'id', '')::uuid);
  end if;
  v_entity_id := coalesce(nullif(v_new ->> 'id', '')::uuid, nullif(v_old ->> 'id', '')::uuid);

  select coalesce(array_agg(coalesce(n.key, o.key) order by coalesce(n.key, o.key)), array[]::text[])
    into v_changed_fields
    from jsonb_each(v_new) n
    full join jsonb_each(v_old) o using (key)
    where n.value is distinct from o.value;

  insert into public.audit_logs (university_id, actor_id, action, entity_type, entity_id, details)
  values (
    v_university_id,
    auth.uid(),
    lower(tg_table_name) || '.' || lower(tg_op),
    lower(tg_table_name),
    v_entity_id,
    jsonb_build_object('changed_fields', v_changed_fields)
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger audit_university_edits after insert or update or delete on public.universities
  for each row execute function public.audit_admin_edit();
create trigger audit_role_edits after insert or update or delete on public.user_roles
  for each row execute function public.audit_admin_edit();
create trigger audit_course_edits after insert or update or delete on public.courses
  for each row execute function public.audit_admin_edit();
create trigger audit_enrollment_edits after insert or update or delete on public.enrollments
  for each row execute function public.audit_admin_edit();
create trigger audit_device_edits after insert or update or delete on public.devices
  for each row execute function public.audit_admin_edit();
create trigger audit_excuse_edits after insert or update or delete on public.excuse_requests
  for each row execute function public.audit_admin_edit();

revoke all on function public.has_role(uuid, text) from public;
revoke all on function public.is_university_member(uuid) from public;
revoke all on function public.create_class_session(uuid, timestamptz, timestamptz, text, double precision, double precision, integer, integer) from public;
revoke all on function public.rotate_session_qr(uuid) from public;
revoke all on function public.update_class_session(uuid, timestamptz, timestamptz, text, double precision, double precision, integer, integer) from public;
revoke all on function public.close_class_session(uuid) from public;
revoke all on function public.mark_attendance(text, uuid, double precision, double precision, double precision) from public;
revoke all on function public.audit_admin_edit() from public;
grant execute on function public.has_role(uuid, text) to authenticated;
grant execute on function public.is_university_member(uuid) to authenticated;
grant execute on function public.create_class_session(uuid, timestamptz, timestamptz, text, double precision, double precision, integer, integer) to authenticated;
grant execute on function public.rotate_session_qr(uuid) to authenticated;
grant execute on function public.update_class_session(uuid, timestamptz, timestamptz, text, double precision, double precision, integer, integer) to authenticated;
grant execute on function public.close_class_session(uuid) to authenticated;
grant execute on function public.mark_attendance(text, uuid, double precision, double precision, double precision) to authenticated;

-- Device approval and recovery workflow. Credentials remain server-side; only metadata is exposed.
alter table public.devices add column if not exists label text not null default 'Registered device';
alter table public.devices add column if not exists device_type text not null default 'browser';
alter table public.devices add column if not exists browser_info text;
alter table public.devices add column if not exists last_seen_at timestamptz not null default now();
alter table public.devices add column if not exists revoked_at timestamptz;

create table if not exists public.device_change_requests (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  previous_device_id uuid references public.devices(id) on delete set null,
  requested_label text not null check (length(requested_label) between 2 and 80),
  requested_type text not null,
  reason text not null,
  notes text,
  status text not null default 'pending' check (status in ('pending','under_review','approved','rejected','cancelled')),
  verification_status text not null default 'required' check (verification_status in ('required','pending','verified','failed')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  foreign key (student_id, university_id) references public.users(id, university_id) on delete cascade
);
create index if not exists device_change_requests_scope on public.device_change_requests (university_id, status, created_at desc);
alter table public.device_change_requests enable row level security;
create policy if not exists "students view own device requests" on public.device_change_requests for select to authenticated using (student_id = auth.uid() or public.has_role(university_id, 'university_admin') or exists (select 1 from public.courses c join public.enrollments e on e.course_id = c.id where e.student_id = device_change_requests.student_id and c.lecturer_id = auth.uid()));
create policy if not exists "students create own device requests" on public.device_change_requests for insert to authenticated with check (student_id = auth.uid());
create policy if not exists "authorized staff review device requests" on public.device_change_requests for update to authenticated using (public.has_role(university_id, 'university_admin') or exists (select 1 from public.courses c join public.enrollments e on e.course_id = c.id where e.student_id = device_change_requests.student_id and c.lecturer_id = auth.uid())) with check (public.has_role(university_id, 'university_admin') or exists (select 1 from public.courses c join public.enrollments e on e.course_id = c.id where e.student_id = device_change_requests.student_id and c.lecturer_id = auth.uid()));
grant select, insert, update on public.device_change_requests to authenticated;

-- Stage 2 approval workflow tables. Apply as a versioned migration in Supabase before enabling production writes.
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  email text not null,
  role text not null check (role in ('lecturer', 'student')),
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  invited_by uuid not null references public.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.registration_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  university_id uuid not null references public.universities(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'needs_correction')),
  reference_number text not null unique,
  rejection_reason text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.course_enrolment_requests (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (course_id, student_id)
);

alter table public.invitations enable row level security;
alter table public.registration_applications enable row level security;
alter table public.course_enrolment_requests enable row level security;
create index if not exists invitation_expiry_idx on public.invitations (expires_at) where used_at is null;
create index if not exists enrolment_request_student_idx on public.course_enrolment_requests (student_id, status);

create policy "admins manage invitations" on public.invitations for all to authenticated using (public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin')) with check (public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'));
create policy "students read own applications" on public.registration_applications for select to authenticated using (user_id = auth.uid() or public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'));
create policy "admins review applications" on public.registration_applications for update to authenticated using (public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin')) with check (public.has_role(university_id, 'university_admin') or public.has_role(null, 'super_admin'));
create policy "participants read enrolment requests" on public.course_enrolment_requests for select to authenticated using (student_id = auth.uid() or public.has_role(university_id, 'university_admin') or exists (select 1 from public.courses c where c.id = course_id and c.lecturer_id = auth.uid()));
create policy "authorized reviewers update enrolments" on public.course_enrolment_requests for update to authenticated using (public.has_role(university_id, 'university_admin') or exists (select 1 from public.courses c where c.id = course_id and c.lecturer_id = auth.uid() and public.has_role(university_id, 'lecturer'))) with check (public.has_role(university_id, 'university_admin') or exists (select 1 from public.courses c where c.id = course_id and c.lecturer_id = auth.uid() and public.has_role(university_id, 'lecturer')));

-- No client-side INSERT/UPDATE/DELETE policy exists for attendance or sessions.
-- Use these authenticated RPCs so authorization, token creation, audit, and
-- one-check-in-per-session enforcement execute atomically on the server.
