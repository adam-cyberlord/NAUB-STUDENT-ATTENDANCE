-- Students bind their first browser automatically; any later device stays pending until an admin approves it.
create or replace function public.register_device(p_device_identifier uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
  v_existing public.devices%rowtype;
begin
  select * into v_user from public.users
  where id = auth.uid() and deleted_at is null and account_status = 'active';
  if not found or p_device_identifier is null then
    return jsonb_build_object('ok', false, 'reason', 'authentication_required');
  end if;

  select * into v_existing from public.devices where device_identifier = p_device_identifier;
  if found then
    if v_existing.user_id <> v_user.id then
      return jsonb_build_object('ok', false, 'reason', 'device_in_use');
    end if;
    update public.devices set last_seen_at = now() where id = v_existing.id;
    return jsonb_build_object('ok', v_existing.status = 'active', 'status', v_existing.status);
  end if;

  insert into public.devices (university_id, user_id, device_identifier, status, approved_at)
  select v_user.university_id, v_user.id, p_device_identifier,
         case when exists (select 1 from public.devices d where d.user_id = v_user.id and d.status = 'active') then 'pending' else 'active' end,
         case when exists (select 1 from public.devices d where d.user_id = v_user.id and d.status = 'active') then null else now() end
  returning * into v_existing;
  return jsonb_build_object('ok', v_existing.status = 'active', 'status', v_existing.status);
end;
$$;

revoke all on function public.register_device(uuid) from public;
grant execute on function public.register_device(uuid) to authenticated;
