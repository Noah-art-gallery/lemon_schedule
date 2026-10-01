begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(16);

select extensions.is(
  (
    select count(*)::integer
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'profiles',
        'profile_private',
        'connection_requests',
        'connections',
        'blocks',
        'tasks',
        'task_occurrences',
        'completion_events',
        'encouragements',
        'notifications',
        'pets',
        'pet_unlocks',
        'device_tokens',
        'push_delivery_attempts'
      )
      and relation.relrowsecurity
  ),
  14,
  'every exposed MVP table enables row-level security'
);

select extensions.ok(
  exists (
    select 1
    from pg_class as relation
    where relation.oid = 'public.daily_progress'::regclass
      and 'security_invoker=on' = any(coalesce(relation.reloptions, array[]::text[]))
  ),
  'daily progress view executes with caller permissions'
);

select extensions.ok(
  not has_function_privilege('anon', 'public.complete_occurrence(bigint)', 'execute'),
  'anonymous callers cannot complete an occurrence'
);

select extensions.ok(
  has_function_privilege('authenticated', 'public.complete_occurrence(bigint)', 'execute'),
  'authenticated callers can invoke the guarded completion RPC'
);

select extensions.ok(
  not has_table_privilege('authenticated', 'public.tasks', 'insert'),
  'authenticated callers cannot bypass atomic task creation'
);

select extensions.ok(
  not has_table_privilege('authenticated', 'public.task_occurrences', 'insert'),
  'authenticated callers cannot forge reward-bearing occurrences'
);

select extensions.ok(
  not has_column_privilege('authenticated', 'public.tasks', 'title', 'update'),
  'authenticated callers cannot bypass schedule-aware task updates'
);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.create_task_schedule(text,date,time without time zone,text)',
    'execute'
  ),
  'authenticated callers can invoke atomic task creation'
);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.list_task_occurrences(uuid,date,date)',
    'execute'
  ),
  'authenticated callers can request a bounded occurrence range'
);

select extensions.ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'completion_events'
      and indexdef like '%UNIQUE%occurrence_id%'
  ),
  'one completion event is allowed per occurrence'
);

select extensions.ok(
  exists (
    select 1
    from storage.buckets
    where id = 'pet-drawings' and not public
  ),
  'pet drawing bucket is private'
);

select extensions.is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'pet_drawings_%'
  ),
  4,
  'pet drawing bucket has select, insert, update, and delete policies'
);

select extensions.ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created' and not tgisinternal
  ),
  'new auth users receive a profile and private pet record'
);

select extensions.ok(
  not has_table_privilege('authenticated', 'public.push_delivery_attempts', 'select'),
  'users cannot inspect delivery status or provider identifiers'
);

select extensions.ok(
  has_table_privilege('service_role', 'public.push_delivery_attempts', 'insert'),
  'server delivery handler can claim an attempt'
);

select extensions.ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'push_delivery_attempts'
      and indexdef like '%UNIQUE%notification_id%device_id%'
  ),
  'one push attempt is claimed per notification and device'
);

select * from extensions.finish();

rollback;
