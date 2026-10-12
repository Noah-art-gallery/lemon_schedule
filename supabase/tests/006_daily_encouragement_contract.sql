begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000', ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
'authenticated','authenticated','daily-'||n||'@example.test','',now(),'{"provider":"email"}',
jsonb_build_object('display_name','Person '||n,'time_zone',case when n=201 then 'Pacific/Kiritimati' else 'Pacific/Honolulu' end),now(),now()
from generate_series(201,204) n;
insert into public.connections(user_low_id,user_high_id) values
('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000202'),
('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000203');
select extensions.ok(not has_table_privilege('authenticated','public.daily_encouragements','insert,update,delete'),'daily writes require RPC');
select extensions.ok(not has_function_privilege('anon','public.upsert_daily_encouragement(uuid,date,text,text,bigint)','execute'),'anonymous cannot send daily encouragement');
select extensions.ok(not has_function_privilege('authenticated','private.daily_encouragement_json(public.daily_encouragements)','execute'),'private projection is not callable');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000201',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.create_task_schedule('Pending quote', public.get_owner_today(auth.uid()), null, 'none');
select set_config('test.daily_quote',(select id::text from public.task_occurrences where title_snapshot='Pending quote'),true);
select public.create_task_schedule('Old quote', public.get_owner_today(auth.uid())-1, null, 'none');
select set_config('test.old_quote',(select id::text from public.task_occurrences where title_snapshot='Old quote'),true);
select set_config('test.owner_day',public.get_owner_today(auth.uid())::text,true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000202',true);
select extensions.is(public.get_encouragement_day('00000000-0000-0000-0000-000000000201')->>'day',current_setting('test.owner_day'),'context uses recipient timezone');
select extensions.is((public.get_encouragement_day('00000000-0000-0000-0000-000000000201')->>'day')::date, public.get_owner_today(auth.uid())+1,'recipient day differs from sender day');
select extensions.throws_ok($$select public.upsert_daily_encouragement('00000000-0000-0000-0000-000000000201',current_setting('test.owner_day')::date-1,'clap')$$,'P0001','CONFLICT','stale midnight draft rejected');
select extensions.throws_ok($$select public.upsert_daily_encouragement('00000000-0000-0000-0000-000000000201',current_setting('test.owner_day')::date,null)$$,'P0001','INVALID_INPUT','sticker required');
select extensions.throws_ok($$select public.upsert_daily_encouragement('00000000-0000-0000-0000-000000000201',current_setting('test.owner_day')::date,'clap',repeat('x',121))$$,'P0001','INVALID_INPUT','long message rejected');
select extensions.throws_ok($$select public.upsert_daily_encouragement('00000000-0000-0000-0000-000000000201',current_setting('test.owner_day')::date,'clap',null,current_setting('test.old_quote')::bigint)$$,'P0001','INVALID_QUOTE','previous day quote rejected');
select set_config('test.daily_id',(public.upsert_daily_encouragement('00000000-0000-0000-0000-000000000201',current_setting('test.owner_day')::date,'clap','  Nice day  ',current_setting('test.daily_quote')::bigint)->>'id'),true);
select extensions.is(public.get_daily_encouragement(current_setting('test.daily_id')::bigint)->>'message','Nice day','whitespace normalized');
select extensions.is(public.get_daily_encouragement(current_setting('test.daily_id')::bigint)->'quote'->>'title','Pending quote','pending tasks can be quoted');
select extensions.is(public.upsert_daily_encouragement('00000000-0000-0000-0000-000000000201',current_setting('test.owner_day')::date,'heart','Changed')->>'id',current_setting('test.daily_id'),'editing uses same record');
select extensions.is((select count(*)::integer from public.daily_encouragements),1,'one record per pair and day');
select extensions.is(public.delete_daily_encouragement(current_setting('test.daily_id')::bigint),true,'author can cancel');
select extensions.throws_ok($$select public.get_daily_encouragement(current_setting('test.daily_id')::bigint)$$,'P0001','NOT_FOUND','cancelled content is unavailable');
select extensions.is(public.upsert_daily_encouragement('00000000-0000-0000-0000-000000000201',current_setting('test.owner_day')::date,'lemon')->>'id',current_setting('test.daily_id'),'resend restores original record');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',true);
select extensions.is((select count(*)::integer from public.daily_encouragements),0,'another connected friend cannot read private daily encouragement');
select extensions.throws_ok($$select public.get_daily_encouragement(current_setting('test.daily_id')::bigint)$$,'P0001','FORBIDDEN','other friend cannot read via RPC');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000204',true);
select extensions.is((select count(*)::integer from public.daily_encouragements),0,'stranger cannot read rows');
select extensions.throws_ok($$select public.get_encouragement_day('00000000-0000-0000-0000-000000000201')$$,'P0001','FORBIDDEN','stranger cannot load recipient day');
select extensions.throws_ok($$select public.upsert_daily_encouragement('00000000-0000-0000-0000-000000000201',current_setting('test.owner_day')::date,'clap')$$,'P0001','FORBIDDEN','stranger cannot send');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000201',true);
select extensions.is((select count(*)::integer from public.notifications where daily_encouragement_id=current_setting('test.daily_id')::bigint),1,'edit cancel resend creates one notification');
select extensions.is(public.list_inbox('encouragement')->'items'->0->>'target','/?dailyEncouragement='||current_setting('test.daily_id'),'inbox links exact daily record');
select extensions.throws_ok($$select public.delete_daily_encouragement(current_setting('test.daily_id')::bigint)$$,'P0001','FORBIDDEN','recipient cannot delete another author content');
select extensions.throws_ok($$select public.upsert_daily_encouragement(auth.uid(),current_setting('test.owner_day')::date,'clap')$$,'P0001','FORBIDDEN','self encouragement rejected');
select public.disconnect_friend('00000000-0000-0000-0000-000000000202');
select extensions.is(public.get_daily_encouragement(current_setting('test.daily_id')::bigint)->>'authorName','친구','recipient keeps history with disconnected name masked');
select extensions.is(public.get_daily_encouragement(current_setting('test.daily_id')::bigint)->>'authorAvatarKey','lemon','disconnected avatar masked');
select extensions.is(public.list_inbox('encouragement')->'items'->0->>'availability','available','received history remains accessible');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000202',true);
select extensions.is((select count(*)::integer from public.daily_encouragements),0,'disconnected sender loses shared read');
select extensions.throws_ok($$select public.get_daily_encouragement(current_setting('test.daily_id')::bigint)$$,'P0001','FORBIDDEN','disconnected sender cannot reopen');
select extensions.throws_ok($$select public.upsert_daily_encouragement('00000000-0000-0000-0000-000000000201',current_setting('test.owner_day')::date,'clap')$$,'P0001','FORBIDDEN','disconnected sender cannot update');
select extensions.is(public.delete_daily_encouragement(current_setting('test.daily_id')::bigint),true,'disconnected author may still cancel own content');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000201',true);
select extensions.is(public.list_inbox('encouragement')->'items'->0->>'availability','unavailable','cancelled notification has no content target');
select extensions.is(public.list_inbox('encouragement')->'items'->0->>'messagePreview',null::text,'cancelled preview cleared');
select * from extensions.finish();
rollback;
