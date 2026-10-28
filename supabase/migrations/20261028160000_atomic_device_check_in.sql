-- First-device binding happens only as part of an accepted check-in, and only for students
-- who have never had a device (a revoked or pending device always needs admin approval).
create or replace function public.check_in_with_device(
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
  v_user public.users%rowtype;
  v_device public.devices%rowtype;
  v_bound_id uuid;
  v_result jsonb;
begin
  select * into v_user from public.users
  where id = auth.uid() and deleted_at is null and account_status = 'active';
  if not found or p_device_identifier is null then
    return jsonb_build_object('ok', false, 'reason', 'authentication_required');
  end if;

  select * into v_device from public.devices where device_identifier = p_device_identifier;
  if found then
    if v_device.user_id <> v_user.id then
      return jsonb_build_object('ok', false, 'reason', 'device_in_use');
    end if;
    update public.devices set last_seen_at = now() where id = v_device.id;
    if v_device.status <> 'active' then
      return jsonb_build_object('ok', false, 'reason', v_device.status);
    end if;
  elsif exists (select 1 from public.devices d where d.user_id = v_user.id) then
    insert into public.devices (university_id, user_id, device_identifier, status)
    values (v_user.university_id, v_user.id, p_device_identifier, 'pending');
    return jsonb_build_object('ok', false, 'reason', 'pending');
  else
    insert into public.devices (university_id, user_id, device_identifier, status, approved_at)
    values (v_user.university_id, v_user.id, p_device_identifier, 'active', now())
    returning id into v_bound_id;
  end if;

  v_result := public.mark_attendance(p_qr_token, p_device_identifier, p_latitude, p_longitude, p_accuracy_metres);
  if v_bound_id is not null and not coalesce((v_result->>'ok')::boolean, false) then
    delete from public.devices where id = v_bound_id;
  end if;
  return v_result;
end;
$$;

revoke all on function public.check_in_with_device(text, uuid, double precision, double precision, double precision) from public;
grant execute on function public.check_in_with_device(text, uuid, double precision, double precision, double precision) to authenticated;

drop function if exists public.register_device(uuid);
