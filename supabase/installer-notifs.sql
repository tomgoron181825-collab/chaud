-- Installation des notifications et des stats (fix-002 + fix-003 en un seul fichier).
-- À coller en entier dans Supabase > SQL Editor, puis « Run ». Sans risque si on le relance.

-- Notifications (seulement les utiles) et statistiques de base.
-- À coller une fois dans Supabase > SQL Editor, puis « Run ».

-- 1) Les téléphones abonnés aux notifications
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2) Anti-doublon : une notification n'est envoyée qu'une fois par événement.
--    Aucune règle d'accès : seule la fonction serveur peut la lire et l'écrire.
create table if not exists public.push_log (
  key text primary key,
  created_at timestamptz not null default now()
);
alter table public.push_log enable row level security;

-- 3) Statistiques : dernière visite et app installée sur l'écran d'accueil
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists installed boolean not null default false;

-- 4) Déclenchement : à chaque nouvel événement utile, la base prévient la fonction « notify »
create extension if not exists pg_net with schema extensions;

create or replace function public.push_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb := to_jsonb(new); k jsonb;
begin
  k := case tg_table_name
    when 'chaud_joins' then jsonb_build_object('chaud_id', r->>'chaud_id', 'user_id', r->>'user_id')
    when 'plan_guests' then jsonb_build_object('plan_id', r->>'plan_id', 'user_id', r->>'user_id')
    else jsonb_build_object('id', r->>'id')
  end;
  perform net.http_post(
    url := 'https://pnpggoyyuarqrpscuwgb.supabase.co/functions/v1/notify',
    body := jsonb_build_object('table', tg_table_name, 'keys', k),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- clé publique « anon » (la même que dans l'app), pas la clé secrète
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucGdnb3l5dWFycXJwc2N1d2diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MDk5NTQsImV4cCI6MjExMDA4NTk1NH0.llP8EFtOD0EPdYSxCGoOW8NR2Of4Zn_AvRVI_EgN99Q'
    )
  );
  return null;
exception when others then
  return null; -- une notification ratée ne doit jamais bloquer l'app
end $$;
revoke execute on function public.push_notify() from public, anon, authenticated;

drop trigger if exists push_plans on public.plans;
drop trigger if exists push_chauds on public.chauds;
drop trigger if exists push_chaud_joins on public.chaud_joins;
drop trigger if exists push_plan_guests on public.plan_guests;
create trigger push_plans after insert on public.plans for each row execute function public.push_notify();
create trigger push_chauds after insert on public.chauds for each row execute function public.push_notify();
create trigger push_chaud_joins after insert on public.chaud_joins for each row execute function public.push_notify();
create trigger push_plan_guests after insert on public.plan_guests for each row execute function public.push_notify();

-- Choix des notifications : les utiles sont activées par défaut, les autres au choix.
-- À coller une fois dans Supabase > SQL Editor, puis « Run » (après fix-002).

create table if not exists public.notif_prefs (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  plans boolean not null default true,      -- nouveau plan dans mes groupes
  chauds boolean not null default true,     -- un pote est chaud
  joins boolean not null default true,      -- « Moi aussi » sur mon chaud
  guests boolean not null default true,     -- invitation en +1
  responses boolean not null default false, -- quelqu'un répond à un plan que j'ai proposé
  messages boolean not null default false,  -- messages sur les plans où je vais
  photos boolean not null default false,    -- nouvelles photos d'une soirée où j'étais
  updated_at timestamptz not null default now()
);
alter table public.notif_prefs enable row level security;
drop policy if exists notif_prefs_own on public.notif_prefs;
create policy notif_prefs_own on public.notif_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- La base prévient aussi la fonction « notify » pour les réponses, messages et photos
create or replace function public.push_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb := to_jsonb(new); k jsonb;
begin
  k := case tg_table_name
    when 'chaud_joins' then jsonb_build_object('chaud_id', r->>'chaud_id', 'user_id', r->>'user_id')
    when 'plan_guests' then jsonb_build_object('plan_id', r->>'plan_id', 'user_id', r->>'user_id')
    when 'plan_responses' then jsonb_build_object('plan_id', r->>'plan_id', 'user_id', r->>'user_id', 'status', r->>'status')
    else jsonb_build_object('id', r->>'id')
  end;
  perform net.http_post(
    url := 'https://pnpggoyyuarqrpscuwgb.supabase.co/functions/v1/notify',
    body := jsonb_build_object('table', tg_table_name, 'keys', k),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- clé publique « anon » (la même que dans l'app), pas la clé secrète
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucGdnb3l5dWFycXJwc2N1d2diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MDk5NTQsImV4cCI6MjExMDA4NTk1NH0.llP8EFtOD0EPdYSxCGoOW8NR2Of4Zn_AvRVI_EgN99Q'
    )
  );
  return null;
exception when others then
  return null; -- une notification ratée ne doit jamais bloquer l'app
end $$;
revoke execute on function public.push_notify() from public, anon, authenticated;

drop trigger if exists push_plan_responses on public.plan_responses;
drop trigger if exists push_plan_comments on public.plan_comments;
drop trigger if exists push_photos on public.photos;
create trigger push_plan_responses after insert or update of status on public.plan_responses for each row execute function public.push_notify();
create trigger push_plan_comments after insert on public.plan_comments for each row execute function public.push_notify();
create trigger push_photos after insert on public.photos for each row execute function public.push_notify();
