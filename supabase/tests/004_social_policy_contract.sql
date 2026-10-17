begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(7);
select extensions.is(to_regclass('public.blocks'), null::regclass, 'removed block storage cannot retain hidden rules');
select extensions.is(to_regprocedure('public.block_user(uuid)'), null::regprocedure, 'block RPC is removed');
select extensions.is(to_regprocedure('public.unblock_user(uuid)'), null::regprocedure, 'unblock RPC is removed');
select extensions.is(to_regprocedure('public.list_blocked_profiles()'), null::regprocedure, 'block list RPC is removed');
select extensions.is(to_regprocedure('public.hide_encouragement(bigint,boolean)'), null::regprocedure, 'owner-hide RPC is removed');
select extensions.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','private') and p.prokind = 'f'
    and (p.prosrc ~ 'public[.]blocks' or p.prosrc ~ 'hidden_by_owner')
), 'no remaining application function references removed policies');
select extensions.ok(exists (
  select 1 from pg_constraint where conrelid = 'public.encouragements'::regclass
    and conname = 'encouragements_visibility_check'
    and pg_get_constraintdef(oid) not like '%hidden_by_owner%'
    and pg_get_constraintdef(oid) like '%deleted_by_author%'
), 'visibility constraint preserves only visible and author-deleted states');
select * from extensions.finish();
rollback;
