-- Photo de profil, lien « Inviter un pote » et jeu de la semaine « Qui de nous ? ».
-- À coller dans Supabase > SQL Editor, puis « Run ». Sans danger : n'efface rien.

-- 1. Photo de profil (dossier public « avatars », chacun ne touche qu'à son dossier)
alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_upload on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_remove on storage.objects;
create policy avatars_upload on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_remove on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 2. Lien d'invitation : celui qui s'inscrit avec le lien d'un pote devient directement son ami
create or replace function public.accept_invite(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare other uuid;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  select id into other from profiles where friend_code = upper(trim(code));
  if other is null or other = auth.uid() then return null; end if;
  delete from friendships where (requester = other and addressee = auth.uid()) or (requester = auth.uid() and addressee = other);
  insert into friendships (requester, addressee, status) values (other, auth.uid(), 'accepted');
  return other;
end $$;
revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

-- 3. Jeu de la semaine « Qui de nous ? » : chacun vote pour un membre du groupe.
-- Les votes restent secrets : on ne voit que le total par personne.
create table if not exists public.game_votes (
  group_id uuid not null references public.groups(id) on delete cascade,
  week date not null,
  voter uuid not null references auth.users(id) on delete cascade,
  target uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, week, voter)
);
alter table public.game_votes enable row level security;
-- Pas de policy : on passe par les deux fonctions ci-dessous.

create or replace function public.game_vote(g uuid, wk date, t uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(g) then raise exception 'Pas dans ce groupe'; end if;
  if not exists (select 1 from group_members where group_id = g and user_id = t) then raise exception 'Pas dans ce groupe'; end if;
  if wk not between current_date - 8 and current_date + 1 then raise exception 'Semaine terminée'; end if;
  insert into game_votes (group_id, week, voter, target) values (g, wk, auth.uid(), t)
  on conflict (group_id, week, voter) do update set target = excluded.target, created_at = now();
end $$;

create or replace function public.game_results(g uuid, wk date) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(g) then raise exception 'Pas dans ce groupe'; end if;
  return json_build_object(
    'mine', (select target from game_votes where group_id = g and week = wk and voter = auth.uid()),
    'voters', (select count(*) from game_votes where group_id = g and week = wk),
    'counts', coalesce((select json_object_agg(target, n) from (select target, count(*) n from game_votes where group_id = g and week = wk group by target) x), '{}'::json)
  );
end $$;
revoke execute on function public.game_vote(uuid, date, uuid) from public, anon;
revoke execute on function public.game_results(uuid, date) from public, anon;
grant execute on function public.game_vote(uuid, date, uuid) to authenticated;
grant execute on function public.game_results(uuid, date) to authenticated;
