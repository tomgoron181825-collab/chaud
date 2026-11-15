-- Nom et photo du groupe : n'importe quel membre peut les changer.
-- À coller dans Supabase > SQL Editor, puis « Run ». N'efface rien.
alter table public.groups add column if not exists avatar_url text;

-- Un membre ne peut changer que le nom et la photo (pas le code d'invitation ni le reste)
create or replace function public.update_group(g uuid, new_name text, new_avatar text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(g) then raise exception 'Pas dans ce groupe'; end if;
  if char_length(trim(new_name)) not between 1 and 40 then raise exception 'Nom de groupe invalide'; end if;
  if new_avatar is not null and new_avatar !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/' then raise exception 'Photo invalide'; end if;
  update groups set name = trim(new_name), avatar_url = new_avatar where id = g;
end $$;
revoke execute on function public.update_group(uuid, text, text) from public, anon;
grant execute on function public.update_group(uuid, text, text) to authenticated;
