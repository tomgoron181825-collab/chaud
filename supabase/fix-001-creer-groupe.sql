-- Correctif : créer un groupe affichait « new row violates row-level security policy ».
-- Le créateur doit pouvoir voir son groupe tout de suite, avant que son inscription comme membre soit visible.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select using (created_by = auth.uid() or public.is_member(id));
