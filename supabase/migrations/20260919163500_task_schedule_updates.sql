revoke update on public.tasks from authenticated;
revoke insert (owner_id, title, due_date, due_time, recurrence) on public.tasks from authenticated;
revoke update (title, due_date, due_time, recurrence) on public.tasks from authenticated;
revoke update (recurrence_changed_at) on public.tasks from authenticated;
revoke insert on public.tasks from authenticated;
revoke insert on public.task_occurrences from authenticated;

create function public.update_task_schedule(
  target_task_id bigint,
  target_title text default null,
  target_due_date date default null,
  target_due_time time default null,
  target_recurrence text default null,
  due_time_provided boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_task public.tasks%rowtype;
  owner_today date;
  changed_at timestamptz;
  next_title text;
  next_due_date date;
  next_due_time time;
  next_recurrence text;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if target_recurrence is not null and target_recurrence not in ('none', 'daily', 'weekly', 'monthly') then
    raise exception 'INVALID_RECURRENCE' using errcode = 'P0001';
  end if;

  select * into selected_task
  from public.tasks
  where id = target_task_id and owner_id = current_user_id and deleted_at is null
  for update;

  if not found then
    raise exception 'TASK_NOT_FOUND' using errcode = 'P0001';
  end if;

  next_title := coalesce(target_title, selected_task.title);
  next_due_date := coalesce(target_due_date, selected_task.due_date);
  next_due_time := case when due_time_provided then target_due_time else selected_task.due_time end;
  next_recurrence := coalesce(target_recurrence, selected_task.recurrence);

  select (clock_timestamp() at time zone time_zone)::date into owner_today
  from public.profile_private
  where user_id = current_user_id;

  update public.tasks
  set
    title = btrim(next_title),
    due_date = next_due_date,
    due_time = next_due_time,
    recurrence = next_recurrence,
    recurrence_changed_at = clock_timestamp()
  where id = target_task_id
  returning updated_at into changed_at;

  delete from public.task_occurrences
  where task_id = target_task_id
    and status = 'pending'
    and occurrence_date >= owner_today;

  perform private.materialize_task_occurrences(
    target_task_id,
    greatest(next_due_date, owner_today),
    greatest(next_due_date, owner_today) + 366
  );

  return jsonb_build_object('taskId', target_task_id, 'updatedAt', changed_at);
end;
$$;

revoke all on function public.update_task_schedule(bigint, text, date, time, text, boolean)
  from public, anon;
grant execute on function public.update_task_schedule(bigint, text, date, time, text, boolean)
  to authenticated;

create function private.materialize_task_occurrences(
  target_task_id bigint,
  range_from date,
  range_to date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_task public.tasks%rowtype;
  candidate_date date;
  month_cursor date;
  anchor_day integer;
begin
  select * into selected_task
  from public.tasks
  where id = target_task_id and deleted_at is null
  for update;

  if not found or range_to < range_from then
    return;
  end if;

  if selected_task.recurrence = 'none' then
    if selected_task.due_date between range_from and range_to then
      insert into public.task_occurrences (
        task_id, owner_id, occurrence_date, title_snapshot, due_time, recurrence_snapshot
      ) values (
        selected_task.id, selected_task.owner_id, selected_task.due_date,
        selected_task.title, selected_task.due_time, selected_task.recurrence
      ) on conflict (task_id, occurrence_date) do nothing;
    end if;
    return;
  end if;

  if selected_task.recurrence in ('daily', 'weekly') then
    candidate_date := selected_task.due_date;
    if candidate_date < range_from then
      if selected_task.recurrence = 'daily' then
        candidate_date := range_from;
      else
        candidate_date := candidate_date
          + (ceil((range_from - candidate_date) / 7.0)::integer * 7);
      end if;
    end if;

    while candidate_date <= range_to loop
      insert into public.task_occurrences (
        task_id, owner_id, occurrence_date, title_snapshot, due_time, recurrence_snapshot
      ) values (
        selected_task.id, selected_task.owner_id, candidate_date,
        selected_task.title, selected_task.due_time, selected_task.recurrence
      ) on conflict (task_id, occurrence_date) do nothing;
      candidate_date := candidate_date + case when selected_task.recurrence = 'daily' then 1 else 7 end;
    end loop;
    return;
  end if;

  anchor_day := extract(day from selected_task.due_date)::integer;
  month_cursor := date_trunc('month', greatest(selected_task.due_date, range_from))::date;
  while month_cursor <= date_trunc('month', range_to)::date loop
    candidate_date := make_date(
      extract(year from month_cursor)::integer,
      extract(month from month_cursor)::integer,
      least(
        anchor_day,
        extract(day from (month_cursor + interval '1 month' - interval '1 day'))::integer
      )
    );
    if candidate_date >= selected_task.due_date and candidate_date between range_from and range_to then
      insert into public.task_occurrences (
        task_id, owner_id, occurrence_date, title_snapshot, due_time, recurrence_snapshot
      ) values (
        selected_task.id, selected_task.owner_id, candidate_date,
        selected_task.title, selected_task.due_time, selected_task.recurrence
      ) on conflict (task_id, occurrence_date) do nothing;
    end if;
    month_cursor := (month_cursor + interval '1 month')::date;
  end loop;
end;
$$;

revoke all on function private.materialize_task_occurrences(bigint, date, date)
  from public, anon, authenticated;

create function public.create_task_schedule(
  target_title text,
  target_due_date date,
  target_due_time time,
  target_recurrence text default 'none'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  task_id bigint;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if target_recurrence not in ('none', 'daily', 'weekly', 'monthly') then
    raise exception 'INVALID_RECURRENCE' using errcode = 'P0001';
  end if;

  insert into public.tasks (owner_id, title, due_date, due_time, recurrence)
  values (
    current_user_id, btrim(target_title), target_due_date, target_due_time, target_recurrence
  ) returning id into task_id;

  perform private.materialize_task_occurrences(
    task_id,
    target_due_date,
    target_due_date + 366
  );

  return jsonb_build_object('taskId', task_id);
end;
$$;

create function public.list_task_occurrences(
  target_owner_id uuid,
  range_from date,
  range_to date
)
returns setof public.task_occurrences
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  task_id bigint;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if range_from is null or range_to is null or range_to < range_from
    or range_to - range_from > 800 then
    raise exception 'INVALID_DATE_RANGE' using errcode = 'P0001';
  end if;
  if target_owner_id is null then
    raise exception 'INVALID_OWNER' using errcode = 'P0001';
  end if;
  perform private.lock_user_pair(current_user_id, target_owner_id);
  if target_owner_id <> current_user_id
    and not private.are_connected(current_user_id, target_owner_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  for task_id in
    select id from public.tasks
    where owner_id = target_owner_id and deleted_at is null
  loop
    perform private.materialize_task_occurrences(task_id, range_from, range_to);
  end loop;

  return query
  select occurrence.*
  from public.task_occurrences as occurrence
  join public.tasks as active_task on active_task.id = occurrence.task_id
  where occurrence.owner_id = target_owner_id
    and occurrence.occurrence_date between range_from and range_to
    and active_task.deleted_at is null
  order by occurrence.occurrence_date, occurrence.due_time nulls last, occurrence.id;
end;
$$;

revoke all on function public.create_task_schedule(text, date, time, text) from public, anon;
revoke all on function public.list_task_occurrences(uuid, date, date) from public, anon;
grant execute on function public.create_task_schedule(text, date, time, text) to authenticated;
grant execute on function public.list_task_occurrences(uuid, date, date) to authenticated;

create function public.get_owner_today(target_owner_id uuid)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_zone text;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if target_owner_id is null then
    raise exception 'INVALID_OWNER' using errcode = 'P0001';
  end if;
  perform private.lock_user_pair(current_user_id, target_owner_id);
  if target_owner_id <> current_user_id
    and not private.are_connected(current_user_id, target_owner_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  select time_zone into selected_zone
  from public.profile_private
  where user_id = target_owner_id;
  return (clock_timestamp() at time zone selected_zone)::date;
end;
$$;

revoke all on function public.get_owner_today(uuid) from public, anon;
grant execute on function public.get_owner_today(uuid) to authenticated;
