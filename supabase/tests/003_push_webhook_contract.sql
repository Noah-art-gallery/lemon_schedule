begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(12);

select extensions.ok(exists (
  select 1 from pg_trigger
  where tgrelid = 'public.notifications'::regclass
    and tgname = 'send_completion_push' and tgtype = 5 and tgenabled = 'O'
), 'webhook runs only after each notification INSERT');
select extensions.ok(not has_function_privilege('anon', 'private.enqueue_completion_push()', 'execute'),
  'anonymous users cannot call the webhook function');
select extensions.ok(not has_function_privilege('authenticated', 'private.enqueue_completion_push()', 'execute'),
  'users cannot call the webhook function');
select extensions.ok(not has_table_privilege('anon', 'vault.decrypted_secrets', 'select'),
  'anonymous users cannot read Vault secrets');
select extensions.ok(not has_table_privilege('authenticated', 'vault.decrypted_secrets', 'select'),
  'users cannot read Vault secrets');
select extensions.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'graphql_public') and p.prokind = 'f'
    and p.prosrc ~ '(net[.]|vault[.]|enqueue_completion_push)'
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'))
), 'API-callable functions do not expose webhook internals');
select extensions.ok((select prosecdef and 'search_path=""' = any(proconfig)
  from pg_proc where oid = 'private.enqueue_completion_push()'::regprocedure),
  'private trigger pins its security-definer search path');

-- Keep all configuration and queued HTTP inside this rollback-only transaction.
select vault.update_secret(id, new_name := name || '_contract_backup')
from vault.secrets where name in ('lemon_push_webhook_secret', 'lemon_push_function_url');
select vault.create_secret(repeat('x', 64), 'lemon_push_webhook_secret');
select vault.create_secret('https://contracttest.supabase.co/functions/v1/send-completion-push',
  'lemon_push_function_url');
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000031', 'authenticated', 'authenticated',
  'push-contract@example.test', '{"provider":"email","providers":["email"]}',
  '{"display_name":"Push contract","time_zone":"Asia/Seoul"}');

with inserted as (
  insert into public.notifications (recipient_id, notification_type, event_key)
  values ('00000000-0000-0000-0000-000000000031', 'task_completed', 'push-webhook-contract')
  returning id
) select set_config('test.push_notification_id', (select id::text from inserted), true);

select extensions.is((select count(*)::integer from net.http_request_queue
  where convert_from(body, 'UTF8')::jsonb -> 'record' ->> 'id' = current_setting('test.push_notification_id')),
  1, 'one INSERT queues exactly one request');
select extensions.ok((select convert_from(body, 'UTF8')::jsonb = jsonb_build_object(
  'type', 'INSERT', 'schema', 'public', 'table', 'notifications',
  'record', jsonb_build_object('id', current_setting('test.push_notification_id')::bigint)
) from net.http_request_queue
  where convert_from(body, 'UTF8')::jsonb -> 'record' ->> 'id' = current_setting('test.push_notification_id')),
  'payload includes only the event and notification ID');
select extensions.ok((select headers ->> 'x-lemon-webhook-secret' = repeat('x', 64)
  from net.http_request_queue
  where convert_from(body, 'UTF8')::jsonb -> 'record' ->> 'id' = current_setting('test.push_notification_id')),
  'request uses the Vault secret');
update public.notifications set read_at = now()
where id = current_setting('test.push_notification_id')::bigint;
select extensions.is((select count(*)::integer from net.http_request_queue
  where convert_from(body, 'UTF8')::jsonb -> 'record' ->> 'id' = current_setting('test.push_notification_id')),
  1, 'reading a notification does not enqueue another request');
delete from vault.secrets where name = 'lemon_push_webhook_secret';
select extensions.lives_ok($$insert into public.notifications (recipient_id, notification_type, event_key)
  values ('00000000-0000-0000-0000-000000000031', 'task_completed', 'push-missing-config-contract')$$,
  'missing webhook configuration does not undo the in-app notification');

select * from extensions.finish();
rollback;
