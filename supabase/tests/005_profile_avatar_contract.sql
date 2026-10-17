begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(24);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'avatar-owner@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Avatar owner","time_zone":"Asia/Seoul"}', now(), now()),
('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000102', 'authenticated', 'authenticated', 'avatar-friend@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Avatar friend","time_zone":"Asia/Seoul"}', now(), now()),
('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000103', 'authenticated', 'authenticated', 'avatar-stranger@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Avatar stranger","time_zone":"Asia/Seoul"}', now(), now());
update public.profile_private set invite_code = 'AVATAR0102' where user_id = '00000000-0000-0000-0000-000000000102';
select extensions.ok(not has_function_privilege('anon', 'public.update_my_profile(text,text,text)', 'execute'), 'anonymous callers cannot update avatars');
select extensions.throws_ok(
  $$update public.profiles set avatar_key = 'unknown' where id = '00000000-0000-0000-0000-000000000101'$$,
  '23514', 'new row for relation "profiles" violates check constraint "profiles_avatar_key_check"',
  'database constraint rejects unsupported avatar keys'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.is((select avatar_key from public.profiles where id = auth.uid()), 'lemon', 'new profiles default to lemon');
select extensions.is(public.update_my_profile(null, null, 'cat')->>'avatarKey', 'cat', 'owner saves selected avatar through profile RPC');
select extensions.is((select avatar_key from public.profiles where id = auth.uid()), 'cat', 'selected avatar is persisted');
select extensions.is(public.update_my_profile(null, 'Asia/Tokyo')->>'avatarKey', 'cat', 'existing two-argument call preserves omitted avatar');
select extensions.throws_ok($$select public.update_my_profile('Changed', null, 'unknown')$$, 'P0001', 'INVALID_AVATAR_KEY', 'invalid avatar rejects the profile mutation');
select extensions.is((select display_name from public.profiles where id = auth.uid()), 'Avatar owner', 'invalid avatar cannot partially change nickname');
select extensions.throws_ok($$update public.profiles set avatar_key = 'dog' where id = auth.uid()$$, '42501', 'permission denied for table profiles', 'clients cannot bypass the profile RPC for avatar updates');
select set_config('test.avatar_request_id', public.request_connection('AVATAR0102')::text, true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
select extensions.is((select avatar_key from public.profiles where id = '00000000-0000-0000-0000-000000000101'), 'cat', 'pending request participant sees the public avatar');
select public.update_my_profile(null, null, 'fox');
select public.respond_connection_request(current_setting('test.avatar_request_id')::bigint, true);
select extensions.is((select avatar_key from public.profiles where id = '00000000-0000-0000-0000-000000000101'), 'cat', 'accepted friend sees the public avatar');
select extensions.is((select count(*)::integer from public.profile_private where user_id = '00000000-0000-0000-0000-000000000101'), 0, 'public avatar does not expose private profile fields');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select public.create_task_schedule('Avatar owner task', current_date, null, 'none');
select set_config('test.avatar_occurrence_id', (select id::text from public.task_occurrences where title_snapshot = 'Avatar owner task'), true);
select public.complete_occurrence(current_setting('test.avatar_occurrence_id')::bigint);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
select extensions.is(public.list_social_activity()->'items'->0->'owner'->>'avatarKey', 'cat', 'friend activity projects the owner avatar');
select extensions.is(public.get_occurrence_detail(current_setting('test.avatar_occurrence_id')::bigint)->'owner'->>'avatarKey', 'cat', 'occurrence detail projects the owner avatar');
reset role;
insert into public.encouragements(occurrence_id, owner_id, author_id, reaction, message)
values (current_setting('test.avatar_occurrence_id')::bigint, '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102', 'clap', 'Good work');
insert into public.notifications(recipient_id, actor_id, notification_type, occurrence_id, encouragement_id, event_key)
select owner_id, author_id, 'encouragement_received', occurrence_id, id, 'encouragement:' || id from public.encouragements;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select extensions.is(public.get_occurrence_detail(current_setting('test.avatar_occurrence_id')::bigint)->'encouragements'->0->>'authorAvatarKey', 'fox', 'detail projects a connected encouragement author avatar');
select extensions.is(public.list_encouragement_summaries(array[current_setting('test.avatar_occurrence_id')::bigint])->'items'->0->'summary'->'latestMessage'->>'authorAvatarKey', 'fox', 'summary projects the latest connected author avatar');
select extensions.is(public.list_inbox('encouragement')->'items'->0->>'actorAvatarKey', 'fox', 'inbox projects the connected actor avatar');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select extensions.is((select count(*)::integer from public.profiles where id in ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102')), 0, 'unrelated user cannot read public profile avatars');
select extensions.is(jsonb_array_length(public.list_social_activity()->'items'), 0, 'unrelated activity cannot expose owner avatars');
select extensions.throws_ok(format('select public.get_occurrence_detail(%s)', current_setting('test.avatar_occurrence_id')), 'P0001', 'FORBIDDEN', 'unrelated detail remains forbidden');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select public.disconnect_friend('00000000-0000-0000-0000-000000000102');
select extensions.is(public.get_occurrence_detail(current_setting('test.avatar_occurrence_id')::bigint)->'encouragements'->0->>'authorAvatarKey', 'lemon', 'past detail masks disconnected author avatar');
select extensions.is(public.list_encouragement_summaries(array[current_setting('test.avatar_occurrence_id')::bigint])->'items'->0->'summary'->'latestMessage'->>'authorAvatarKey', 'lemon', 'past summary masks disconnected author avatar');
select extensions.is(public.list_inbox('encouragement')->'items'->0->>'actorAvatarKey', 'lemon', 'past inbox masks disconnected actor avatar');
select extensions.is((select avatar_key from public.profiles where id = auth.uid()), 'cat', 'disconnect preserves the owner selected avatar');
select * from extensions.finish();
rollback;
