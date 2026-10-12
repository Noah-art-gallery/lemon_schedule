begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(139);

select extensions.throws_ok(
  $$insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000010',
      'authenticated', 'authenticated', 'missing-name@example.test', '', now(),
      '{"provider":"email","providers":["email"]}', '{"time_zone":"Asia/Seoul"}', now(), now()
    )$$,
  'P0001',
  'INVALID_DISPLAY_NAME',
  'signup requires an explicit display name'
);
select extensions.throws_ok(
  $$insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000011',
      'authenticated', 'authenticated', 'missing-zone@example.test', '', now(),
      '{"provider":"email","providers":["email"]}', '{"display_name":"No zone"}', now(), now()
    )$$,
  'P0001',
  'INVALID_TIME_ZONE',
  'signup requires an explicit IANA time zone'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'owner@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Owner","time_zone":"Asia/Seoul"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'friend@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Friend","time_zone":"Asia/Seoul"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'stranger@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Stranger","time_zone":"Asia/Seoul"}',
    now(),
    now()
  );

update public.profile_private
set invite_code = case user_id
  when '00000000-0000-0000-0000-000000000001' then 'LEMONA0001'
  when '00000000-0000-0000-0000-000000000002' then 'LEMONB0001'
  else 'LEMONC0001'
end
where user_id in (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);

insert into public.pet_unlocks (user_id, item_key, item_kind)
values ('00000000-0000-0000-0000-000000000001', 'sunny-yellow', 'color');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select extensions.lives_ok(
  $$update public.pets
    set drawing_path = '00000000-0000-0000-0000-000000000001/pet.png'
    where user_id = auth.uid()$$,
  'owner can save a PNG drawing path accepted by the final constraint'
);
select extensions.throws_ok(
  $$select public.set_pet_decorations('lemon-yellow', null, null)$$,
  'P0001',
  'PET_ITEM_LOCKED',
  'locked pet colors cannot be selected'
);

reset role;
insert into public.pet_unlocks (user_id, item_key, item_kind)
values ('00000000-0000-0000-0000-000000000001', 'lemon-yellow', 'color');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.lives_ok(
  $$select public.set_pet_decorations('lemon-yellow', null, null)$$,
  'unlocked pet colors can be selected'
);

select extensions.throws_ok(
  $$update public.profile_private set time_zone = 'Not/AZone'$$,
  '23514',
  'INVALID_TIME_ZONE',
  'profile time zone must be an IANA identifier'
);
select extensions.lives_ok(
  $$select public.update_my_profile(null, 'Asia/Tokyo')$$,
  'profile update can change only the time zone'
);
select extensions.is(
  (select display_name from public.profiles where id = auth.uid()),
  'Owner',
  'partial profile update preserves the omitted nickname'
);
select extensions.is(
  (select time_zone from public.profile_private where user_id = auth.uid()),
  'Asia/Tokyo',
  'profile update applies the requested time zone atomically'
);
select extensions.lives_ok(
  $$select public.update_my_profile(null, 'Asia/Seoul')$$,
  'profile time zone can be restored'
);
select extensions.lives_ok(
  $$insert into public.device_tokens (user_id, device_id, token, platform)
    values (auth.uid(), 'owner-phone', 'owner-device-token-00000001', 'android')$$,
  'owner can register a device token'
);
select extensions.throws_ok(
  $$insert into public.pets (user_id) values (auth.uid())$$,
  '42501',
  'permission denied for table pets',
  'authenticated users cannot create a second pet row'
);
select extensions.throws_ok(
  $$delete from public.pets where user_id = auth.uid()$$,
  '42501',
  'permission denied for table pets',
  'authenticated users cannot delete their provisioned pet row'
);
select extensions.is(
  (select count(*)::integer from public.pets where user_id = auth.uid()),
  1,
  'signup provisioning leaves exactly one pet row'
);

select extensions.lives_ok(
  $$select public.create_task_schedule('Owner task', current_date, null, 'none')$$,
  'owner can create a task'
);
select extensions.throws_ok(
  $$select public.create_task_schedule(repeat('a', 81), current_date, null, 'none')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_title_check"',
  'task title cannot exceed 80 stored characters'
);
select extensions.throws_ok(
  $$select public.create_task_schedule(repeat(' ', 80), current_date, null, 'none')$$,
  '23514',
  'new row for relation "tasks" violates check constraint "tasks_title_check"',
  'task title cannot contain only whitespace'
);
select extensions.is(
  (select count(*)::integer from public.tasks where title = 'Owner task'),
  1,
  'owner can read their task'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select extensions.is(
  (select count(*)::integer from public.tasks where title = 'Owner task'),
  0,
  'nonfriend cannot read the task'
);
select extensions.throws_ok(
  $$insert into public.tasks (owner_id, title, due_date) values ('00000000-0000-0000-0000-000000000001', 'Forged task', current_date)$$,
  '42501',
  'permission denied for table tasks',
  'nonowner cannot create a task for somebody else'
);
select extensions.is(
  (select count(*)::integer from public.profile_private where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'nonfriend cannot read owner private profile data'
);
select extensions.is(
  (select count(*)::integer from public.pets where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'nonfriend cannot read owner pet data'
);
select extensions.is(
  (select count(*)::integer from public.pet_unlocks where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'nonfriend cannot read owner pet unlocks'
);
select extensions.is(
  (select count(*)::integer from public.device_tokens where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'nonfriend cannot read owner device tokens'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.lives_ok(
  $$select public.request_connection('LEMONB0001')$$,
  'owner can request a connection by invite code'
);
select extensions.throws_ok(
  $$select public.request_connection('LEMONB0001')$$,
  'P0001',
  'CONFLICT',
  'duplicate pending request is rejected as a conflict'
);
select extensions.is(
  (select count(*)::integer from public.connection_requests where status = 'pending'),
  1,
  'an unordered pair has only one pending request'
);
select extensions.throws_ok(
  $$select public.request_connection('LEMONA0001')$$,
  'P0001',
  'CANNOT_INVITE_SELF',
  'self connection requests are rejected'
);

select extensions.is(
  (select count(*)::integer from public.profiles where display_name = 'Friend'),
  1,
  'pending requester can read the addressee public nickname'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select extensions.is(
  (select count(*)::integer from public.profiles where display_name in ('Owner', 'Friend')),
  0,
  'unrelated user cannot read pending-request participant nicknames'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.profiles where display_name = 'Owner'),
  1,
  'pending addressee can read the requester public nickname'
);
select extensions.lives_ok(
  $$select public.respond_connection_request((select id from public.connection_requests where status = 'pending'), true)$$,
  'addressee can accept a pending request'
);
select extensions.is(
  (select count(*)::integer from public.connections),
  1,
  'acceptance creates one active unordered connection'
);
select extensions.is(
  (select count(*)::integer from public.tasks where title = 'Owner task'),
  1,
  'connected friend can read the task'
);
select extensions.throws_ok(
  $$insert into public.task_occurrences (
      task_id, owner_id, occurrence_date, title_snapshot, recurrence_snapshot
    ) values (
      (select id from public.tasks where title = 'Owner task'),
      '00000000-0000-0000-0000-000000000001',
      current_date + 50,
      'Forged reward',
      'none'
    )$$,
  '42501',
  'permission denied for table task_occurrences',
  'authenticated users cannot forge reward-bearing occurrences'
);
select extensions.is(
  (select count(*)::integer from public.profile_private where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'connected friend cannot read owner private profile data'
);
select extensions.is(
  (select count(*)::integer from public.pets where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'connected friend cannot read owner pet data'
);
select extensions.is(
  (select count(*)::integer from public.pet_unlocks where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'connected friend cannot read owner pet unlocks'
);
select extensions.is(
  (select count(*)::integer from public.device_tokens where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'connected friend cannot read owner device tokens'
);
select extensions.throws_ok(
  $$update public.tasks set title = 'Friend edit' where title = 'Owner task'$$,
  '42501',
  'permission denied for table tasks',
  'friend update is safely filtered by RLS'
);
select extensions.is(
  (select count(*)::integer from public.tasks where title = 'Owner task'),
  1,
  'friend cannot mutate the owner task'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  $$select public.request_connection('LEMONB0001')$$,
  'P0001',
  'ALREADY_CONNECTED',
  'already connected users cannot request again'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.is(
  public.respond_connection_request(
    (select id from public.connection_requests where status = 'accepted'),
    true
  ),
  false,
  'an accepted request cannot be accepted twice'
);
select extensions.is(
  (select count(*)::integer from public.connections),
  1,
  'repeat acceptance does not duplicate the connection'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select count(*)::integer from public.task_occurrences where title_snapshot = 'Owner task'),
  1,
  'atomic task creation provisions the pending occurrence'
);
select extensions.lives_ok(
  $$select public.complete_occurrence((select id from public.task_occurrences limit 1))$$,
  'owner can complete the occurrence'
);
select extensions.is(
  (select lemon_points::integer from public.profile_private where user_id = auth.uid()),
  1,
  'first completion grants exactly one point'
);
select extensions.is(
  (select count(*)::integer from public.completion_events),
  1,
  'first completion creates one immutable event'
);

select set_config(
  'test.owner_occurrence_id',
  (select id::text from public.task_occurrences where title_snapshot = 'Owner task'),
  true
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.notifications where notification_type = 'task_completed'),
  1,
  'current friend receives one completion notification'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.lives_ok(
  $$select public.complete_occurrence((select id from public.task_occurrences limit 1))$$,
  'duplicate completion is idempotent'
);
select extensions.is(
  (select lemon_points::integer from public.profile_private where user_id = auth.uid()),
  1,
  'duplicate completion grants no extra point'
);
select extensions.is(
  (select count(*)::integer from public.completion_events),
  1,
  'duplicate completion creates no extra event'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.notifications where notification_type = 'task_completed'),
  1,
  'duplicate completion creates no extra recipient notification'
);
select extensions.lives_ok(
  $$select public.upsert_encouragement((select id from public.task_occurrences limit 1), 'lemon', '잘했어!')$$,
  'connected friend can encourage a completed occurrence'
);
select extensions.is(
  (select count(*)::integer from public.encouragements),
  1,
  'friend has one encouragement per occurrence'
);

select set_config('test.encouragement_id', (select id::text from public.encouragements), true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.lives_ok(
  $$select public.hide_encouragement((select id from public.encouragements limit 1), true)$$,
  'owner can hide an encouragement'
);
select extensions.is(
  (select count(*)::integer from public.encouragements where visibility = 'hidden_by_owner'),
  1,
  'owner keeps hidden encouragement in history'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.encouragements where visibility = 'hidden_by_owner'),
  1,
  'author can still see own hidden encouragement while connected and complete'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.lives_ok(
  $$select public.hide_encouragement((select id from public.encouragements limit 1), false)$$,
  'owner can restore a non-deleted encouragement'
);

select extensions.lives_ok(
  $$select public.reopen_occurrence((select id from public.task_occurrences limit 1))$$,
  'owner can reopen the occurrence'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.encouragements),
  0,
  'reopened occurrence hides encouragement from connected users'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select count(*)::integer from public.encouragements),
  1,
  'owner retains encouragement history after reopen'
);
select extensions.lives_ok(
  $$select public.complete_occurrence((select id from public.task_occurrences limit 1))$$,
  'owner can complete a reopened occurrence'
);
select extensions.is(
  (select lemon_points::integer from public.profile_private where user_id = auth.uid()),
  1,
  'recompletion grants no extra point'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.encouragements),
  1,
  'recompletion reveals existing encouragement to connected users'
);
select extensions.lives_ok(
  $$select public.disconnect_friend('00000000-0000-0000-0000-000000000001')$$,
  'either side can disconnect'
);
select extensions.is(
  (select count(*)::integer from public.tasks where title = 'Owner task'),
  0,
  'disconnected user immediately loses task access'
);
select extensions.is(
  (select count(*)::integer from public.encouragements),
  0,
  'disconnected author loses historic encouragement access'
);
select extensions.is(
  (select count(*)::integer from public.profile_private where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'disconnected user cannot read former friend private profile data'
);
select extensions.is(
  (select count(*)::integer from public.pets where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'disconnected user cannot read former friend pet data'
);
select extensions.is(
  (select count(*)::integer from public.pet_unlocks where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'disconnected user cannot read former friend pet unlocks'
);
select extensions.is(
  (select count(*)::integer from public.device_tokens where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'disconnected user cannot read former friend device tokens'
);
select extensions.throws_ok(
  $$select public.upsert_encouragement((select id from public.task_occurrences limit 1), 'heart', '또 해냈어!')$$,
  'P0001',
  'ENCOURAGEMENT_NOT_ALLOWED',
  'disconnected user cannot write an encouragement'
);
select extensions.lives_ok(
  $$select public.request_connection('LEMONA0001')$$,
  'disconnected user can send a fresh connection request'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select count(*)::integer from public.encouragements),
  1,
  'task owner retains historic encouragement after disconnect'
);
select extensions.lives_ok(
  $$select public.respond_connection_request((select id from public.connection_requests where status = 'pending'), true)$$,
  'owner can accept the fresh connection request'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.tasks where title = 'Owner task'),
  1,
  'reconnected friend regains task access'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.lives_ok(
  $$select public.block_user('00000000-0000-0000-0000-000000000002')$$,
  'owner can block an actively connected friend'
);
select extensions.is(
  (select count(*)::integer from public.list_blocked_profiles()),
  1,
  'blocker can list the blocked public nickname'
);
select extensions.is(
  (select display_name from public.list_blocked_profiles() limit 1),
  'Friend',
  'blocked list exposes only the public nickname'
);
select extensions.is(
  (select count(*)::integer from public.connections),
  0,
  'blocking immediately removes the active connection'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.is(
  (select count(*)::integer from public.tasks where title = 'Owner task'),
  0,
  'blocked former friend immediately loses task access'
);
select extensions.is(
  (select count(*)::integer from public.profile_private where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'blocked user cannot read blocker private profile data'
);
select extensions.is(
  (select count(*)::integer from public.pets where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'blocked user cannot read blocker pet data'
);
select extensions.is(
  (select count(*)::integer from public.pet_unlocks where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'blocked user cannot read blocker pet unlocks'
);
select extensions.is(
  (select count(*)::integer from public.device_tokens where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'blocked user cannot read blocker device tokens'
);
select extensions.throws_ok(
  $$update public.tasks set title = 'Blocked edit' where owner_id = '00000000-0000-0000-0000-000000000001'$$,
  '42501',
  'permission denied for table tasks',
  'blocked task mutation is safely filtered by RLS'
);
select extensions.throws_ok(
  $$select public.upsert_encouragement((select id from public.task_occurrences limit 1), 'heart', '보이면 안 돼')$$,
  'P0001',
  'ENCOURAGEMENT_NOT_ALLOWED',
  'blocked user cannot write an encouragement'
);
select extensions.throws_ok(
  $$select public.request_connection('LEMONA0001')$$,
  'P0001',
  'CONNECTION_BLOCKED',
  'block prevents a new request from the blocked user'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select count(*)::integer from public.tasks where title = 'Owner task'),
  1,
  'blocked user did not mutate the owner task'
);
select extensions.throws_ok(
  $$select public.request_connection('LEMONB0001')$$,
  'P0001',
  'CONNECTION_BLOCKED',
  'block prevents a new request from the blocker'
);
select extensions.lives_ok(
  $$select public.unblock_user('00000000-0000-0000-0000-000000000002')$$,
  'blocker can unblock the user'
);
select extensions.is(
  (select count(*)::integer from public.connections),
  0,
  'unblock does not restore the old connection'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.lives_ok(
  $$select public.request_connection('LEMONA0001')$$,
  'unblocked user can request a new connection'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.lives_ok(
  $$select public.respond_connection_request((select id from public.connection_requests where status = 'pending'), true)$$,
  'owner can reconnect before deleting the task'
);
select extensions.lives_ok(
  $$select public.delete_task((select id from public.tasks where title = 'Owner task'))$$,
  'owner can logically delete a task'
);
select extensions.is(
  (select count(*)::integer from public.tasks where title = 'Owner task'),
  0,
  'logically deleted task disappears from owner queries'
);
select extensions.is(
  (select count(*)::integer from public.task_occurrences),
  0,
  'occurrences from a deleted task disappear from queries'
);

reset role;
select extensions.is(
  (select count(*)::integer from public.completion_events),
  1,
  'logical task deletion preserves first-completion history'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.throws_ok(
  $$select public.upsert_encouragement(current_setting('test.owner_occurrence_id')::bigint, 'heart', '삭제된 할 일')$$,
  'P0001',
  'ENCOURAGEMENT_NOT_ALLOWED',
  'connected user cannot encourage a logically deleted task'
);
select extensions.is(
  public.delete_encouragement(current_setting('test.encouragement_id')::bigint),
  true,
  'author deletion records a tombstone even after disconnect'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select count(*)::integer from public.encouragements),
  0,
  'deleted encouragement is hidden from its owner'
);

reset role;
select extensions.is(
  (
    select count(*)::integer from public.encouragements
    where visibility = 'deleted_by_author'
  ),
  1,
  'deleted encouragement remains as a historical tombstone'
);

-- Projection contracts use the existing fixture users and an isolated rollback transaction.
reset role;
update public.tasks set deleted_at = null where id = (select task_id from public.task_occurrences where id = current_setting('test.owner_occurrence_id')::bigint);
update public.task_occurrences set status = 'completed', completed_at = first_completed_at
  where id = current_setting('test.owner_occurrence_id')::bigint;
update public.encouragements set visibility = 'visible', message = 'Historic cheer'
  where id = current_setting('test.encouragement_id')::bigint;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.is(jsonb_array_length(public.list_social_activity()->'items'), 1, 'friend activity includes a current completed task');
select extensions.is(jsonb_array_length(public.list_own_history()->'items'), 0, 'history never returns another owner records');
select extensions.is((public.get_occurrence_detail(current_setting('test.owner_occurrence_id')::bigint)#>>'{permissions,canEncourage}')::boolean, true, 'completed friend record permits encouragement');
select extensions.is((public.list_encouragement_summaries(array[current_setting('test.owner_occurrence_id')::bigint])#>>'{items,0,summary,count}')::integer, 1, 'visible encouragement appears in summary');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select extensions.is(jsonb_array_length(public.list_social_activity()->'items'), 0, 'stranger has no activity');
select extensions.is(jsonb_array_length(public.list_encouragement_summaries(array[current_setting('test.owner_occurrence_id')::bigint])->'items'), 0, 'unreadable summaries are omitted rather than zeroed');
select extensions.throws_ok($$select public.get_occurrence_detail(current_setting('test.owner_occurrence_id')::bigint)$$, 'P0001', 'FORBIDDEN', 'stranger detail is forbidden');
select extensions.throws_ok($$select public.get_occurrence_detail(9223372036854775807)$$, 'P0001', 'NOT_FOUND', 'missing detail is distinct from forbidden');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select public.hide_encouragement(current_setting('test.encouragement_id')::bigint, true);
select extensions.is((public.get_occurrence_detail(current_setting('test.owner_occurrence_id')::bigint)#>>'{summary,count}')::integer, 0, 'hidden encouragement excluded from summary count');
select extensions.is(public.get_occurrence_detail(current_setting('test.owner_occurrence_id')::bigint)#>'{summary,latestMessage}', 'null'::jsonb, 'hidden encouragement excluded from preview');
select extensions.is(jsonb_array_length(public.get_occurrence_detail(current_setting('test.owner_occurrence_id')::bigint)->'encouragements'), 1, 'owner can restore hidden encouragement in detail');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.is(public.get_occurrence_detail(current_setting('test.owner_occurrence_id')::bigint)#>>'{summary,myEncouragement,visibility}', 'hidden_by_owner', 'author can edit their own hidden encouragement');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select public.reopen_occurrence(current_setting('test.owner_occurrence_id')::bigint);
select extensions.is(jsonb_array_length(public.list_own_history()->'items'), 1, 'reopened occurrence remains in owner history');
select extensions.is(jsonb_array_length(public.get_occurrence_detail(current_setting('test.owner_occurrence_id')::bigint)->'encouragements'), 1, 'owner retains historical cheers after reopen');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.is(jsonb_array_length(public.list_social_activity()->'items'), 0, 'reopened occurrence leaves friend activity');
select extensions.is((public.get_occurrence_detail(current_setting('test.owner_occurrence_id')::bigint)#>>'{permissions,canEncourage}')::boolean, false, 'reopened occurrence disables friend encouragement');
select extensions.is(jsonb_array_length(public.get_occurrence_detail(current_setting('test.owner_occurrence_id')::bigint)->'encouragements'), 0, 'friend cannot read historical cheers on reopened occurrence');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select public.delete_task((public.get_occurrence_detail(current_setting('test.owner_occurrence_id')::bigint)#>>'{occurrence,task_id}')::bigint);
select extensions.is((public.list_own_history()#>>'{items,0,taskDeleted}')::boolean, true, 'owner history includes logically deleted task');
select extensions.is((public.get_occurrence_detail(current_setting('test.owner_occurrence_id')::bigint)#>>'{permissions,canEdit}')::boolean, false, 'deleted historical detail is read only');
select public.disconnect_friend('00000000-0000-0000-0000-000000000002');
select extensions.is(jsonb_array_length(public.get_occurrence_detail(current_setting('test.owner_occurrence_id')::bigint)->'encouragements'), 1, 'owner historical cheer survives disconnect');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.throws_ok($$select public.get_occurrence_detail(current_setting('test.owner_occurrence_id')::bigint)$$, 'P0001', 'FORBIDDEN', 'disconnect revokes friend detail immediately');

reset role;
insert into public.tasks(owner_id,title,due_date,recurrence) values
  ('00000000-0000-0000-0000-000000000001','Old A','2000-01-01','none'),
  ('00000000-0000-0000-0000-000000000001','Old B','2000-01-01','none');
insert into public.task_occurrences(task_id,owner_id,occurrence_date,title_snapshot,recurrence_snapshot,status,completed_at,first_completed_at)
  select id,owner_id,due_date,title,recurrence,'completed','2000-01-01T00:00:00Z','2000-01-01T00:00:00Z' from public.tasks where title in ('Old A','Old B');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.is(jsonb_array_length(public.list_own_history()->'items'), 3, 'history has no one-year cutoff');
select set_config('test.history_cursor', public.list_own_history(null,null,2)->>'nextCursor', true);
select extensions.is(public.list_own_history(null,null,2)#>>'{items,1,occurrence,title_snapshot}', 'Old B', 'equal timestamps use occurrence id descending');
select extensions.is(public.list_own_history((current_setting('test.history_cursor')::jsonb->>'firstCompletedAt')::timestamptz,(current_setting('test.history_cursor')::jsonb->>'occurrenceId')::bigint,2)#>>'{items,0,occurrence,title_snapshot}', 'Old A', 'cursor handles tied timestamps without duplicates');
select extensions.is(public.list_own_history((current_setting('test.history_cursor')::jsonb->>'firstCompletedAt')::timestamptz,(current_setting('test.history_cursor')::jsonb->>'occurrenceId')::bigint,2)->'nextCursor', 'null'::jsonb, 'last history page has no cursor');

reset role;
delete from public.notifications;
insert into public.notifications(recipient_id,actor_id,notification_type,occurrence_id,encouragement_id,event_key) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','encouragement_received',current_setting('test.owner_occurrence_id')::bigint,current_setting('test.encouragement_id')::bigint,'test:cheer');
select set_config('test.inbox_highwater', (select max(id)::text from public.notifications), true);
insert into public.notifications(recipient_id,actor_id,notification_type,event_key) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','connection_accepted','test:accepted'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','task_completed','test:completed'),
('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','connection_accepted','test:other-recipient');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.is(jsonb_array_length(public.list_inbox()->'items'), 2, 'inbox excludes completions and other recipients');
select extensions.is((public.get_inbox_unread_count()->>'unreadCount')::integer, 2, 'unread count excludes completion events');
select extensions.is(jsonb_array_length(public.list_inbox('encouragement')->'items'), 1, 'encouragement filter is exact');
select extensions.is(public.list_inbox('encouragement')#>>'{items,0,availability}', 'available', 'owner can open hidden historical encouragement detail');
select extensions.is(public.list_inbox('encouragement')#>'{items,0,messagePreview}', 'null'::jsonb, 'hidden message cannot leak in inbox');
select extensions.is(public.list_inbox('encouragement')#>>'{items,0,taskTitle}', 'Owner task', 'readable historical task title remains available');
select extensions.is(public.list_inbox('connection')#>'{items,0,target}', 'null'::jsonb, 'stale acceptance has no private target');
select extensions.is((public.mark_all_inbox_read(current_setting('test.inbox_highwater')::bigint)->>'updatedCount')::integer, 1, 'mark-all is bounded by observed highwater');
select extensions.is((public.get_inbox_unread_count()->>'unreadCount')::integer, 1, 'newer direct notification stays unread');
select extensions.is((select count(*)::integer from public.notifications where notification_type='task_completed' and read_at is null), 1, 'mark-all does not touch completion event state');
select set_config('request.jwt.claim.sub', '', true);
select extensions.throws_ok($$select public.list_own_history()$$, 'P0001', 'UNAUTHENTICATED', 'missing session cannot query owner history');
reset role;

select * from extensions.finish();
rollback;
