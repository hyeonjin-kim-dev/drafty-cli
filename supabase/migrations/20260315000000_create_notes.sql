create extension if not exists pgcrypto;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  cli_tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists notes_user_id_created_at_idx on public.notes (user_id, created_at desc);

create or replace function public.set_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
before update on public.notes
for each row
execute function public.set_notes_updated_at();

alter table public.notes enable row level security;

drop policy if exists notes_select_own on public.notes;
create policy notes_select_own
on public.notes
for select
using (auth.uid() = user_id);

drop policy if exists notes_insert_own on public.notes;
create policy notes_insert_own
on public.notes
for insert
with check (auth.uid() = user_id);

drop policy if exists notes_update_own on public.notes;
create policy notes_update_own
on public.notes
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists notes_delete_own on public.notes;
create policy notes_delete_own
on public.notes
for delete
using (auth.uid() = user_id);

grant select, insert, update, delete on public.notes to authenticated;
