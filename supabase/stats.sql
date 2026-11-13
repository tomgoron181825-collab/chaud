-- Statistiques de Chaud : à coller dans Supabase > SQL Editor, puis « Run ».
-- Astuce : enregistre-la avec « Save » pour la relancer en un clic.
select
  (select count(*) from public.profiles) as inscrits,
  (select count(*) from public.profiles where installed) as ont_installe_l_app,
  (select count(*) from public.profiles where last_seen_at > now() - interval '1 day') as actifs_24h,
  (select count(*) from public.profiles where last_seen_at > now() - interval '7 days') as actifs_7_jours,
  (select count(*) from public.profiles where last_seen_at > now() - interval '30 days') as actifs_30_jours,
  (select count(*) from public.profiles where created_at > now() - interval '7 days') as nouveaux_7_jours,
  (select count(distinct user_id) from public.push_subscriptions) as notifs_activees,
  (select count(*) from public.groups) as groupes,
  (select count(*) from public.plans) as plans,
  (select count(*) from public.chauds) as chauds,
  (select count(*) from public.photos) as photos;
