-- Remove retired policy before deleting its storage. Existing disconnected pairs and
-- cancelled requests stay unchanged; no notification/completion RPC is invoked.
begin;

revoke all on function public.block_user(uuid) from public, anon, authenticated;
revoke all on function public.unblock_user(uuid) from public, anon, authenticated;
revoke all on function public.list_blocked_profiles() from public, anon, authenticated;
revoke all on function public.hide_encouragement(bigint, boolean) from public, anon, authenticated;
drop function public.block_user(uuid);
drop function public.unblock_user(uuid);
drop function public.list_blocked_profiles();
drop function public.hide_encouragement(bigint, boolean);

-- Replace every function that reads blocks before dropping the table (RESTRICT).


create or replace function private.are_connected(first_user uuid, second_user uuid)
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
    );
$$;

create or replace function public.request_connection(target_invite_code text)
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

  perform private.lock_user_pair(current_user_id, target_user_id);

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

  if request_id is not null then
    raise exception 'CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.connection_requests (requester_id, addressee_id)
  values (current_user_id, target_user_id)
  returning id into request_id;

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
end;
$$;

create or replace function public.respond_connection_request(target_request_id bigint, accept_request boolean)
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
  where id = target_request_id;

  if not found or selected_request.addressee_id <> current_user_id then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform private.lock_user_pair(
    selected_request.requester_id,
    selected_request.addressee_id
  );

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

create or replace function public.complete_occurrence(target_occurrence_id bigint)
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

  perform private.lock_user_network(current_user_id);

  select occurrence.* into selected_occurrence
  from public.task_occurrences as occurrence
  join public.tasks as active_task on active_task.id = occurrence.task_id
  where occurrence.id = target_occurrence_id
    and active_task.deleted_at is null
  for update of active_task, occurrence;

  if not found or selected_occurrence.owner_id <> current_user_id then
    raise exception 'OCCURRENCE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if selected_occurrence.status = 'completed' then
    select id into inserted_event_id
    from public.completion_events
    where occurrence_id = selected_occurrence.id;
    select lemon_points into current_points
    from public.profile_private where user_id = current_user_id;
    return jsonb_build_object(
      'status', 'completed',
      'changed', false,
      'completedAt', selected_occurrence.completed_at,
      'firstCompletion', false,
      'rewardGranted', false,
      'rewardPoints', 0,
      'completionEventId', inserted_event_id,
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
    on conflict (recipient_id, event_key) do nothing;
  else
    select lemon_points into current_points
    from public.profile_private where user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'status', 'completed',
    'changed', true,
    'firstCompletion', inserted_event_id is not null,
    'rewardGranted', inserted_event_id is not null,
    'rewardPoints', case when inserted_event_id is not null then 1 else 0 end,
    'completionEventId', coalesce(
      inserted_event_id,
      (select id from public.completion_events where occurrence_id = selected_occurrence.id)
    ),
    'points', current_points,
    'completedAt', selected_occurrence.completed_at
  );
end;
$$;

create or replace function public.list_inbox(inbox_filter text default 'all', cursor_id bigint default null, page_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  perform private.lock_user_network(auth.uid());
  if inbox_filter is null or inbox_filter not in ('all', 'encouragement', 'connection')
    or page_limit is null or page_limit not between 1 and 100 or cursor_id <= 0 then raise exception 'INVALID_INPUT'; end if;
  with page as materialized (
    select n.* from public.notifications n where n.recipient_id = auth.uid()
      and n.notification_type in ('encouragement_received', 'connection_request', 'connection_accepted')
      and (inbox_filter = 'all' or (inbox_filter = 'encouragement' and n.notification_type = 'encouragement_received')
        or (inbox_filter = 'connection' and n.notification_type in ('connection_request', 'connection_accepted')))
      and (cursor_id is null or n.id < cursor_id) order by n.id desc limit page_limit + 1
  ), shown as (select * from page order by id desc limit page_limit), resolved as (
    select n.*, o.title_snapshot, e.message, e.reaction, e.visibility,
      case when n.actor_id = auth.uid() or private.are_connected(auth.uid(), n.actor_id)
        or (r.status = 'pending' and auth.uid() in (r.requester_id, r.addressee_id)
          and n.actor_id in (r.requester_id, r.addressee_id))
        then coalesce(p.display_name, '친구') else '친구' end as actor_name,
      case n.notification_type
        when 'encouragement_received' then o.owner_id = auth.uid() and e.owner_id = auth.uid()
          and e.author_id = n.actor_id and e.occurrence_id = o.id and e.visibility <> 'deleted_by_author'
          and private.can_read_occurrence(o.id)
        when 'connection_request' then r.status = 'pending' and r.addressee_id = auth.uid() and r.requester_id = n.actor_id
        when 'connection_accepted' then private.are_connected(auth.uid(), n.actor_id)
        else false end as available
    from shown n left join public.task_occurrences o on o.id = n.occurrence_id
    left join public.encouragements e on e.id = n.encouragement_id
    left join public.connection_requests r on r.id = n.connection_request_id
    left join public.profiles p on p.id = n.actor_id
  ) select jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', n.id, 'type', n.notification_type, 'actorName', n.actor_name, 'createdAt', n.created_at, 'readAt', n.read_at,
      'occurrenceId', n.occurrence_id, 'encouragementId', n.encouragement_id, 'connectionRequestId', n.connection_request_id,
      'availability', case when n.available then 'available' else 'unavailable' end,
      'target', case when n.available then case n.notification_type
        when 'encouragement_received' then '/?occurrence=' || n.occurrence_id || '&encouragement=' || n.encouragement_id
        when 'connection_request' then '/friends/?request=' || n.connection_request_id
        when 'connection_accepted' then '/friends/?friend=' || n.actor_id end else null end,
      'taskTitle', case when n.available and n.notification_type = 'encouragement_received' then n.title_snapshot else null end,
      'messagePreview', case when n.available and n.visibility = 'visible' and n.notification_type = 'encouragement_received' then n.message else null end,
      'reaction', case when n.available and n.visibility = 'visible' and n.notification_type = 'encouragement_received' then n.reaction else null end
    ) order by n.id desc) from resolved n), '[]'::jsonb),
    'nextCursor', case when (select count(*) from page) > page_limit then (select min(id) from shown) else null end) into result;
  return result;
end;
$$;

create or replace function public.upsert_encouragement(
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
  where id = target_occurrence_id;

  if target_owner_id is null then
    raise exception 'ENCOURAGEMENT_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  perform private.lock_user_pair(current_user_id, target_owner_id);

  select occurrence.owner_id into target_owner_id
  from public.task_occurrences as occurrence
  join public.tasks as active_task on active_task.id = occurrence.task_id
  where occurrence.id = target_occurrence_id
    and occurrence.status = 'completed'
    and active_task.deleted_at is null
  for update of occurrence, active_task;

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
    visibility = 'visible'
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

create or replace function public.get_occurrence_detail(target_occurrence_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.task_occurrences; deleted boolean; owner_name text; allowed boolean;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  perform private.lock_user_network(auth.uid());
  if target_occurrence_id is null or target_occurrence_id <= 0 then raise exception 'INVALID_INPUT'; end if;
  select * into o from public.task_occurrences where id = target_occurrence_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not private.can_read_occurrence(o.id) then raise exception 'FORBIDDEN'; end if;
  select deleted_at is not null into deleted from public.tasks where id = o.task_id;
  select display_name into owner_name from public.profiles where id = o.owner_id;
  allowed := private.may_encourage(o.id, o.owner_id);
  return jsonb_build_object('occurrence', to_jsonb(o), 'owner', jsonb_build_object('id', o.owner_id, 'displayName', owner_name),
    'taskDeleted', deleted, 'permissions', jsonb_build_object(
      'canEdit', o.owner_id = auth.uid() and not deleted, 'canComplete', o.owner_id = auth.uid() and not deleted,
      'canEncourage', allowed),
    'encouragements', coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('authorName',
        case when e.author_id = auth.uid() or private.are_connected(auth.uid(), e.author_id) then p.display_name else '친구' end)
        order by e.created_at, e.id)
      from public.encouragements e join public.profiles p on p.id = e.author_id
      where e.occurrence_id = o.id and e.visibility <> 'deleted_by_author'
        and (o.owner_id = auth.uid() or (allowed and e.visibility = 'visible'))), '[]'::jsonb),
    'summary', private.encouragement_summary(o.id));
end;
$$;

-- The old table policy and privileges are removed explicitly; no CASCADE is used.
drop policy blocks_select_owner on public.blocks;
revoke all on table public.blocks from public, anon, authenticated, service_role;
drop table public.blocks restrict;

-- Restore only owner-hidden rows. Author deletions and row identities are preserved.
update public.encouragements set visibility = 'visible' where visibility = 'hidden_by_owner';
alter table public.encouragements drop constraint encouragements_visibility_check;
alter table public.encouragements add constraint encouragements_visibility_check
  check (visibility in ('visible', 'deleted_by_author'));

drop policy encouragements_select_visible_participant on public.encouragements;
create policy encouragements_select_visible_participant
on public.encouragements for select to authenticated
using (
  visibility = 'visible'
  and (owner_id = (select auth.uid()) or private.may_encourage(occurrence_id, owner_id))
);

commit;
