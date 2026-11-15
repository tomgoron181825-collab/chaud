-- Voir la conso de ses amis (pas seulement des membres de ses groupes).
-- Chacun choisit s'il la partage avec ses amis (désactivé par défaut).
-- À coller dans Supabase > SQL Editor, puis « Run ». N'efface rien.

alter table public.profiles add column if not exists share_conso_friends boolean not null default false;

create or replace function public.sees_conso_of(other uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    where a.user_id = other and a.share_conso and b.user_id = auth.uid()
  ) or exists (
    select 1 from friendships f join profiles p on p.id = other
    where p.share_conso_friends and f.status = 'accepted'
      and ((f.requester = other and f.addressee = auth.uid()) or (f.addressee = other and f.requester = auth.uid()))
  );
$$;
