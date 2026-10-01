begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(100);

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
end;

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
  'authenticated users cannot create a second pet row'
);
select extensions.throws_ok(
  $$delete from public.pets where user_id = auth.uid()$$,
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
  'task title cannot exceed 80 stored characters'
);
select extensions.throws_ok(
  $$select public.create_task_schedule(repeat(' ', 80), current_date, null, 'none')$$,
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

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
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
  'blocked task mutation is safely filtered by RLS'
);
select extensions.throws_ok(
  $$select public.upsert_encouragement((select id from public.task_occurrences limit 1), 'heart', '보이면 안 돼')$$,
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
  $$select public.upsert_encouragement(1, 'heart', '삭제된 할 일')$$,
  'connected user cannot encourage a logically deleted task'
);
select extensions.lives_ok(
  $$select public.delete_encouragement(1)$$,
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

select * from extensions.finish();
rollback;
