import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../types/database.types.js';
import { DraftyError, wrapSupabaseError } from './errors.js';

const DOCS_SYNC_SOURCE_KIND = 'docs-sync';
const ACTIVE_NOTE_STATUS = 'active';
const ARCHIVED_NOTE_STATUS = 'archived';

interface DocsFileSnapshot {
    body: string;
    source_hash: string;
    source_relative_path: string;
    source_worktree_path: string;
}

interface ExistingDocsSyncNote {
    cli_tags: string[];
    id: string;
    source_hash: string | null;
    source_relative_path: string | null;
    source_worktree_path: string | null;
    status: string;
}

export interface SyncDocsOptions {
    dryRun?: boolean;
    envLabel?: string;
}

export interface SyncDocsResult {
    archivedCount: number;
    createdCount: number;
    dryRun: boolean;
    envLabel: string;
    syncRoot: string;
    scannedCount: number;
    unchangedCount: number;
    updatedCount: number;
}

export async function syncDocsNotes(
    supabase: SupabaseClient<Database>,
    options: SyncDocsOptions = {},
): Promise<SyncDocsResult> {
    const envLabel = resolveEnvironmentLabel(options.envLabel);
    const syncRoot = resolveSyncRoot();
    const docsFiles = await discoverMarkdownFiles(syncRoot);
    const existingNotes = await listExistingDocsSyncNotes(
        supabase,
        envLabel,
        syncRoot,
    );
    const existingByKey = new Map(
        existingNotes.map((note) => [
            buildSourceKey(
                note.source_worktree_path ?? '',
                note.source_relative_path ?? '',
            ),
            note,
        ]),
    );
    const desiredKeys = new Set<string>();
    const syncTimestamp = new Date().toISOString();
    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    for (const docsFile of docsFiles) {
        const sourceKey = buildSourceKey(
            docsFile.source_worktree_path,
            docsFile.source_relative_path,
        );
        const existingNote = existingByKey.get(sourceKey);

        desiredKeys.add(sourceKey);

        if (!existingNote) {
            createdCount += 1;

            if (!options.dryRun) {
                await insertDocsSyncNote(
                    supabase,
                    docsFile,
                    envLabel,
                    syncRoot,
                    syncTimestamp,
                );
            }

            continue;
        }

        const shouldUpdate =
            existingNote.status !== ACTIVE_NOTE_STATUS ||
            existingNote.source_hash !== docsFile.source_hash;

        if (!shouldUpdate) {
            unchangedCount += 1;
            continue;
        }

        updatedCount += 1;

        if (!options.dryRun) {
            await updateDocsSyncNote(
                supabase,
                existingNote.id,
                existingNote.cli_tags,
                docsFile,
                envLabel,
                syncRoot,
                syncTimestamp,
            );
        }
    }

    const staleNotes = existingNotes.filter((note) => {
        const sourceKey = buildSourceKey(
            note.source_worktree_path ?? '',
            note.source_relative_path ?? '',
        );

        return (
            note.status !== ARCHIVED_NOTE_STATUS && !desiredKeys.has(sourceKey)
        );
    });
    const archivedCount = staleNotes.length;

    if (!options.dryRun && archivedCount > 0) {
        await archiveDocsSyncNotes(
            supabase,
            staleNotes.map((note) => note.id),
        );
    }

    return {
        archivedCount,
        createdCount,
        dryRun: options.dryRun ?? false,
        envLabel,
        syncRoot,
        scannedCount: docsFiles.length,
        unchangedCount,
        updatedCount,
    };
}

function resolveEnvironmentLabel(envLabel?: string): string {
    const candidate = envLabel?.trim() || os.hostname().trim();

    if (!candidate) {
        throw new DraftyError(
            'Could not determine a sync environment label. Pass --env <label> and try again.',
        );
    }

    return candidate;
}

function resolveSyncRoot(): string {
    return normalizeStoredPath(process.cwd());
}

async function discoverMarkdownFiles(
    syncRoot: string,
): Promise<DocsFileSnapshot[]> {
    const docsFiles = await collectMarkdownFiles(syncRoot, syncRoot);

    return docsFiles.sort((left, right) => {
        const leftKey = buildSourceKey(
            left.source_worktree_path,
            left.source_relative_path,
        );
        const rightKey = buildSourceKey(
            right.source_worktree_path,
            right.source_relative_path,
        );

        return leftKey.localeCompare(rightKey);
    });
}

async function collectMarkdownFiles(
    currentDirectory: string,
    syncRoot: string,
): Promise<DocsFileSnapshot[]> {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    const docsFiles: DocsFileSnapshot[] = [];

    for (const entry of entries.sort((left, right) =>
        left.name.localeCompare(right.name),
    )) {
        const absolutePath = path.join(currentDirectory, entry.name);

        if (entry.isDirectory()) {
            docsFiles.push(
                ...(await collectMarkdownFiles(absolutePath, syncRoot)),
            );
            continue;
        }

        if (!entry.isFile() || !/\.md$/iu.test(entry.name)) {
            continue;
        }

        const body = await readFile(absolutePath, 'utf8');
        const sourceRelativePath = normalizeStoredPath(
            path.relative(syncRoot, absolutePath),
        );

        docsFiles.push({
            body,
            source_hash: createHash('sha256').update(body, 'utf8').digest('hex'),
            source_relative_path: sourceRelativePath,
            source_worktree_path: normalizeStoredPath(syncRoot),
        });
    }

    return docsFiles;
}

async function listExistingDocsSyncNotes(
    supabase: SupabaseClient<Database>,
    envLabel: string,
    syncRoot: string,
): Promise<ExistingDocsSyncNote[]> {
    const { data, error } = await getNotesTable(supabase)
        .select(
            'id, cli_tags, status, source_hash, source_relative_path, source_worktree_path',
        )
        .eq('source_kind', DOCS_SYNC_SOURCE_KIND)
        .eq('source_env_label', envLabel)
        .eq('source_repo_root', syncRoot);

    if (error) {
        throw wrapSupabaseError('Failed to load synced docs notes', error);
    }

    return (data ?? []) as ExistingDocsSyncNote[];
}

async function insertDocsSyncNote(
    supabase: SupabaseClient<Database>,
    docsFile: DocsFileSnapshot,
    envLabel: string,
    syncRoot: string,
    syncTimestamp: string,
): Promise<void> {
    const { error } = await getNotesTable(supabase).insert({
        body: docsFile.body,
        cli_tags: [],
        is_readonly: true,
        source_env_label: envLabel,
        source_hash: docsFile.source_hash,
        source_kind: DOCS_SYNC_SOURCE_KIND,
        source_relative_path: docsFile.source_relative_path,
        source_repo_root: syncRoot,
        source_worktree_path: docsFile.source_worktree_path,
        status: ACTIVE_NOTE_STATUS,
        synced_at: syncTimestamp,
    });

    if (error) {
        throw wrapSupabaseError('Failed to create a synced docs note', error);
    }
}

async function updateDocsSyncNote(
    supabase: SupabaseClient<Database>,
    noteId: string,
    tags: string[],
    docsFile: DocsFileSnapshot,
    envLabel: string,
    syncRoot: string,
    syncTimestamp: string,
): Promise<void> {
    const { error } = await getNotesTable(supabase)
        .update({
            body: docsFile.body,
            cli_tags: tags,
            is_readonly: true,
            source_env_label: envLabel,
            source_hash: docsFile.source_hash,
            source_kind: DOCS_SYNC_SOURCE_KIND,
            source_relative_path: docsFile.source_relative_path,
            source_repo_root: syncRoot,
            source_worktree_path: docsFile.source_worktree_path,
            status: ACTIVE_NOTE_STATUS,
            synced_at: syncTimestamp,
        })
        .eq('id', noteId);

    if (error) {
        throw wrapSupabaseError('Failed to update a synced docs note', error);
    }
}

async function archiveDocsSyncNotes(
    supabase: SupabaseClient<Database>,
    ids: string[],
): Promise<void> {
    const { error } = await getNotesTable(supabase)
        .update({ status: ARCHIVED_NOTE_STATUS })
        .in('id', ids);

    if (error) {
        throw wrapSupabaseError('Failed to archive removed synced docs notes', error);
    }
}

function getNotesTable(supabase: SupabaseClient<Database>) {
    return (supabase as SupabaseClient<any>).from('notes');
}

function buildSourceKey(
    sourceWorktreePath: string,
    sourceRelativePath: string,
): string {
    return `${sourceWorktreePath}\u0000${sourceRelativePath}`;
}

function normalizeStoredPath(value: string): string {
    return value.replace(/\\/gu, '/');
}