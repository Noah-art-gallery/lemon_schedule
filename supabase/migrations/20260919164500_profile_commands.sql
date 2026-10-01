create function public.update_my_profile(
  new_display_name text default null,
  new_time_zone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_name text;
  current_time_zone text;
  changed_at timestamptz := clock_timestamp();
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select display_name into current_name
  from public.profiles
  where id = current_user_id
  for update;

  select time_zone into current_time_zone
  from public.profile_private
  where user_id = current_user_id
  for update;

  if new_display_name is not null then
    current_name := btrim(new_display_name);
    if current_name = '' or char_length(current_name) > 40 then
      raise exception 'INVALID_DISPLAY_NAME' using errcode = 'P0001';
    end if;
  end if;

  if new_time_zone is not null then
    current_time_zone := btrim(new_time_zone);
    if current_time_zone = ''
      or char_length(current_time_zone) > 64
      or not exists (
        select 1 from pg_catalog.pg_timezone_names where name = current_time_zone
      ) then
      raise exception 'INVALID_TIME_ZONE' using errcode = 'P0001';
    end if;
  end if;

  update public.profiles
  set display_name = current_name, updated_at = changed_at
  where id = current_user_id;

  update public.profile_private
  set time_zone = current_time_zone, updated_at = changed_at
  where user_id = current_user_id;

  return jsonb_build_object(
    'profileId', current_user_id,
    'displayName', current_name,
    'timeZone', current_time_zone,
    'updatedAt', changed_at
  );
end;
$$;

create function public.list_blocked_profiles()
returns table (user_id uuid, display_name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select blocked.id, blocked.display_name, block.created_at
  from public.blocks as block
  join public.profiles as blocked on blocked.id = block.blocked_id
  where block.blocker_id = (select auth.uid())
  order by block.created_at desc;
$$;

revoke all on function public.update_my_profile(text, text) from public, anon;
revoke all on function public.list_blocked_profiles() from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.list_blocked_profiles() to authenticated;
