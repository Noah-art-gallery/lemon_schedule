begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

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
        'device_tokens'
      )
      and relation.relrowsecurity
  ),
  13,
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

select * from extensions.finish();

rollback;
