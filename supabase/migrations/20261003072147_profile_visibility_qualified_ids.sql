-- Keep the outer profile UUID distinct from the request's bigint identity.
drop policy if exists profiles_select_owner_friend_or_pending_participant on public.profiles;

create policy profiles_select_owner_friend_or_pending_participant
on public.profiles for select to authenticated
using (
  profiles.id = (select auth.uid())
  or private.are_connected((select auth.uid()), profiles.id)
  or exists (
    select 1
    from public.connection_requests as request
    where request.status = 'pending'
      and (select auth.uid()) in (request.requester_id, request.addressee_id)
      and profiles.id in (request.requester_id, request.addressee_id)
  )
);
