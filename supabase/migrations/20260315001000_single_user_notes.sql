drop policy if exists notes_select_own on public.notes;
drop policy if exists notes_insert_own on public.notes;
drop policy if exists notes_update_own on public.notes;
drop policy if exists notes_delete_own on public.notes;

drop index if exists public.notes_user_id_created_at_idx;
create index if not exists notes_created_at_idx on public.notes (created_at desc);

alter table public.notes disable row level security;
alter table public.notes drop constraint if exists notes_user_id_fkey;
alter table public.notes drop column if exists user_id;

grant usage on schema public to anon;
revoke all on public.notes from anon;
grant select, insert, update on public.notes to anon;
