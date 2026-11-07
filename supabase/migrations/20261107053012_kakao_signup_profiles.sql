-- Kakao does not provide the email-signup form's display_name or time_zone.
-- Provider selection is server-controlled app metadata, never user metadata.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_name text;
  selected_time_zone text;
begin
  selected_name := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
  selected_time_zone := nullif(btrim(new.raw_user_meta_data ->> 'time_zone'), '');

  if new.raw_app_meta_data ->> 'provider' = 'kakao' then
    selected_name := left(coalesce(
      selected_name,
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'preferred_username'), ''),
      '레몬 친구'
    ), 40);
    selected_time_zone := coalesce(selected_time_zone, 'Asia/Seoul');
  end if;

  if selected_name is null or char_length(selected_name) > 40 then
    raise exception 'INVALID_DISPLAY_NAME' using errcode = 'P0001';
  end if;
  if selected_time_zone is null
    or char_length(selected_time_zone) > 64
    or not exists (
      select 1 from pg_catalog.pg_timezone_names
      where name = selected_time_zone
    ) then
    raise exception 'INVALID_TIME_ZONE' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, display_name) values (new.id, selected_name);
  insert into public.profile_private (user_id, time_zone, invite_code)
  values (
    new.id,
    selected_time_zone,
    upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 10))
  );
  insert into public.pets (user_id) values (new.id);
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
