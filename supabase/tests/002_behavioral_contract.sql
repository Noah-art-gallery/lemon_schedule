begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(49);

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

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select extensions.throws_ok(
  $$update public.profile_private set time_zone = 'Not/AZone'$$,
  '23514',
  'INVALID_TIME_ZONE',
  'profile time zone must be an IANA identifier'
);

select extensions.lives_ok(
  $$insert into public.tasks (owner_id, title, due_date) values ('00000000-0000-0000-0000-000000000001', 'Owner task', current_date)$$,
  'owner can create a task'
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

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.lives_ok(
  $$select public.request_connection('LEMONB0001')$$,
  'owner can request a connection by invite code'
);
select extensions.is(
  public.request_connection('LEMONB0001'),
  (select id from public.connection_requests where status = 'pending'),
  'duplicate pending request returns the original request'
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
select extensions.lives_ok(
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
select extensions.lives_ok(
  $$insert into public.task_occurrences (task_id, owner_id, occurrence_date, title_snapshot, recurrence_snapshot)
    select id, owner_id, due_date, title, recurrence from public.tasks where title = 'Owner task'$$,
  'owner can create a pending occurrence'
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

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select count(*)::integer from public.encouragements),
  1,
  'task owner retains historic encouragement after disconnect'
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
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select extensions.lives_ok(
  $$select public.block_user('00000000-0000-0000-0000-000000000002')$$,
  'owner can block the former friend'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select extensions.throws_ok(
  $$select public.request_connection('LEMONA0001')$$,
  'P0001',
  'CONNECTION_BLOCKED',
  'block prevents a new request in either direction'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
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
