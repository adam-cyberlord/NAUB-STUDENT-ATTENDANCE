-- Authentication and account-status foundation.
-- Apply after base schema. Additive only; existing user and role rows are preserved.

alter table public.users
  add column if not exists account_status text not null default 'pending'
    check (account_status in ('pending', 'active', 'suspended', 'deactivated')),
  add column if not exists approval_reason text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.users(id) on delete set null;

create index if not exists users_account_status_idx
  on public.users (university_id, account_status);

create or replace function public.current_user_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'id', u.id,
      'university_id', u.university_id,
      'full_name', u.full_name,
      'matric_number', u.matric_number,
      'staff_id', u.staff_id,
      'faculty', u.faculty,
      'department', u.department,
      'account_status', u.account_status,
      'roles', coalesce((
        select jsonb_agg(r.name order by r.name)
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = u.id
          and (ur.approved_at is not null or r.name in ('student', 'super_admin'))
      ), '[]'::jsonb)
    )
    from public.users u
    where u.id = auth.uid()
      and u.deleted_at is null
      and u.account_status = 'active'
  ), '{}'::jsonb);
$$;

revoke all on function public.current_user_profile() from public;
grant execute on function public.current_user_profile() to authenticated;

create or replace function public.admin_set_account_status(
  p_user_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_university_id uuid;
begin
  if p_status not in ('pending', 'active', 'suspended', 'deactivated') then
    raise exception using errcode = '22023', message = 'invalid_account_status';
  end if;
  select university_id into v_university_id
  from public.users where id = p_user_id;
  if v_university_id is null
     or not (public.has_role(v_university_id, 'university_admin')
             or public.has_role(null, 'super_admin')) then
    raise exception using errcode = '42501', message = 'not_authorized_to_manage_account';
  end if;
  update public.users
  set account_status = p_status,
      approval_reason = nullif(btrim(p_reason), ''),
      approved_at = case when p_status = 'active' then clock_timestamp() else null end,
      approved_by = case when p_status = 'active' then auth.uid() else null end
  where id = p_user_id;
  insert into public.audit_logs (university_id, actor_id, action, entity_type, entity_id, details)
  values (
    v_university_id, auth.uid(), 'account.status_changed', 'user', p_user_id,
    jsonb_build_object('status', p_status, 'reason', p_reason)
  );
end;
$$;

revoke all on function public.admin_set_account_status(uuid, text, text) from public;
grant execute on function public.admin_set_account_status(uuid, text, text) to authenticated;

create policy "users can read their active profile"
  on public.users for select to authenticated
  using (id = auth.uid() and deleted_at is null);