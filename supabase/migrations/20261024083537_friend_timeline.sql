begin;

create index tasks_owner_created_timeline_idx on public.tasks(owner_id, created_at desc, id desc)
where deleted_at is null;
create index occurrences_owner_first_completed_timeline_idx
on public.task_occurrences(owner_id, first_completed_at desc, id desc)
where status = 'completed' and first_completed_at is not null;

-- Separate read model: keep existing completion-history cursors unchanged.
create function public.list_friend_timeline(
  target_friend_id uuid default null,
  cursor_occurred_at timestamptz default null,
  cursor_kind text default null,
  cursor_event_id bigint default null,
  page_limit integer default 20
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; viewer_zone text; cursor_rank integer;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if page_limit is null or page_limit not between 1 and 100
    or num_nonnulls(cursor_occurred_at, cursor_kind, cursor_event_id) not in (0, 3)
    or cursor_kind not in ('created', 'completed') or cursor_event_id <= 0
    then raise exception 'INVALID_INPUT'; end if;
  perform private.lock_user_network(auth.uid());
  if target_friend_id is not null and not private.are_connected(auth.uid(), target_friend_id)
    then raise exception 'FORBIDDEN'; end if;
  select time_zone into viewer_zone from public.profile_private where user_id = auth.uid();
  cursor_rank := case cursor_kind when 'completed' then 1 else 0 end;
  with friends as materialized (
    select p.id, p.display_name, p.avatar_key,
      (now() at time zone pp.time_zone)::date as owner_day
    from public.connections c
    join public.profiles p on p.id = case when c.user_low_id = auth.uid()
      then c.user_high_id else c.user_low_id end
    join public.profile_private pp on pp.user_id = p.id
    where (c.user_low_id = auth.uid() or c.user_high_id = auth.uid())
      and (target_friend_id is null or p.id = target_friend_id)
  ), events as (
    select 'created'::text as kind, 0 as event_rank, t.id as event_id,
      t.created_at as occurred_at, t.owner_id, t.id as task_id, t.title,
      t.due_date, null::bigint as occurrence_id
    from public.tasks t join friends f on f.id = t.owner_id
    where t.deleted_at is null
    union all
    select 'completed', 1, o.id, o.first_completed_at, o.owner_id, t.id,
      o.title_snapshot, o.occurrence_date, o.id
    from public.task_occurrences o join friends f on f.id = o.owner_id
    join public.tasks t on t.id = o.task_id and t.owner_id = o.owner_id
    where t.deleted_at is null and o.status = 'completed' and o.first_completed_at is not null
  ), page as materialized (
    select * from events e
    where cursor_occurred_at is null
      or (e.occurred_at, e.event_rank, e.event_id) < (cursor_occurred_at, cursor_rank, cursor_event_id)
    order by e.occurred_at desc, e.event_rank desc, e.event_id desc
    limit page_limit + 1
  ), visible as materialized (
    select * from page order by occurred_at desc, event_rank desc, event_id desc limit page_limit
  )
  select jsonb_build_object(
    'viewerTimeZone', coalesce(viewer_zone, 'UTC'),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'kind', v.kind, 'eventId', v.event_id, 'occurredAt', v.occurred_at,
      'owner', jsonb_build_object('id', f.id, 'displayName', f.display_name, 'avatarKey', f.avatar_key),
      'ownerDay', f.owner_day,
      'cheeredToday', exists(select 1 from public.daily_encouragements d
        where d.owner_id = f.id and d.author_id = auth.uid() and d.day = f.owner_day and d.visibility = 'visible'),
      'task', jsonb_build_object('id', v.task_id, 'title', v.title, 'dueDate', v.due_date),
      'occurrenceId', v.occurrence_id
    ) order by v.occurred_at desc, v.event_rank desc, v.event_id desc)
    from visible v join friends f on f.id = v.owner_id), '[]'::jsonb),
    'nextCursor', case when (select count(*) from page) > page_limit then (
      select jsonb_build_object('occurredAt', occurred_at, 'kind', kind, 'eventId', event_id)
      from visible order by occurred_at, event_rank, event_id limit 1
    ) else null end
  ) into result;
  return result;
end;
$$;
revoke all on function public.list_friend_timeline(uuid,timestamptz,text,bigint,integer) from public, anon;
grant execute on function public.list_friend_timeline(uuid,timestamptz,text,bigint,integer) to authenticated;

commit;
