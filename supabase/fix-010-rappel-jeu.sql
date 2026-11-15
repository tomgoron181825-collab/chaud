-- Rappel du jeu de la semaine : une notif à 9 h (heure de Paris), seulement à ceux qui n'ont pas encore voté.
-- À coller dans Supabase > SQL Editor, puis « Run ». N'efface rien.
-- Il faut aussi remettre à jour la fonction « notify » (Edge Functions) avec le nouveau code.

-- Réglage : chacun peut couper ce rappel dans « Mon profil » (activé par défaut)
alter table public.notif_prefs add column if not exists game boolean not null default true;

-- Tâche planifiée : la base appelle la fonction à 7 h et 8 h UTC ; la fonction n'envoie qu'à 9 h heure de Paris
-- (été comme hiver) et une seule fois par jour.
create extension if not exists pg_cron;
do $$ begin
  perform cron.unschedule('chaud-jeu-9h');
exception when others then null; end $$;
select cron.schedule('chaud-jeu-9h', '0 7,8 * * *', $job$
  select net.http_post(
    url := 'https://pnpggoyyuarqrpscuwgb.supabase.co/functions/v1/notify',
    body := '{"table": "game", "keys": {}}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucGdnb3l5dWFycXJwc2N1d2diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MDk5NTQsImV4cCI6MjExMDA4NTk1NH0.llP8EFtOD0EPdYSxCGoOW8NR2Of4Zn_AvRVI_EgN99Q')
  );
$job$);
