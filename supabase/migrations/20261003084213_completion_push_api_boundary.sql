-- Hosted pg_net objects are owned by supabase_admin. Project postgres cannot
-- revoke those platform grants; the API must not expose net or Vault schemas.
-- The application-owned trigger function is private and never a callable RPC.
revoke all on function private.enqueue_completion_push() from public, anon, authenticated;

do $$
begin
  if has_function_privilege('anon', 'private.enqueue_completion_push()', 'execute')
    or has_function_privilege('authenticated', 'private.enqueue_completion_push()', 'execute') then
    raise exception 'Completion webhook must not be callable by clients';
  end if;
  if has_table_privilege('anon', 'vault.decrypted_secrets', 'select')
    or has_table_privilege('authenticated', 'vault.decrypted_secrets', 'select') then
    raise exception 'Vault secrets must not be readable by clients';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'graphql_public') and p.prokind = 'f'
      and p.prosrc ~ '(net[.]|vault[.]|enqueue_completion_push)'
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))
  ) then
    raise exception 'An API-callable function exposes webhook internals';
  end if;
end;
$$;
