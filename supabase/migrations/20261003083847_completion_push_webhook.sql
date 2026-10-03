-- Deployment-specific values are configured in Vault, never in this migration.
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

revoke all on table vault.secrets, vault.decrypted_secrets from public, anon, authenticated;
revoke all on table net.http_request_queue, net._http_response from public, anon, authenticated;
revoke execute on function net.http_post(text, jsonb, jsonb, jsonb, integer)
  from public, anon, authenticated;

create function private.enqueue_completion_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_secret text;
  function_url text;
begin
  if tg_op <> 'INSERT' or tg_table_schema <> 'public' or tg_table_name <> 'notifications' then
    return new;
  end if;

  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets where name = 'lemon_push_webhook_secret';
  select decrypted_secret into function_url
  from vault.decrypted_secrets where name = 'lemon_push_function_url';

  if webhook_secret is null or char_length(webhook_secret) < 32
    or function_url is null or function_url !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/send-completion-push$' then
    raise warning 'Completion push webhook is not configured';
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    body := jsonb_build_object(
      'type', 'INSERT', 'schema', 'public', 'table', 'notifications',
      'record', jsonb_build_object('id', new.id)
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json', 'x-lemon-webhook-secret', webhook_secret
    ),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  -- Push enqueue failures must not undo completion, points, or in-app notifications.
  -- Do not log SQLERRM: provider/configuration errors may contain secret values.
  raise warning 'Completion push enqueue failed (SQLSTATE %)', sqlstate;
  return new;
end;
$$;

revoke all on function private.enqueue_completion_push() from public, anon, authenticated;

create trigger send_completion_push
after insert on public.notifications
for each row execute function private.enqueue_completion_push();
