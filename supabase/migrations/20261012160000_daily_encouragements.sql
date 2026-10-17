begin;

create table public.daily_encouragements (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  reaction text not null check (reaction in ('lemon', 'clap', 'heart', 'cheer')),
  message text check (char_length(message) between 1 and 120),
  quoted_occurrence_id bigint references public.task_occurrences(id) on delete set null,
  visibility text not null default 'visible' check (visibility in ('visible', 'deleted_by_author')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, author_id, day),
  check (owner_id <> author_id)
);
create index daily_encouragements_owner_day_idx on public.daily_encouragements(owner_id, day, id desc);
create index daily_encouragements_author_idx on public.daily_encouragements(author_id);
create index daily_encouragements_quote_idx on public.daily_encouragements(quoted_occurrence_id);
alter table public.daily_encouragements enable row level security;
revoke all on table public.daily_encouragements from anon, authenticated;
grant select on table public.daily_encouragements to authenticated;
grant all on table public.daily_encouragements to service_role;
grant usage, select on sequence public.daily_encouragements_id_seq to service_role;
create policy daily_encouragements_participant_read on public.daily_encouragements for select to authenticated
using (visibility = 'visible' and (owner_id = auth.uid() or (author_id = auth.uid() and private.are_connected(auth.uid(), owner_id))));

alter table public.notifications add column daily_encouragement_id bigint references public.daily_encouragements(id) on delete set null;
create index notifications_daily_encouragement_idx on public.notifications(daily_encouragement_id);
alter table public.notifications add constraint notifications_encouragement_scope_check
  check (daily_encouragement_id is null or (notification_type = 'encouragement_received' and occurrence_id is null and encouragement_id is null and connection_request_id is null));

create function private.daily_encouragement_json(e public.daily_encouragements)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', e.id, 'ownerId', e.owner_id, 'authorId', e.author_id,
    'day', e.day, 'reaction', e.reaction, 'message', e.message, 'createdAt', e.created_at,
    'authorName', case when e.author_id = auth.uid() or private.are_connected(auth.uid(), e.author_id) then p.display_name else '친구' end,
    'authorAvatarKey', case when e.author_id = auth.uid() or private.are_connected(auth.uid(), e.author_id) then p.avatar_key else 'lemon' end,
    'quote', (select jsonb_build_object('id', o.id, 'title', o.title_snapshot)
      from public.task_occurrences o join public.tasks t on t.id = o.task_id
      where o.id = e.quoted_occurrence_id and o.owner_id = e.owner_id and t.deleted_at is null))
  from public.profiles p where p.id = e.author_id;
$$;
revoke all on function private.daily_encouragement_json(public.daily_encouragements) from public, anon, authenticated;

create function public.get_daily_encouragement(target_encouragement_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.daily_encouragements;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into e from public.daily_encouragements where id = target_encouragement_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform private.lock_user_pair(e.owner_id, e.author_id);
  select * into e from public.daily_encouragements where id = target_encouragement_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.visibility <> 'visible' then raise exception 'NOT_FOUND'; end if;
  if not (e.owner_id = auth.uid() or (e.author_id = auth.uid() and private.are_connected(auth.uid(), e.owner_id))) then raise exception 'FORBIDDEN'; end if;
  return private.daily_encouragement_json(e);
end;
$$;

create function public.get_encouragement_day(target_owner_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_today date; rows jsonb; result jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if target_owner_id is null then raise exception 'INVALID_INPUT'; end if;
  perform private.lock_user_pair(auth.uid(), target_owner_id);
  if target_owner_id <> auth.uid() and not private.are_connected(auth.uid(), target_owner_id) then raise exception 'FORBIDDEN'; end if;
  owner_today := public.get_owner_today(target_owner_id);
  select coalesce(jsonb_agg(to_jsonb(o) order by o.id), '[]'::jsonb) into rows
    from public.list_task_occurrences(target_owner_id, owner_today, owner_today) o;
  select jsonb_build_object('day', owner_today, 'owner', jsonb_build_object('id', p.id, 'displayName', p.display_name, 'avatarKey', p.avatar_key),
    'occurrences', rows,
    'mine', (select private.daily_encouragement_json(e) from public.daily_encouragements e
      where e.owner_id = target_owner_id and e.author_id = auth.uid() and e.day = owner_today and e.visibility = 'visible'))
    into result from public.profiles p where p.id = target_owner_id;
  if result is null then raise exception 'NOT_FOUND'; end if;
  return result;
end;
$$;

create function public.upsert_daily_encouragement(target_owner_id uuid, expected_day date,
  selected_reaction text, selected_message text default null, target_occurrence_id bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_today date; e public.daily_encouragements; clean_message text := nullif(btrim(selected_message), '');
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if target_owner_id is null or expected_day is null or selected_reaction is null
    or selected_reaction not in ('lemon', 'clap', 'heart', 'cheer') or char_length(clean_message) > 120 then raise exception 'INVALID_INPUT'; end if;
  perform private.lock_user_pair(auth.uid(), target_owner_id);
  if target_owner_id = auth.uid() or not private.are_connected(auth.uid(), target_owner_id) then raise exception 'FORBIDDEN'; end if;
  owner_today := public.get_owner_today(target_owner_id);
  if expected_day <> owner_today then raise exception 'CONFLICT'; end if;
  if target_occurrence_id is not null and not exists (
    select 1 from public.task_occurrences o join public.tasks t on t.id = o.task_id
    where o.id = target_occurrence_id and o.owner_id = target_owner_id and o.occurrence_date = owner_today and t.deleted_at is null
  ) then raise exception 'INVALID_QUOTE'; end if;
  insert into public.daily_encouragements(owner_id, author_id, day, reaction, message, quoted_occurrence_id)
    values (target_owner_id, auth.uid(), owner_today, selected_reaction, clean_message, target_occurrence_id)
    on conflict (owner_id, author_id, day) do update set reaction = excluded.reaction, message = excluded.message,
      quoted_occurrence_id = excluded.quoted_occurrence_id, visibility = 'visible', updated_at = now()
    returning * into e;
  insert into public.notifications(recipient_id, actor_id, notification_type, daily_encouragement_id, event_key)
    values (target_owner_id, auth.uid(), 'encouragement_received', e.id, 'daily-encouragement:' || e.id)
    on conflict (recipient_id, event_key) do nothing;
  return private.daily_encouragement_json(e);
end;
$$;

create function public.delete_daily_encouragement(target_encouragement_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare e public.daily_encouragements;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into e from public.daily_encouragements where id = target_encouragement_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.author_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  perform private.lock_user_pair(e.owner_id, e.author_id);
  update public.daily_encouragements set visibility = 'deleted_by_author', updated_at = now() where id = e.id;
  return true;
end;
$$;

-- Preserve all occurrence-based history while refusing new writes from older clients.
create or replace function public.upsert_encouragement(target_occurrence_id bigint, selected_reaction text default null, selected_message text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  raise exception 'ENCOURAGEMENT_NOT_ALLOWED';
end;
$$;

revoke all on function public.get_daily_encouragement(bigint) from public, anon;
revoke all on function public.get_encouragement_day(uuid) from public, anon;
revoke all on function public.upsert_daily_encouragement(uuid, date, text, text, bigint) from public, anon;
revoke all on function public.delete_daily_encouragement(bigint) from public, anon;
grant execute on function public.get_daily_encouragement(bigint), public.get_encouragement_day(uuid),
  public.upsert_daily_encouragement(uuid, date, text, text, bigint), public.delete_daily_encouragement(bigint) to authenticated;

create or replace function public.get_occurrence_detail(target_occurrence_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.task_occurrences; deleted boolean; owner_name text; owner_avatar_key text; allowed boolean;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  perform private.lock_user_network(auth.uid());
  if target_occurrence_id is null or target_occurrence_id <= 0 then raise exception 'INVALID_INPUT'; end if;
  select * into o from public.task_occurrences where id = target_occurrence_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not private.can_read_occurrence(o.id) then raise exception 'FORBIDDEN'; end if;
  select deleted_at is not null into deleted from public.tasks where id = o.task_id;
  select display_name, avatar_key into owner_name, owner_avatar_key from public.profiles where id = o.owner_id;
  allowed := private.may_encourage(o.id, o.owner_id);
  return jsonb_build_object('occurrence', to_jsonb(o), 'owner', jsonb_build_object('id', o.owner_id, 'displayName', owner_name, 'avatarKey', owner_avatar_key),
    'taskDeleted', deleted, 'permissions', jsonb_build_object(
      'canEdit', o.owner_id = auth.uid() and not deleted, 'canComplete', o.owner_id = auth.uid() and not deleted,
      'canEncourage', false),
    'encouragements', coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('authorName',
        case when e.author_id = auth.uid() or private.are_connected(auth.uid(), e.author_id) then p.display_name else '친구' end, 'authorAvatarKey',
        case when e.author_id = auth.uid() or private.are_connected(auth.uid(), e.author_id) then p.avatar_key else 'lemon' end)
        order by e.created_at, e.id)
      from public.encouragements e join public.profiles p on p.id = e.author_id
      where e.occurrence_id = o.id and e.visibility <> 'deleted_by_author'
        and (o.owner_id = auth.uid() or (allowed and e.visibility = 'visible'))), '[]'::jsonb),
    'summary', private.encouragement_summary(o.id));
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
    select n.*, case when n.daily_encouragement_id is not null then qo.title_snapshot else o.title_snapshot end as title_snapshot,
      case when n.daily_encouragement_id is not null then d.message else e.message end as message,
      case when n.daily_encouragement_id is not null then d.reaction else e.reaction end as reaction,
      case when n.daily_encouragement_id is not null then d.visibility else e.visibility end as visibility,
      case when n.actor_id = auth.uid() or private.are_connected(auth.uid(), n.actor_id)
        or (r.status = 'pending' and auth.uid() in (r.requester_id, r.addressee_id)
          and n.actor_id in (r.requester_id, r.addressee_id))
        then coalesce(p.display_name, '친구') else '친구' end as actor_name,
      case when n.actor_id = auth.uid() or private.are_connected(auth.uid(), n.actor_id)
        or (r.status = 'pending' and auth.uid() in (r.requester_id, r.addressee_id)
          and n.actor_id in (r.requester_id, r.addressee_id))
        then coalesce(p.avatar_key, 'lemon') else 'lemon' end as actor_avatar_key,
      case n.notification_type
        when 'encouragement_received' then case when n.daily_encouragement_id is not null then
          d.owner_id = auth.uid() and d.author_id = n.actor_id and d.visibility = 'visible'
          else o.owner_id = auth.uid() and e.owner_id = auth.uid()
          and e.author_id = n.actor_id and e.occurrence_id = o.id and e.visibility <> 'deleted_by_author'
          and private.can_read_occurrence(o.id) end
        when 'connection_request' then r.status = 'pending' and r.addressee_id = auth.uid() and r.requester_id = n.actor_id
        when 'connection_accepted' then private.are_connected(auth.uid(), n.actor_id)
        else false end as available
    from shown n left join public.task_occurrences o on o.id = n.occurrence_id
    left join public.encouragements e on e.id = n.encouragement_id
    left join public.daily_encouragements d on d.id = n.daily_encouragement_id
    left join public.task_occurrences qo on qo.id = d.quoted_occurrence_id and qo.owner_id = d.owner_id
      and exists (select 1 from public.tasks qt where qt.id = qo.task_id and qt.deleted_at is null)
    left join public.connection_requests r on r.id = n.connection_request_id
    left join public.profiles p on p.id = n.actor_id
  ) select jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', n.id, 'type', n.notification_type, 'actorName', n.actor_name, 'actorAvatarKey', n.actor_avatar_key, 'createdAt', n.created_at, 'readAt', n.read_at,
      'dailyEncouragementId', n.daily_encouragement_id, 'occurrenceId', n.occurrence_id, 'encouragementId', n.encouragement_id, 'connectionRequestId', n.connection_request_id,
      'availability', case when n.available then 'available' else 'unavailable' end,
      'target', case when n.available then case n.notification_type
        when 'encouragement_received' then case when n.daily_encouragement_id is not null then '/?dailyEncouragement=' || n.daily_encouragement_id else '/?occurrence=' || n.occurrence_id || '&encouragement=' || n.encouragement_id end
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

alter publication supabase_realtime add table public.daily_encouragements;

commit;
