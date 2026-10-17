-- Read projections preserve the original write commands and their reward/notification locks.
create index occurrences_first_completion_idx
  on public.task_occurrences (first_completed_at desc, id desc)
  where first_completed_at is not null;
create index notifications_direct_unread_idx
  on public.notifications (recipient_id, id desc)
  where read_at is null and notification_type <> 'task_completed';

create function private.can_read_occurrence(target_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.task_occurrences o join public.tasks t on t.id = o.task_id
    where o.id = target_id and auth.uid() is not null and (
      (o.owner_id = auth.uid() and (t.deleted_at is null or o.first_completed_at is not null))
      or (t.deleted_at is null and private.are_connected(auth.uid(), o.owner_id))
    )
  );
$$;
revoke all on function private.can_read_occurrence(bigint) from public, anon, authenticated;

create function private.encouragement_summary(target_id bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  with readable as (
    select e.*,
      case when e.author_id = auth.uid() or private.are_connected(auth.uid(), e.author_id)
        then p.display_name else '친구' end as author_name
    from public.encouragements e join public.profiles p on p.id = e.author_id
    where e.occurrence_id = target_id and e.visibility <> 'deleted_by_author'
      and private.can_read_occurrence(target_id)
      and (e.owner_id = auth.uid() or private.may_encourage(target_id, e.owner_id))
  )
  select jsonb_build_object(
    'count', count(*) filter (where visibility = 'visible'),
    'reactions', jsonb_build_object(
      'lemon', count(*) filter (where visibility = 'visible' and reaction = 'lemon'),
      'clap', count(*) filter (where visibility = 'visible' and reaction = 'clap'),
      'heart', count(*) filter (where visibility = 'visible' and reaction = 'heart'),
      'cheer', count(*) filter (where visibility = 'visible' and reaction = 'cheer')),
    'latestMessage', (select jsonb_build_object('encouragementId', r.id, 'authorName', r.author_name,
        'message', r.message, 'createdAt', r.created_at)
      from readable r where r.visibility = 'visible' and r.message is not null
      order by r.created_at desc, r.id desc limit 1),
    'myEncouragement', (select jsonb_build_object('id', r.id, 'reaction', r.reaction,
        'message', r.message, 'visibility', r.visibility)
      from readable r where r.author_id = auth.uid() limit 1)
  ) from readable;
$$;
revoke all on function private.encouragement_summary(bigint) from public, anon, authenticated;

create function public.list_social_activity(
  target_friend_id uuid default null, cursor_completed_at timestamptz default null,
  cursor_occurrence_id bigint default null, page_limit integer default 20
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  perform private.lock_user_network(auth.uid());
  if page_limit is null or page_limit not between 1 and 100
    or (cursor_completed_at is null) <> (cursor_occurrence_id is null)
    or cursor_occurrence_id <= 0 then raise exception 'INVALID_INPUT'; end if;
  if target_friend_id is not null and not private.are_connected(auth.uid(), target_friend_id)
    then raise exception 'FORBIDDEN'; end if;
  with page as materialized (
    select o.*, p.display_name from public.task_occurrences o
    join public.tasks t on t.id = o.task_id join public.profiles p on p.id = o.owner_id
    where t.deleted_at is null and o.status = 'completed' and o.first_completed_at is not null
      and private.are_connected(auth.uid(), o.owner_id)
      and (target_friend_id is null or o.owner_id = target_friend_id)
      and (cursor_completed_at is null or (o.first_completed_at, o.id) < (cursor_completed_at, cursor_occurrence_id))
    order by o.first_completed_at desc, o.id desc limit page_limit + 1
  ), shown as (select * from page order by first_completed_at desc, id desc limit page_limit)
  select jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object(
    'occurrence', to_jsonb(s) - 'display_name', 'owner', jsonb_build_object('id', s.owner_id, 'displayName', s.display_name),
    'summary', private.encouragement_summary(s.id)) order by s.first_completed_at desc, s.id desc) from shown s), '[]'::jsonb),
    'nextCursor', case when (select count(*) from page) > page_limit then
      (select jsonb_build_object('firstCompletedAt', first_completed_at, 'occurrenceId', id)
       from shown order by first_completed_at, id limit 1) else null end) into result;
  return result;
end;
$$;

create function public.list_own_history(
  cursor_completed_at timestamptz default null, cursor_occurrence_id bigint default null, page_limit integer default 20
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  perform private.lock_user_network(auth.uid());
  if page_limit is null or page_limit not between 1 and 100
    or (cursor_completed_at is null) <> (cursor_occurrence_id is null)
    or cursor_occurrence_id <= 0 then raise exception 'INVALID_INPUT'; end if;
  with page as materialized (
    select o.*, t.deleted_at is not null as task_deleted from public.task_occurrences o
    join public.tasks t on t.id = o.task_id
    where o.owner_id = auth.uid() and o.first_completed_at is not null
      and (cursor_completed_at is null or (o.first_completed_at, o.id) < (cursor_completed_at, cursor_occurrence_id))
    order by o.first_completed_at desc, o.id desc limit page_limit + 1
  ), shown as (select * from page order by first_completed_at desc, id desc limit page_limit)
  select jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object(
    'occurrence', to_jsonb(s) - 'task_deleted', 'taskDeleted', s.task_deleted,
    'summary', private.encouragement_summary(s.id)) order by s.first_completed_at desc, s.id desc) from shown s), '[]'::jsonb),
    'nextCursor', case when (select count(*) from page) > page_limit then
      (select jsonb_build_object('firstCompletedAt', first_completed_at, 'occurrenceId', id)
       from shown order by first_completed_at, id limit 1) else null end) into result;
  return result;
end;
$$;

create function public.get_occurrence_detail(target_occurrence_id bigint)
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
        and (o.owner_id = auth.uid() or (allowed and (e.visibility = 'visible' or e.author_id = auth.uid())))), '[]'::jsonb),
    'summary', private.encouragement_summary(o.id));
end;
$$;

create function public.list_encouragement_summaries(occurrence_ids bigint[])
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  perform private.lock_user_network(auth.uid());
  if occurrence_ids is null or cardinality(occurrence_ids) > 100
    or exists (select 1 from unnest(occurrence_ids) id where id is null or id <= 0)
    then raise exception 'INVALID_INPUT'; end if;
  return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object(
    'occurrenceId', o.id, 'summary', private.encouragement_summary(o.id)) order by o.id)
    from public.task_occurrences o where o.id = any(occurrence_ids) and private.can_read_occurrence(o.id)), '[]'::jsonb));
end;
$$;

create function public.list_inbox(inbox_filter text default 'all', cursor_id bigint default null, page_limit integer default 50)
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
          and n.actor_id in (r.requester_id, r.addressee_id)
          and not exists (select 1 from public.blocks b where
            (b.blocker_id = auth.uid() and b.blocked_id = n.actor_id) or (b.blocked_id = auth.uid() and b.blocker_id = n.actor_id)))
        then coalesce(p.display_name, '친구') else '친구' end as actor_name,
      case n.notification_type
        when 'encouragement_received' then o.owner_id = auth.uid() and e.owner_id = auth.uid()
          and e.author_id = n.actor_id and e.occurrence_id = o.id and e.visibility <> 'deleted_by_author'
          and private.can_read_occurrence(o.id)
        when 'connection_request' then r.status = 'pending' and r.addressee_id = auth.uid() and r.requester_id = n.actor_id
          and not exists (select 1 from public.blocks b where
            (b.blocker_id = auth.uid() and b.blocked_id = n.actor_id) or (b.blocked_id = auth.uid() and b.blocker_id = n.actor_id))
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

create function public.get_inbox_unread_count()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  perform private.lock_user_network(auth.uid());
  return jsonb_build_object('unreadCount', (select count(*) from public.notifications
    where recipient_id = auth.uid() and read_at is null
      and notification_type in ('encouragement_received', 'connection_request', 'connection_accepted')));
end;
$$;

create function public.mark_all_inbox_read(through_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare updated_count integer; read_time timestamptz := now();
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  perform private.lock_user_network(auth.uid());
  if through_id is null or through_id <= 0 then raise exception 'INVALID_INPUT'; end if;
  update public.notifications set read_at = read_time where recipient_id = auth.uid()
    and id <= through_id and read_at is null
    and notification_type in ('encouragement_received', 'connection_request', 'connection_accepted');
  get diagnostics updated_count = row_count;
  return jsonb_build_object('updatedCount', updated_count, 'readAt', read_time);
end;
$$;

revoke all on function public.list_social_activity(uuid,timestamptz,bigint,integer) from public, anon;
revoke all on function public.list_own_history(timestamptz,bigint,integer) from public, anon;
revoke all on function public.get_occurrence_detail(bigint) from public, anon;
revoke all on function public.list_encouragement_summaries(bigint[]) from public, anon;
revoke all on function public.list_inbox(text,bigint,integer) from public, anon;
revoke all on function public.get_inbox_unread_count() from public, anon;
revoke all on function public.mark_all_inbox_read(bigint) from public, anon;
grant execute on function public.list_social_activity(uuid,timestamptz,bigint,integer) to authenticated;
grant execute on function public.list_own_history(timestamptz,bigint,integer) to authenticated;
grant execute on function public.get_occurrence_detail(bigint) to authenticated;
grant execute on function public.list_encouragement_summaries(bigint[]) to authenticated;
grant execute on function public.list_inbox(text,bigint,integer) to authenticated;
grant execute on function public.get_inbox_unread_count() to authenticated;
grant execute on function public.mark_all_inbox_read(bigint) to authenticated;
