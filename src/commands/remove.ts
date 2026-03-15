import type { SupabaseClient } from '@supabase/supabase-js';

import { DraftyError } from '../lib/errors.js';
import {
    archiveNote,
    archiveNotes,
    formatTags,
    formatTimestamp,
    getNoteById,
    listNotes,
    summarizeNoteBody,
    type ArchiveNoteResult,
    type NoteSummary,
} from '../lib/notes.js';
import { createNotesClient } from '../lib/supabase.js';
import type { Database } from '../types/database.types.js';
import {
    promptForNoteRemovalConfirmation,
    promptForNoteRemovalSelection,
} from './interactive-remove.js';

export async function removeNoteCommand(id?: string): Promise<void> {
    const supabase = createNotesClient();

    if (id) {
        await removeSingleNote(supabase, id);
        return;
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new DraftyError(
            'Interactive removal requires a TTY. Run `drafty rm <id>` for a single note.',
        );
    }

    await removeMultipleNotes(supabase);
}

async function removeSingleNote(
    supabase: SupabaseClient<Database>,
    id: string,
): Promise<void> {
    const note = await getNoteById(supabase, id);

    if (!note) {
        throw new DraftyError('Note not found.');
    }

    if (note.status === 'archived') {
        console.log('Already removed.');
        return;
    }

    printRemovalPreview([note]);

    const confirmed = await promptForNoteRemovalConfirmation([note]);

    if (!confirmed) {
        console.log('Canceled.');
        return;
    }

    const result = await archiveNote(supabase, id, { expectActive: true });

    if (result.outcome === 'archived') {
        console.log(`Removed note: ${result.noteId}`);
        return;
    }

    console.log('Skipped note because it changed before removal.');
}

async function removeMultipleNotes(
    supabase: SupabaseClient<Database>,
): Promise<void> {
    const notes = await listNotes(supabase);

    if (notes.length === 0) {
        console.log('No notes found.');
        return;
    }

    const selectedIds = await promptForNoteRemovalSelection(notes);

    if (selectedIds === null) {
        console.log('Canceled.');
        return;
    }

    if (selectedIds.length === 0) {
        console.log('No notes selected.');
        return;
    }

    const notesById = new Map(notes.map((note) => [note.id, note]));
    const selectedNotes = selectedIds
        .map((selectedId) => notesById.get(selectedId))
        .filter((note): note is NoteSummary => note !== undefined);

    printRemovalPreview(selectedNotes);

    const confirmed = await promptForNoteRemovalConfirmation(selectedNotes);

    if (!confirmed) {
        console.log('Canceled.');
        return;
    }

    const results = await archiveNotes(supabase, selectedIds, {
        expectActive: true,
    });

    printRemovalResults(selectedNotes, results);
}

function printRemovalPreview(notes: NoteSummary[]): void {
    const title =
        notes.length === 1
            ? 'Selected 1 note:'
            : `Selected ${notes.length} notes:`;

    console.log(title);

    for (const note of notes) {
        console.log(`- ${summarizeNoteBody(note.body, 56)}`);
        console.log(
            `  ${formatTimestamp(note.created_at)}  Tags: ${formatTags(note.cli_tags)}`,
        );
    }

    console.log('');
}

function printRemovalResults(
    selectedNotes: NoteSummary[],
    results: ArchiveNoteResult[],
): void {
    const archived = results.filter((result) => result.outcome === 'archived');
    const skipped = results.filter((result) => result.outcome === 'changed');
    const missing = results.filter((result) => result.outcome === 'not-found');
    const alreadyRemoved = results.filter(
        (result) => result.outcome === 'already-archived',
    );

    if (archived.length > 0) {
        console.log(
            archived.length === 1
                ? 'Removed 1 note.'
                : `Removed ${archived.length} notes.`,
        );
    }

    if (skipped.length > 0) {
        console.log(
            skipped.length === 1
                ? 'Skipped 1 note because it changed before removal.'
                : `Skipped ${skipped.length} notes because they changed before removal.`,
        );
        printResultDetails(selectedNotes, skipped);
    }

    if (missing.length > 0) {
        console.log(
            missing.length === 1
                ? 'Skipped 1 note because it no longer exists.'
                : `Skipped ${missing.length} notes because they no longer exist.`,
        );
        printResultDetails(selectedNotes, missing);
    }

    if (alreadyRemoved.length > 0) {
        console.log(
            alreadyRemoved.length === 1
                ? 'Skipped 1 note because it was already removed.'
                : `Skipped ${alreadyRemoved.length} notes because they were already removed.`,
        );
        printResultDetails(selectedNotes, alreadyRemoved);
    }
}

function printResultDetails(
    selectedNotes: NoteSummary[],
    results: ArchiveNoteResult[],
): void {
    const notesById = new Map(selectedNotes.map((note) => [note.id, note]));

    for (const result of results) {
        const note = notesById.get(result.noteId);

        if (!note) {
            console.log(`- ${result.noteId}`);
            continue;
        }

        console.log(
            `- ${summarizeNoteBody(note.body, 56)} (${shortNoteId(note.id)})`,
        );
    }
}

function shortNoteId(id: string): string {
    return id.slice(0, 8);
}
