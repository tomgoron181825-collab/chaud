-- Sondage de dates sur un plan : le créateur propose plusieurs dates, chacun coche celles où il est dispo,
-- puis le créateur choisit la date finale.
-- À coller dans Supabase > SQL Editor, puis « Run ». N'efface rien.

create table if not exists public.plan_date_options (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans on delete cascade,
  starts_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists plan_date_options_plan on public.plan_date_options (plan_id);

create table if not exists public.plan_date_votes (
  option_id uuid not null references public.plan_date_options on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);

alter table public.plan_date_options enable row level security;
alter table public.plan_date_votes enable row level security;

drop policy if exists date_options_select on public.plan_date_options;
drop policy if exists date_options_write on public.plan_date_options;
drop policy if exists date_votes_select on public.plan_date_votes;
drop policy if exists date_votes_insert on public.plan_date_votes;
drop policy if exists date_votes_delete on public.plan_date_votes;

-- Les dates : visibles par ceux qui voient le plan ; ajoutées ou retirées par le créateur du plan
create policy date_options_select on public.plan_date_options for select using (public.can_see_plan(plan_id));
create policy date_options_write on public.plan_date_options for all
  using (exists (select 1 from public.plans p where p.id = plan_id and p.created_by = auth.uid()))
  with check (exists (select 1 from public.plans p where p.id = plan_id and p.created_by = auth.uid()));

-- Les votes : visibles par ceux qui voient le plan ; chacun coche ou décoche pour lui-même
create policy date_votes_select on public.plan_date_votes for select
  using (exists (select 1 from public.plan_date_options o where o.id = option_id and public.can_see_plan(o.plan_id)));
create policy date_votes_insert on public.plan_date_votes for insert
  with check (user_id = auth.uid() and exists (select 1 from public.plan_date_options o where o.id = option_id and public.can_see_plan(o.plan_id)));
create policy date_votes_delete on public.plan_date_votes for delete using (user_id = auth.uid());

-- Mise à jour en direct dans l'app quand quelqu'un vote
do $$ begin
  alter publication supabase_realtime add table public.plan_date_options, public.plan_date_votes;
exception when others then null; end $$;
