-- Ajouter un de ses amis directement dans un de ses groupes.
-- À coller dans Supabase > SQL Editor, puis « Run ». N'efface rien.
create or replace function public.add_friend_to_group(g uuid, friend uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(g) then raise exception 'Pas dans ce groupe'; end if;
  if not exists (
    select 1 from friendships where status = 'accepted'
      and ((requester = auth.uid() and addressee = friend) or (requester = friend and addressee = auth.uid()))
  ) then raise exception 'Vous n''êtes pas amis'; end if;
  insert into group_members (group_id, user_id) values (g, friend) on conflict do nothing;
end $$;
revoke execute on function public.add_friend_to_group(uuid, uuid) from public, anon;
grant execute on function public.add_friend_to_group(uuid, uuid) to authenticated;
