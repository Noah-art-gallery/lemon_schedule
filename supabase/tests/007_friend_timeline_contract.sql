begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000', ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
'authenticated','authenticated','timeline-'||n||'@example.test','',now(),'{"provider":"email"}',
jsonb_build_object('display_name','Timeline '||n,'time_zone',case when n=301 then 'Asia/Seoul' else 'Pacific/Honolulu' end),now(),now()
from generate_series(301,303) n;
insert into public.connections(user_low_id,user_high_id) values
('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000302');
select extensions.ok(not has_function_privilege('anon','public.list_friend_timeline(uuid,timestamptz,text,bigint,integer)','execute'),'anonymous cannot read timeline');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000302',true);
select public.create_task_schedule('Timeline task',public.get_owner_today(auth.uid()),null,'daily');
select set_config('test.timeline_task',(select id::text from public.tasks where title='Timeline task'),true);
select set_config('test.timeline_occurrence',(select id::text from public.task_occurrences where title_snapshot='Timeline task' order by occurrence_date limit 1),true);
select public.complete_occurrence(current_setting('test.timeline_occurrence')::bigint);
reset role;
-- Equal timestamps exercise the kind tie-breaker without relying on wall-clock timing.
update public.tasks set created_at='2026-10-24T08:00:00.123456Z' where id=current_setting('test.timeline_task')::bigint;
update public.task_occurrences set first_completed_at='2026-10-24T08:00:00.123456Z' where id=current_setting('test.timeline_occurrence')::bigint;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',true);
select extensions.is(jsonb_array_length(public.list_friend_timeline()->'items'),2,'one original registration and one completion; generated repeats are not registrations');
select extensions.is(public.list_friend_timeline()->>'viewerTimeZone','Asia/Seoul','viewer timezone is the current account timezone');
select extensions.is(public.list_friend_timeline()->'items'->0->>'kind','completed','completion wins equal timestamp ordering');
select extensions.ok(not ((public.list_friend_timeline()->'items'->0->'owner') ?| array['email','timeZone','drawingPath','deviceToken']),'owner projection excludes private fields');
select set_config('test.timeline_cursor',(public.list_friend_timeline(page_limit=>1)->'nextCursor')::text,true);
select extensions.is(public.list_friend_timeline(cursor_occurred_at=>(current_setting('test.timeline_cursor')::jsonb->>'occurredAt')::timestamptz,cursor_kind=>'completed',cursor_event_id=>current_setting('test.timeline_occurrence')::bigint,page_limit=>1)->'items'->0->>'kind','created','cursor does not skip registration at equal timestamp');
select extensions.throws_ok($$select public.list_friend_timeline(cursor_kind=>'created')$$,'P0001','INVALID_INPUT','partial cursor rejected');
select extensions.throws_ok($$select public.list_friend_timeline(target_friend_id=>'00000000-0000-0000-0000-000000000303')$$,'P0001','FORBIDDEN','nonfriend filter rejected');
select public.upsert_daily_encouragement('00000000-0000-0000-0000-000000000302',public.get_owner_today('00000000-0000-0000-0000-000000000302'),'clap');
select extensions.is(public.list_friend_timeline()->'items'->0->>'cheeredToday','true','today cheer is shared by timeline rows');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000302',true);
select extensions.is(jsonb_array_length(public.list_friend_timeline()->'items'),0,'own activity is not in friend timeline');
select public.reopen_occurrence(current_setting('test.timeline_occurrence')::bigint);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',true);
select extensions.is(jsonb_array_length(public.list_friend_timeline()->'items'),1,'undo hides completion');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000302',true);
select public.complete_occurrence(current_setting('test.timeline_occurrence')::bigint);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',true);
select extensions.is(public.list_friend_timeline()->'items'->0->>'occurredAt',current_setting('test.timeline_cursor')::jsonb->>'occurredAt','redo preserves first completion time');
select public.disconnect_friend('00000000-0000-0000-0000-000000000302');
select extensions.is(jsonb_array_length(public.list_friend_timeline()->'items'),0,'disconnect removes all history from timeline');
select extensions.throws_ok($$select public.list_friend_timeline(target_friend_id=>'00000000-0000-0000-0000-000000000302')$$,'P0001','FORBIDDEN','disconnected explicit filter rejected');
select * from extensions.finish();
rollback;
