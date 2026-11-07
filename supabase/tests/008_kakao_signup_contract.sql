begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(10);

insert into auth.users (id, raw_app_meta_data, raw_user_meta_data)
values ('ca000000-0000-0000-0000-000000000001', '{"provider":"kakao"}', '{"name":"카카오 레몬"}'),
       ('ca000000-0000-0000-0000-000000000002', '{"provider":"kakao"}', '{}'),
       ('ca000000-0000-0000-0000-000000000003', '{"provider":"kakao"}', jsonb_build_object('name', repeat('가', 80)));
select extensions.is((select display_name from public.profiles where id = 'ca000000-0000-0000-0000-000000000001'), '카카오 레몬', 'Kakao nickname initializes the profile without email');
select extensions.is((select time_zone from public.profile_private where user_id = 'ca000000-0000-0000-0000-000000000001'), 'Asia/Seoul', 'Kakao starts in the documented Seoul time zone');
select extensions.is((select count(*)::integer from public.pets where user_id = 'ca000000-0000-0000-0000-000000000001'), 1, 'first signup creates one private pet');
select extensions.is((select display_name from public.profiles where id = 'ca000000-0000-0000-0000-000000000002'), '레몬 친구', 'missing nickname has a non-email fallback');
select extensions.is((select char_length(display_name) from public.profiles where id = 'ca000000-0000-0000-0000-000000000003'), 40, 'long provider nickname is bounded');
select extensions.throws_ok($$insert into auth.users (id, raw_app_meta_data, raw_user_meta_data) values ('ca000000-0000-0000-0000-000000000004', '{"provider":"email"}', '{"provider":"kakao","name":"Spoofed"}')$$, 'P0001', 'INVALID_DISPLAY_NAME', 'user metadata cannot select the Kakao signup path');
select extensions.throws_ok($$insert into auth.users (id, raw_app_meta_data, raw_user_meta_data) values ('ca000000-0000-0000-0000-000000000004', '{"provider":"email"}', '{"display_name":"Email"}')$$, 'P0001', 'INVALID_TIME_ZONE', 'email signup still requires an explicit zone');
update auth.users set raw_user_meta_data = '{"name":"Changed provider name"}' where id = 'ca000000-0000-0000-0000-000000000001';
select extensions.is((select display_name from public.profiles where id = 'ca000000-0000-0000-0000-000000000001'), '카카오 레몬', 'later provider changes do not reset the profile');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ca000000-0000-0000-0000-000000000002', true);
select extensions.is((select count(*)::integer from public.profile_private where user_id = 'ca000000-0000-0000-0000-000000000001'), 0, 'unrelated Kakao user cannot read another private profile');
select extensions.ok(not has_function_privilege('authenticated', 'private.handle_new_user()', 'execute'), 'clients cannot call the signup trigger');
select * from extensions.finish();
rollback;
