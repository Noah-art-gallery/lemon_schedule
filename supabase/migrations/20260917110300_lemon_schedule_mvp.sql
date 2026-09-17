create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  time_zone text not null default 'Asia/Seoul' check (char_length(time_zone) between 1 and 64),
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{10}$'),
  lemon_points bigint not null default 0 check (lemon_points >= 0),
  pet_level integer not null default 1 check (pet_level >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.connection_requests (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  pair_low uuid generated always as (least(requester_id, addressee_id)) stored,
  pair_high uuid generated always as (greatest(requester_id, addressee_id)) stored,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index connection_requests_one_pending_pair_idx
  on public.connection_requests (pair_low, pair_high)
  where status = 'pending';
create index connection_requests_requester_idx
  on public.connection_requests (requester_id, status, created_at desc);
create index connection_requests_addressee_idx
  on public.connection_requests (addressee_id, status, created_at desc);

create table public.connections (
  id bigint generated always as identity primary key,
  user_low_id uuid not null references public.profiles (id) on delete cascade,
  user_high_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_low_id, user_high_id),
  check (user_low_id < user_high_id)
);

create index connections_high_user_idx on public.connections (user_high_id, user_low_id);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id, blocker_id);

create table public.tasks (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  due_date date not null,
  due_time time,
  recurrence text not null default 'none'
    check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  recurrence_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create index tasks_owner_due_idx on public.tasks (owner_id, due_date, id);

create table public.task_occurrences (
  id bigint generated always as identity primary key,
  task_id bigint not null,
  owner_id uuid not null,
  occurrence_date date not null,
  title_snapshot text not null check (char_length(title_snapshot) between 1 and 120),
  due_time time,
  recurrence_snapshot text not null
    check (recurrence_snapshot in ('none', 'daily', 'weekly', 'monthly')),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  completed_at timestamptz,
  first_completed_at timestamptz,
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, occurrence_date),
  foreign key (task_id, owner_id)
    references public.tasks (id, owner_id) on delete cascade,
  check (
    (status = 'pending' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

create index task_occurrences_owner_date_idx
  on public.task_occurrences (owner_id, occurrence_date, status, id);
create index task_occurrences_task_idx on public.task_occurrences (task_id, occurrence_date);

create table public.completion_events (
  id bigint generated always as identity primary key,
  occurrence_id bigint not null unique
    references public.task_occurrences (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  reward_points integer not null default 1 check (reward_points = 1),
  completed_at timestamptz not null default now()
);

create index completion_events_owner_idx
  on public.completion_events (owner_id, completed_at desc);

create table public.encouragements (
  id bigint generated always as identity primary key,
  occurrence_id bigint not null references public.task_occurrences (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  reaction text check (reaction in ('lemon', 'clap', 'heart', 'cheer')),
  message text check (char_length(message) between 1 and 120),
  visibility text not null default 'visible'
    check (visibility in ('visible', 'hidden_by_owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (occurrence_id, author_id),
  check (reaction is not null or message is not null),
  check (author_id <> owner_id)
);

create index encouragements_owner_idx
  on public.encouragements (owner_id, created_at desc);
create index encouragements_author_idx
  on public.encouragements (author_id, created_at desc);

create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  notification_type text not null
    check (
      notification_type in (
        'connection_request',
        'connection_accepted',
        'task_completed',
        'encouragement_received'
      )
    ),
  occurrence_id bigint references public.task_occurrences (id) on delete set null,
  connection_request_id bigint references public.connection_requests (id) on delete set null,
  encouragement_id bigint references public.encouragements (id) on delete set null,
  event_key text not null check (char_length(event_key) between 1 and 180),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, event_key)
);

create index notifications_inbox_idx
  on public.notifications (recipient_id, read_at, created_at desc);
create index notifications_actor_idx on public.notifications (actor_id, created_at desc);

create table public.pets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  drawing_path text check (drawing_path is null or drawing_path ~ '^[0-9a-f-]+/pet\\.png$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pet_unlocks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_key text not null check (item_key ~ '^[a-z0-9_-]{1,40}$'),
  item_kind text not null check (item_kind in ('color', 'accessory', 'background')),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

create table public.device_tokens (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_id text not null check (char_length(device_id) between 1 and 180),
  token text not null check (char_length(token) between 20 and 4096),
  platform text not null check (platform in ('android', 'ios')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id),
  unique (token)
);

create index device_tokens_active_user_idx
  on public.device_tokens (user_id, active)
  where active;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger profile_private_set_updated_at before update on public.profile_private
for each row execute function private.set_updated_at();
create trigger connection_requests_set_updated_at before update on public.connection_requests
for each row execute function private.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function private.set_updated_at();
create trigger task_occurrences_set_updated_at before update on public.task_occurrences
for each row execute function private.set_updated_at();
create trigger encouragements_set_updated_at before update on public.encouragements
for each row execute function private.set_updated_at();
create trigger pets_set_updated_at before update on public.pets
for each row execute function private.set_updated_at();
create trigger device_tokens_set_updated_at before update on public.device_tokens
for each row execute function private.set_updated_at();

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_name text;
  selected_time_zone text;
begin
  selected_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '레몬 친구'
    ),
    40
  );
  selected_time_zone := left(
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'time_zone'), ''), 'Asia/Seoul'),
    64
  );

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
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

create function private.are_connected(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    first_user is not null
    and second_user is not null
    and first_user <> second_user
    and (select auth.uid()) in (first_user, second_user)
    and exists (
      select 1 from public.connections as connection
      where connection.user_low_id = least(first_user, second_user)
        and connection.user_high_id = greatest(first_user, second_user)
    )
    and not exists (
      select 1 from public.blocks as block
      where (block.blocker_id = first_user and block.blocked_id = second_user)
         or (block.blocker_id = second_user and block.blocked_id = first_user)
    );
$$;

create function private.may_encourage(target_occurrence_id bigint, target_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.task_occurrences as occurrence
    where occurrence.id = target_occurrence_id
      and occurrence.owner_id = target_owner_id
      and occurrence.status = 'completed'
      and private.are_connected((select auth.uid()), occurrence.owner_id)
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.are_connected(uuid, uuid) to authenticated;
grant execute on function private.may_encourage(bigint, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.connection_requests enable row level security;
alter table public.connections enable row level security;
alter table public.blocks enable row level security;
alter table public.tasks enable row level security;
alter table public.task_occurrences enable row level security;
alter table public.completion_events enable row level security;
alter table public.encouragements enable row level security;
alter table public.notifications enable row level security;
alter table public.pets enable row level security;
alter table public.pet_unlocks enable row level security;
alter table public.device_tokens enable row level security;

create policy profiles_select_owner_or_friend
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or private.are_connected((select auth.uid()), id)
);

create policy profiles_update_owner
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy profile_private_select_owner
on public.profile_private for select to authenticated
using (user_id = (select auth.uid()));

create policy profile_private_update_owner
on public.profile_private for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy connection_requests_select_participant
on public.connection_requests for select to authenticated
using ((select auth.uid()) in (requester_id, addressee_id));

create policy connections_select_member
on public.connections for select to authenticated
using ((select auth.uid()) in (user_low_id, user_high_id));

create policy blocks_select_owner
on public.blocks for select to authenticated
using (blocker_id = (select auth.uid()));

create policy tasks_select_owner_or_friend
on public.tasks for select to authenticated
using (
  owner_id = (select auth.uid())
  or private.are_connected((select auth.uid()), owner_id)
);

create policy tasks_insert_owner
on public.tasks for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy tasks_update_owner
on public.tasks for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy tasks_delete_owner
on public.tasks for delete to authenticated
using (owner_id = (select auth.uid()));

create policy task_occurrences_select_owner_or_friend
on public.task_occurrences for select to authenticated
using (
  owner_id = (select auth.uid())
  or private.are_connected((select auth.uid()), owner_id)
);

create policy task_occurrences_insert_pending_owner
on public.task_occurrences for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and status = 'pending'
  and completed_at is null
  and first_completed_at is null
  and reopened_at is null
);

create policy completion_events_select_owner
on public.completion_events for select to authenticated
using (owner_id = (select auth.uid()));

create policy encouragements_select_visible_participant
on public.encouragements for select to authenticated
using (
  author_id = (select auth.uid())
  or owner_id = (select auth.uid())
  or (
    visibility = 'visible'
    and private.are_connected((select auth.uid()), owner_id)
  )
);

create policy encouragements_delete_author
on public.encouragements for delete to authenticated
using (author_id = (select auth.uid()));

create policy notifications_select_recipient
on public.notifications for select to authenticated
using (recipient_id = (select auth.uid()));

create policy notifications_update_recipient
on public.notifications for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

create policy pets_select_owner
on public.pets for select to authenticated
using (user_id = (select auth.uid()));

create policy pets_insert_owner
on public.pets for insert to authenticated
with check (user_id = (select auth.uid()));

create policy pets_update_owner
on public.pets for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy pets_delete_owner
on public.pets for delete to authenticated
using (user_id = (select auth.uid()));

create policy pet_unlocks_select_owner
on public.pet_unlocks for select to authenticated
using (user_id = (select auth.uid()));

create policy device_tokens_select_owner
on public.device_tokens for select to authenticated
using (user_id = (select auth.uid()));

create policy device_tokens_insert_owner
on public.device_tokens for insert to authenticated
with check (user_id = (select auth.uid()));

create policy device_tokens_update_owner
on public.device_tokens for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy device_tokens_delete_owner
on public.device_tokens for delete to authenticated
using (user_id = (select auth.uid()));

create view public.daily_progress
with (security_invoker = true)
as
select
  owner_id,
  occurrence_date,
  count(*)::integer as scheduled_count,
  count(*) filter (where status = 'completed')::integer as completed_count
from public.task_occurrences
group by owner_id, occurrence_date;

create function public.request_connection(target_invite_code text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_user_id uuid;
  request_id bigint;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select user_id into target_user_id
  from public.profile_private
  where invite_code = upper(btrim(target_invite_code));

  if target_user_id is null then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if target_user_id = current_user_id then
    raise exception 'CANNOT_INVITE_SELF' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.blocks
    where (blocker_id = current_user_id and blocked_id = target_user_id)
       or (blocker_id = target_user_id and blocked_id = current_user_id)
  ) then
    raise exception 'CONNECTION_BLOCKED' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.connections
    where user_low_id = least(current_user_id, target_user_id)
      and user_high_id = greatest(current_user_id, target_user_id)
  ) then
    raise exception 'ALREADY_CONNECTED' using errcode = 'P0001';
  end if;

  select id into request_id
  from public.connection_requests
  where pair_low = least(current_user_id, target_user_id)
    and pair_high = greatest(current_user_id, target_user_id)
    and status = 'pending'
  limit 1;

  if request_id is null then
    insert into public.connection_requests (requester_id, addressee_id)
    values (current_user_id, target_user_id)
    returning id into request_id;
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    notification_type,
    connection_request_id,
    event_key
  ) values (
    target_user_id,
    current_user_id,
    'connection_request',
    request_id,
    'connection_request:' || request_id::text
  ) on conflict (recipient_id, event_key) do nothing;

  return request_id;
exception
  when unique_violation then
    select id into request_id
    from public.connection_requests
    where pair_low = least(current_user_id, target_user_id)
      and pair_high = greatest(current_user_id, target_user_id)
      and status = 'pending'
    limit 1;
    return request_id;
end;
$$;

create function public.respond_connection_request(target_request_id bigint, accept_request boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_request public.connection_requests%rowtype;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select * into selected_request
  from public.connection_requests
  where id = target_request_id
  for update;

  if not found or selected_request.addressee_id <> current_user_id then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0001';
  end if;
  if selected_request.status <> 'pending' then
    return false;
  end if;

  if accept_request and exists (
    select 1 from public.blocks
    where (blocker_id = selected_request.requester_id and blocked_id = selected_request.addressee_id)
       or (blocker_id = selected_request.addressee_id and blocked_id = selected_request.requester_id)
  ) then
    raise exception 'CONNECTION_BLOCKED' using errcode = 'P0001';
  end if;

  update public.connection_requests
  set
    status = case when accept_request then 'accepted' else 'rejected' end,
    responded_at = now()
  where id = target_request_id;

  if accept_request then
    insert into public.connections (user_low_id, user_high_id)
    values (
      least(selected_request.requester_id, selected_request.addressee_id),
      greatest(selected_request.requester_id, selected_request.addressee_id)
    ) on conflict (user_low_id, user_high_id) do nothing;

    insert into public.notifications (
      recipient_id,
      actor_id,
      notification_type,
      connection_request_id,
      event_key
    ) values (
      selected_request.requester_id,
      current_user_id,
      'connection_accepted',
      target_request_id,
      'connection_accepted:' || target_request_id::text
    ) on conflict (recipient_id, event_key) do nothing;
  end if;

  return true;
end;
$$;

create function public.cancel_connection_request(target_request_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  update public.connection_requests
  set status = 'cancelled', responded_at = now()
  where id = target_request_id
    and requester_id = current_user_id
    and status = 'pending';

  return found;
end;
$$;

create function public.disconnect_friend(friend_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  delete from public.connections
  where user_low_id = least(current_user_id, friend_id)
    and user_high_id = greatest(current_user_id, friend_id);

  return found;
end;
$$;

create function public.block_user(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if target_user_id is null or target_user_id = current_user_id then
    raise exception 'INVALID_BLOCK_TARGET' using errcode = 'P0001';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (current_user_id, target_user_id)
  on conflict (blocker_id, blocked_id) do nothing;

  delete from public.connections
  where user_low_id = least(current_user_id, target_user_id)
    and user_high_id = greatest(current_user_id, target_user_id);

  update public.connection_requests
  set status = 'cancelled', responded_at = now()
  where pair_low = least(current_user_id, target_user_id)
    and pair_high = greatest(current_user_id, target_user_id)
    and status = 'pending';

  return true;
end;
$$;

create function public.unblock_user(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  delete from public.blocks
  where blocker_id = current_user_id and blocked_id = target_user_id;

  return found;
end;
$$;

create function public.complete_occurrence(target_occurrence_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_occurrence public.task_occurrences%rowtype;
  inserted_event_id bigint;
  current_points bigint;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select * into selected_occurrence
  from public.task_occurrences
  where id = target_occurrence_id
  for update;

  if not found or selected_occurrence.owner_id <> current_user_id then
    raise exception 'OCCURRENCE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if selected_occurrence.status = 'completed' then
    select lemon_points into current_points
    from public.profile_private where user_id = current_user_id;
    return jsonb_build_object(
      'changed', false,
      'firstCompletion', false,
      'points', current_points
    );
  end if;

  update public.task_occurrences
  set
    status = 'completed',
    completed_at = clock_timestamp(),
    first_completed_at = coalesce(first_completed_at, clock_timestamp())
  where id = target_occurrence_id
  returning * into selected_occurrence;

  insert into public.completion_events (occurrence_id, owner_id, completed_at)
  values (selected_occurrence.id, current_user_id, selected_occurrence.completed_at)
  on conflict (occurrence_id) do nothing
  returning id into inserted_event_id;

  if inserted_event_id is not null then
    update public.profile_private
    set
      lemon_points = lemon_points + 1,
      pet_level = 1 + ((lemon_points + 1) / 5)::integer
    where user_id = current_user_id
    returning lemon_points into current_points;

    insert into public.pet_unlocks (user_id, item_key, item_kind)
    select current_user_id, unlock.item_key, unlock.item_kind
    from (
      values
        (5::bigint, 'lemon-yellow', 'color'),
        (15::bigint, 'leaf-hat', 'accessory'),
        (30::bigint, 'sunny-garden', 'background')
    ) as unlock(required_points, item_key, item_kind)
    where current_points >= unlock.required_points
    on conflict (user_id, item_key) do nothing;

    insert into public.notifications (
      recipient_id,
      actor_id,
      notification_type,
      occurrence_id,
      event_key
    )
    select
      case
        when connection.user_low_id = current_user_id then connection.user_high_id
        else connection.user_low_id
      end,
      current_user_id,
      'task_completed',
      selected_occurrence.id,
      'task_completed:' || selected_occurrence.id::text
    from public.connections as connection
    where current_user_id in (connection.user_low_id, connection.user_high_id)
      and not exists (
        select 1 from public.blocks as block
        where (
          block.blocker_id = connection.user_low_id
          and block.blocked_id = connection.user_high_id
        ) or (
          block.blocker_id = connection.user_high_id
          and block.blocked_id = connection.user_low_id
        )
      )
    on conflict (recipient_id, event_key) do nothing;
  else
    select lemon_points into current_points
    from public.profile_private where user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'changed', true,
    'firstCompletion', inserted_event_id is not null,
    'points', current_points,
    'completedAt', selected_occurrence.completed_at
  );
end;
$$;

create function public.reopen_occurrence(target_occurrence_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  update public.task_occurrences
  set status = 'pending', completed_at = null, reopened_at = clock_timestamp()
  where id = target_occurrence_id
    and owner_id = current_user_id
    and status = 'completed';

  return found;
end;
$$;

create function public.upsert_encouragement(
  target_occurrence_id bigint,
  selected_reaction text,
  selected_message text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_owner_id uuid;
  encouragement_id bigint;
  normalized_message text := nullif(btrim(selected_message), '');
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if selected_reaction is not null
    and selected_reaction not in ('lemon', 'clap', 'heart', 'cheer') then
    raise exception 'INVALID_REACTION' using errcode = 'P0001';
  end if;
  if normalized_message is not null and char_length(normalized_message) > 120 then
    raise exception 'MESSAGE_TOO_LONG' using errcode = 'P0001';
  end if;
  if selected_reaction is null and normalized_message is null then
    raise exception 'EMPTY_ENCOURAGEMENT' using errcode = 'P0001';
  end if;

  select owner_id into target_owner_id
  from public.task_occurrences
  where id = target_occurrence_id and status = 'completed';

  if target_owner_id is null
    or not private.may_encourage(target_occurrence_id, target_owner_id) then
    raise exception 'ENCOURAGEMENT_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  insert into public.encouragements (
    occurrence_id,
    author_id,
    owner_id,
    reaction,
    message
  ) values (
    target_occurrence_id,
    current_user_id,
    target_owner_id,
    selected_reaction,
    normalized_message
  )
  on conflict (occurrence_id, author_id) do update
  set
    reaction = excluded.reaction,
    message = excluded.message,
    visibility = case
      when encouragements.visibility = 'hidden_by_owner' then 'hidden_by_owner'
      else 'visible'
    end
  returning id into encouragement_id;

  insert into public.notifications (
    recipient_id,
    actor_id,
    notification_type,
    occurrence_id,
    encouragement_id,
    event_key
  ) values (
    target_owner_id,
    current_user_id,
    'encouragement_received',
    target_occurrence_id,
    encouragement_id,
    'encouragement:' || encouragement_id::text
  ) on conflict (recipient_id, event_key) do nothing;

  return encouragement_id;
end;
$$;

create function public.hide_encouragement(target_encouragement_id bigint, hidden boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  update public.encouragements
  set visibility = case when hidden then 'hidden_by_owner' else 'visible' end
  where id = target_encouragement_id and owner_id = current_user_id;

  return found;
end;
$$;

revoke all on function public.request_connection(text) from public, anon;
revoke all on function public.respond_connection_request(bigint, boolean) from public, anon;
revoke all on function public.cancel_connection_request(bigint) from public, anon;
revoke all on function public.disconnect_friend(uuid) from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.complete_occurrence(bigint) from public, anon;
revoke all on function public.reopen_occurrence(bigint) from public, anon;
revoke all on function public.upsert_encouragement(bigint, text, text) from public, anon;
revoke all on function public.hide_encouragement(bigint, boolean) from public, anon;

grant execute on function public.request_connection(text) to authenticated;
grant execute on function public.respond_connection_request(bigint, boolean) to authenticated;
grant execute on function public.cancel_connection_request(bigint) to authenticated;
grant execute on function public.disconnect_friend(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.complete_occurrence(bigint) to authenticated;
grant execute on function public.reopen_occurrence(bigint) to authenticated;
grant execute on function public.upsert_encouragement(bigint, text, text) to authenticated;
grant execute on function public.hide_encouragement(bigint, boolean) to authenticated;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.profile_private from anon, authenticated;
revoke all on table public.connection_requests from anon, authenticated;
revoke all on table public.connections from anon, authenticated;
revoke all on table public.blocks from anon, authenticated;
revoke all on table public.tasks from anon, authenticated;
revoke all on table public.task_occurrences from anon, authenticated;
revoke all on table public.completion_events from anon, authenticated;
revoke all on table public.encouragements from anon, authenticated;
revoke all on table public.notifications from anon, authenticated;
revoke all on table public.pets from anon, authenticated;
revoke all on table public.pet_unlocks from anon, authenticated;
revoke all on table public.device_tokens from anon, authenticated;
revoke all on table public.daily_progress from anon, authenticated;

grant select, update (display_name) on public.profiles to authenticated;
grant select, update (time_zone) on public.profile_private to authenticated;
grant select on public.connection_requests to authenticated;
grant select on public.connections to authenticated;
grant select on public.blocks to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert on public.task_occurrences to authenticated;
grant select on public.completion_events to authenticated;
grant select, delete on public.encouragements to authenticated;
grant select, update (read_at) on public.notifications to authenticated;
grant select, insert, delete, update (drawing_path) on public.pets to authenticated;
grant select on public.pet_unlocks to authenticated;
grant select, insert, update, delete on public.device_tokens to authenticated;
grant select on public.daily_progress to authenticated;
grant usage, select on all sequences in schema public to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pet-drawings', 'pet-drawings', false, 1048576, array['image/png'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy pet_drawings_select_owner
on storage.objects for select to authenticated
using (
  bucket_id = 'pet-drawings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy pet_drawings_insert_owner
on storage.objects for insert to authenticated
with check (
  bucket_id = 'pet-drawings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = 'png'
);

create policy pet_drawings_update_owner
on storage.objects for update to authenticated
using (
  bucket_id = 'pet-drawings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'pet-drawings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = 'png'
);

create policy pet_drawings_delete_owner
on storage.objects for delete to authenticated
using (
  bucket_id = 'pet-drawings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

alter publication supabase_realtime add table public.connection_requests;
alter publication supabase_realtime add table public.connections;
alter publication supabase_realtime add table public.task_occurrences;
alter publication supabase_realtime add table public.encouragements;
alter publication supabase_realtime add table public.notifications;
