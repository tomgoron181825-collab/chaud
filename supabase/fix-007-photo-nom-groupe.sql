-- Photo du groupe (les admins du groupe, dont le créateur, peuvent la changer, ainsi que le nom).
-- À coller dans Supabase > SQL Editor, puis « Run ». N'efface rien.
alter table public.groups add column if not exists avatar_url text;
