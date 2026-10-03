drop policy if exists profiles_select_owner_or_friend on public.profiles;

create policy profiles_select_owner_friend_or_pending_participant
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or private.are_connected((select auth.uid()), id)
  or exists (
    select 1
    from public.connection_requests as request
    where request.status = 'pending'
      and (select auth.uid()) in (request.requester_id, request.addressee_id)
      and profiles.id in (request.requester_id, request.addressee_id)
  )
);

drop policy if exists encouragements_select_visible_participant on public.encouragements;

create policy encouragements_select_visible_participant
on public.encouragements for select to authenticated
using (
  visibility <> 'deleted_by_author'
  and (
    owner_id = (select auth.uid())
    or (
      private.may_encourage(occurrence_id, owner_id)
      and (visibility = 'visible' or author_id = (select auth.uid()))
    )
  )
);
