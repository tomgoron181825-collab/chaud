-- =====================================================================
-- Base de données de l'app de groupes d'amis (Supabase / Postgres)
-- À coller une seule fois dans Supabase : SQL Editor > New query > Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Profils ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  pseudo text not null check (char_length(pseudo) between 1 and 30),
  color text not null default '#FF5A1F',
  birth_date date not null,
  created_at timestamptz not null default now(),
  constraint adulte check (birth_date <= (current_date - interval '18 years'))
);

-- ---------- Groupes ----------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#7B5CFF',
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  share_conso boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ---------- Plans ----------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  type text not null default 'soiree' check (type in ('soiree', 'resto', 'autre')),
  title text not null check (char_length(title) between 1 and 80),
  starts_at timestamptz,
  place text not null default '',
  description text not null default '',
  bring_enabled boolean not null default false,
  from_chaud uuid,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on public.plans (group_id, starts_at);

create table public.plan_responses (
  plan_id uuid not null references public.plans on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  status text not null check (status in ('go', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

create table public.plan_comments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

-- ---------- Trajets et SAM ----------
create table public.rides (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans on delete cascade,
  driver_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  seats int not null default 4 check (seats between 2 and 9),
  departure text not null default '',
  created_at timestamptz not null default now(),
  unique (plan_id, driver_id)
);

create table public.ride_passengers (
  ride_id uuid not null references public.rides on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  primary key (ride_id, user_id)
);

create table public.ride_needs (
  plan_id uuid not null references public.plans on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  primary key (plan_id, user_id)
);

-- ---------- Qui ramène quoi ----------
create table public.bring_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  taken_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Dépenses ----------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans on delete cascade,
  paid_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0 and amount < 100000),
  label text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- Photos ----------
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  path text not null unique,
  created_at timestamptz not null default now()
);

-- ---------- Chaud (envies express pour aujourd'hui ou demain) ----------
create table public.chauds (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  what text not null check (char_length(what) between 1 and 60),
  day date not null,
  detail text not null default '',
  plan_id uuid references public.plans on delete set null,
  created_at timestamptz not null default now(),
  constraint jour_proche check (day between (now() at time zone 'Europe/Paris')::date and (now() at time zone 'Europe/Paris')::date + 1)
);

create table public.chaud_joins (
  chaud_id uuid not null references public.chauds on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  primary key (chaud_id, user_id)
);

alter table public.plans add constraint plans_from_chaud_fk
  foreign key (from_chaud) references public.chauds on delete set null;

-- ---------- Conso (privée par défaut) ----------
create table public.drink_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('biere', 'vin', 'cocktail', 'shot', 'soft', 'eau')),
  cl numeric(5, 1) not null check (cl > 0 and cl <= 200),
  deg numeric(4, 1) not null check (deg >= 0 and deg <= 80),
  created_at timestamptz not null default now()
);

create table public.drinks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('biere', 'vin', 'cocktail', 'shot', 'soft', 'eau')),
  name text not null,
  units numeric(4, 1) not null default 0 check (units >= 0 and units <= 20),
  drunk_at timestamptz not null default now()
);
create index on public.drinks (user_id, drunk_at);

-- =====================================================================
-- Fonctions utilitaires (security definer = contournent les règles,
-- utilisées seulement pour vérifier l'appartenance à un groupe)
-- =====================================================================

create function public.is_member(g uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_members where group_id = g and user_id = auth.uid());
$$;

create function public.is_admin(g uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_members where group_id = g and user_id = auth.uid() and role = 'admin');
$$;

create function public.plan_group(p uuid) returns uuid
language sql security definer stable set search_path = public as $$
  select group_id from plans where id = p;
$$;

create function public.ride_plan(r uuid) returns uuid
language sql security definer stable set search_path = public as $$
  select plan_id from rides where id = r;
$$;

create function public.chaud_group(c uuid) returns uuid
language sql security definer stable set search_path = public as $$
  select group_id from chauds where id = c;
$$;

create function public.shares_group(other uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

create function public.sees_conso_of(other uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    where a.user_id = other and a.share_conso and b.user_id = auth.uid()
  );
$$;

-- Le créateur d'un groupe en devient admin
create function public.on_group_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into group_members (group_id, user_id, role) values (new.id, new.created_by, 'admin');
  return new;
end $$;
create trigger group_created after insert on public.groups
  for each row execute function public.on_group_created();

-- Rejoindre un groupe avec son code d'invitation
create function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  select id into g from groups where invite_code = upper(trim(code));
  if g is null then raise exception 'Code inconnu'; end if;
  insert into group_members (group_id, user_id) values (g, auth.uid()) on conflict do nothing;
  return g;
end $$;

-- Supprimer son compte (obligatoire pour les stores)
create function public.delete_me() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.users where id = auth.uid();
end $$;

-- Un « chaud » devient un plan dès 3 personnes (auteur compris).
-- Il reste visible pour les autres, et ceux qui le rejoignent ensuite
-- sont ajoutés au plan.
create function public.sync_chaud() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c chauds;
  n int;
  pid uuid;
begin
  select * into c from chauds where id = coalesce(new.chaud_id, old.chaud_id);
  if c.id is null then return null; end if;
  select count(*) + 1 into n from chaud_joins where chaud_id = c.id;

  if c.plan_id is null and n >= 3 then
    insert into plans (group_id, type, title, starts_at, place, description, created_by, from_chaud)
    values (c.group_id, 'autre', upper(left(c.what, 1)) || substr(c.what, 2),
            (c.day + time '20:00') at time zone 'Europe/Paris',
            c.detail, 'Né d''un « chaud ».', c.user_id, c.id)
    returning id into pid;
    update chauds set plan_id = pid where id = c.id;
    insert into plan_responses (plan_id, user_id, status)
      select pid, c.user_id, 'go'
      union select pid, user_id, 'go' from chaud_joins where chaud_id = c.id
      on conflict do nothing;
  elsif c.plan_id is not null then
    if tg_op = 'INSERT' then
      insert into plan_responses (plan_id, user_id, status) values (c.plan_id, new.user_id, 'go')
        on conflict (plan_id, user_id) do update set status = 'go', updated_at = now();
    elsif tg_op = 'DELETE' then
      delete from plan_responses where plan_id = c.plan_id and user_id = old.user_id;
    end if;
  end if;
  return null;
end $$;
create trigger chaud_join_changed after insert or delete on public.chaud_joins
  for each row execute function public.sync_chaud();

-- =====================================================================
-- Règles d'accès (Row Level Security)
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.plans enable row level security;
alter table public.plan_responses enable row level security;
alter table public.plan_comments enable row level security;
alter table public.rides enable row level security;
alter table public.ride_passengers enable row level security;
alter table public.ride_needs enable row level security;
alter table public.bring_items enable row level security;
alter table public.expenses enable row level security;
alter table public.photos enable row level security;
alter table public.chauds enable row level security;
alter table public.chaud_joins enable row level security;
alter table public.drink_presets enable row level security;
alter table public.drinks enable row level security;

-- Profils : je vois le mien et ceux des membres de mes groupes
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.shares_group(id));
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Groupes
create policy groups_select on public.groups for select using (public.is_member(id));
create policy groups_insert on public.groups for insert with check (created_by = auth.uid());
create policy groups_update on public.groups for update using (public.is_admin(id));
create policy groups_delete on public.groups for delete using (public.is_admin(id));

-- Membres : on voit les membres de ses groupes ; on règle son partage ; on peut partir ; l'admin peut retirer
create policy members_select on public.group_members for select using (public.is_member(group_id));
create policy members_update on public.group_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy members_delete on public.group_members for delete using (user_id = auth.uid() or public.is_admin(group_id));

-- Plans
create policy plans_select on public.plans for select using (public.is_member(group_id));
create policy plans_insert on public.plans for insert with check (public.is_member(group_id) and created_by = auth.uid());
create policy plans_update on public.plans for update using (created_by = auth.uid());
create policy plans_delete on public.plans for delete using (created_by = auth.uid() or public.is_admin(group_id));

-- Réponses, commentaires, besoins de trajet, dépenses, photos : lecture par le groupe, écriture pour soi
create policy responses_select on public.plan_responses for select using (public.is_member(public.plan_group(plan_id)));
create policy responses_write on public.plan_responses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(public.plan_group(plan_id)));

create policy comments_select on public.plan_comments for select using (public.is_member(public.plan_group(plan_id)));
create policy comments_insert on public.plan_comments for insert with check (user_id = auth.uid() and public.is_member(public.plan_group(plan_id)));
create policy comments_delete on public.plan_comments for delete using (user_id = auth.uid());

create policy rides_select on public.rides for select using (public.is_member(public.plan_group(plan_id)));
create policy rides_write on public.rides for all
  using (driver_id = auth.uid()) with check (driver_id = auth.uid() and public.is_member(public.plan_group(plan_id)));

create policy passengers_select on public.ride_passengers for select using (public.is_member(public.plan_group(public.ride_plan(ride_id))));
create policy passengers_write on public.ride_passengers for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(public.plan_group(public.ride_plan(ride_id))));

create policy needs_select on public.ride_needs for select using (public.is_member(public.plan_group(plan_id)));
create policy needs_write on public.ride_needs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(public.plan_group(plan_id)));

create policy bring_select on public.bring_items for select using (public.is_member(public.plan_group(plan_id)));
create policy bring_insert on public.bring_items for insert with check (public.is_member(public.plan_group(plan_id)));
create policy bring_update on public.bring_items for update
  using (public.is_member(public.plan_group(plan_id)))
  with check (taken_by is null or taken_by = auth.uid());
create policy bring_delete on public.bring_items for delete using (public.is_member(public.plan_group(plan_id)));

create policy expenses_select on public.expenses for select using (public.is_member(public.plan_group(plan_id)));
create policy expenses_insert on public.expenses for insert with check (paid_by = auth.uid() and public.is_member(public.plan_group(plan_id)));
create policy expenses_delete on public.expenses for delete using (paid_by = auth.uid());

create policy photos_select on public.photos for select using (public.is_member(public.plan_group(plan_id)));
create policy photos_insert on public.photos for insert with check (user_id = auth.uid() and public.is_member(public.plan_group(plan_id)));
create policy photos_delete on public.photos for delete using (user_id = auth.uid());

-- Chaud : visible par le groupe jusqu'à la fin du jour prévu
create policy chauds_select on public.chauds for select
  using (public.is_member(group_id) and day >= (now() at time zone 'Europe/Paris')::date);
create policy chauds_insert on public.chauds for insert with check (user_id = auth.uid() and public.is_member(group_id));
create policy chauds_delete on public.chauds for delete using (user_id = auth.uid());

create policy joins_select on public.chaud_joins for select using (public.is_member(public.chaud_group(chaud_id)));
create policy joins_write on public.chaud_joins for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(public.chaud_group(chaud_id)));

-- Conso : mes verres habituels sont à moi seul ; ma conso est visible
-- seulement par les groupes où j'ai activé le partage
create policy presets_all on public.drink_presets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy drinks_select on public.drinks for select using (user_id = auth.uid() or public.sees_conso_of(user_id));
create policy drinks_insert on public.drinks for insert with check (user_id = auth.uid());
create policy drinks_delete on public.drinks for delete using (user_id = auth.uid());

-- =====================================================================
-- Stockage des photos (dossier = id du groupe)
-- =====================================================================
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;

create policy photos_read on storage.objects for select
  using (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy photos_upload on storage.objects for insert
  with check (bucket_id = 'photos' and owner = auth.uid() and public.is_member(((storage.foldername(name))[1])::uuid));
create policy photos_remove on storage.objects for delete
  using (bucket_id = 'photos' and owner = auth.uid());

-- =====================================================================
-- Mises à jour en direct
-- =====================================================================
alter publication supabase_realtime add table
  public.plans, public.plan_responses, public.plan_comments, public.rides, public.ride_passengers,
  public.ride_needs, public.bring_items, public.expenses, public.photos, public.chauds,
  public.chaud_joins, public.group_members;
