alter table public.notes
add column if not exists source_kind text not null default 'manual'
    check (source_kind in ('manual', 'docs-sync')),
add column if not exists is_readonly boolean not null default false,
add column if not exists source_env_label text,
add column if not exists source_repo_root text,
add column if not exists source_worktree_path text,
add column if not exists source_relative_path text,
add column if not exists source_hash text,
add column if not exists synced_at timestamptz;

create index if not exists notes_source_kind_status_updated_at_idx
on public.notes (source_kind, status, updated_at desc);

create unique index if not exists notes_docs_sync_source_idx
on public.notes (
    source_kind,
    source_env_label,
    source_repo_root,
    source_worktree_path,
    source_relative_path
);
