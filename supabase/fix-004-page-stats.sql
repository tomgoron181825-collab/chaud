-- Page « Stats » dans l'app, visible seulement par les admins (toi).
-- À coller dans Supabase > SQL Editor, puis « Run ». À lancer après installer-notifs.sql.
-- Dernière ligne : remplace TON_EMAIL par l'email de ton compte Chaud.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;
-- Pas de policy : personne ne peut lire ou modifier cette table depuis l'app.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
$$;

create or replace function public.admin_stats() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux admins';
  end if;
  return json_build_object(
    'inscrits', (select count(*) from profiles),
    'nouveaux_24h', (select count(*) from profiles where created_at > now() - interval '1 day'),
    'nouveaux_7j', (select count(*) from profiles where created_at > now() - interval '7 days'),
    'installes', (select count(*) from profiles where installed),
    'actifs_24h', (select count(*) from profiles where last_seen_at > now() - interval '1 day'),
    'actifs_7j', (select count(*) from profiles where last_seen_at > now() - interval '7 days'),
    'actifs_30j', (select count(*) from profiles where last_seen_at > now() - interval '30 days'),
    'notifs', (select count(distinct user_id) from push_subscriptions),
    'groupes', (select count(*) from groups),
    'plans', (select count(*) from plans),
    'chauds', (select count(*) from chauds),
    'photos', (select count(*) from photos),
    'a', now()
  );
end $$;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_stats() to authenticated;

-- Te déclarer admin (remplace TON_EMAIL, garde les guillemets simples)
insert into public.app_admins (user_id)
select id from auth.users where email = 'TON_EMAIL'
on conflict do nothing;
