import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { syncDocsNotes } from '../src/lib/sync-docs.js';

interface FakeNote {
    body: string;
    cli_tags: string[];
    id: string;
    is_readonly: boolean;
    source_env_label: string;
    source_hash: string;
    source_kind: string;
    source_relative_path: string;
    source_repo_root: string;
    source_worktree_path: string;
    status: string;
    synced_at: string;
}

class SelectQuery {
    private readonly filters: Array<(note: FakeNote) => boolean> = [];

    constructor(private readonly notes: FakeNote[]) {}

    eq(column: keyof FakeNote, value: string): this {
        this.filters.push((note) => note[column] === value);
        return this;
    }

    then<TResult1 = { data: FakeNote[]; error: null }>(
        resolve?: ((value: { data: FakeNote[]; error: null }) => TResult1) | null,
    ): Promise<TResult1> {
        const result = {
            data: this.notes.filter((note) =>
                this.filters.every((filter) => filter(note)),
            ),
            error: null,
        } as const;

        return Promise.resolve(resolve ? resolve(result) : (result as TResult1));
    }
}

class UpdateQuery {
    private readonly filters: Array<(note: FakeNote) => boolean> = [];

    constructor(
        private readonly notes: FakeNote[],
        private readonly values: Partial<FakeNote>,
    ) {}

    eq(column: keyof FakeNote, value: string): this {
        this.filters.push((note) => note[column] === value);
        return this;
    }

    in(column: keyof FakeNote, values: string[]): this {
        this.filters.push((note) => values.includes(note[column]));
        return this;
    }

    then<TResult1 = { error: null }>(
        resolve?: ((value: { error: null }) => TResult1) | null,
    ): Promise<TResult1> {
        for (const note of this.notes) {
            if (this.filters.every((filter) => filter(note))) {
                Object.assign(note, this.values);
            }
        }

        const result = { error: null } as const;
        return Promise.resolve(resolve ? resolve(result) : (result as TResult1));
    }
}

class FakeSupabaseClient {
    readonly notes: FakeNote[] = [];
    private nextId = 1;

    from(table: string) {
        assert.equal(table, 'notes');

        return {
            insert: async (values: Omit<FakeNote, 'id'>) => {
                this.notes.push({
                    id: String(this.nextId++),
                    ...values,
                });

                return { error: null };
            },
            select: () => new SelectQuery(this.notes),
            update: (values: Partial<FakeNote>) =>
                new UpdateQuery(this.notes, values),
        };
    }
}

const temporaryDirectories: string[] = [];
const originalCwd = process.cwd();

afterEach(async () => {
    process.chdir(originalCwd);

    await Promise.all(
        temporaryDirectories.splice(0).map((directory) =>
            rm(directory, { force: true, recursive: true }),
        ),
    );
});

async function createWorkspace(): Promise<{
    childDir: string;
    parentDir: string;
    siblingDir: string;
}> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'drafty-sync-test-'));
    const parentDir = path.join(root, 'parent');
    const childDir = path.join(parentDir, 'child');
    const siblingDir = path.join(parentDir, 'sibling');

    temporaryDirectories.push(root);
    await mkdir(childDir, { recursive: true });
    await mkdir(siblingDir, { recursive: true });

    return { childDir, parentDir, siblingDir };
}

test('sync updates the same note when rerun from a nested child directory', async () => {
    const { childDir, parentDir } = await createWorkspace();
    const notePath = path.join(childDir, 'text.md');
    const supabase = new FakeSupabaseClient();
    const envLabel = 'nested-sync';

    await writeFile(notePath, 'first version\n', 'utf8');

    process.chdir(parentDir);
    const firstSync = await syncDocsNotes(supabase as never, { envLabel });

    await writeFile(notePath, 'second version\n', 'utf8');

    process.chdir(childDir);
    const secondSync = await syncDocsNotes(supabase as never, { envLabel });

    assert.equal(firstSync.createdCount, 1);
    assert.equal(secondSync.createdCount, 0);
    assert.equal(secondSync.updatedCount, 1);
    assert.equal(secondSync.archivedCount, 0);
    assert.equal(supabase.notes.length, 1);
    assert.equal(supabase.notes[0]?.body, 'second version\n');
});

test('sync from a child directory only archives removed notes inside that subtree', async () => {
    const { childDir, parentDir, siblingDir } = await createWorkspace();
    const childNotePath = path.join(childDir, 'text.md');
    const siblingNotePath = path.join(siblingDir, 'other.md');
    const supabase = new FakeSupabaseClient();
    const envLabel = 'archive-scope';

    await writeFile(childNotePath, 'child version\n', 'utf8');
    await writeFile(siblingNotePath, 'sibling version\n', 'utf8');

    process.chdir(parentDir);
    await syncDocsNotes(supabase as never, { envLabel });

    await rm(childNotePath);

    process.chdir(childDir);
    const childSync = await syncDocsNotes(supabase as never, { envLabel });

    assert.equal(childSync.archivedCount, 1);

    const archivedChild = supabase.notes.find(
        (note) => note.source_relative_path === 'child/text.md',
    );
    const activeSibling = supabase.notes.find(
        (note) => note.source_relative_path === 'sibling/other.md',
    );

    assert.equal(archivedChild?.status, 'archived');
    assert.equal(activeSibling?.status, 'active');
});
