import type { SupabaseClient } from '@supabase/supabase-js';

import {
    archiveNote,
    filterNotesByBodyQuery,
    formatNoteEditMessages,
    formatTags,
    formatTimestamp,
    listNotes,
    summarizeNoteBody,
    type NoteSummary,
} from '../lib/notes.js';
import { parseTags } from '../lib/parse-tags.js';
import { createNotesClient } from '../lib/supabase.js';
import type { Database } from '../types/database.types.js';
import { promptForNoteSelection } from './interactive-list.js';
import { promptForNoteEdit } from './interactive-edit.js';
import { promptForNoteRemovalConfirmation } from './interactive-remove.js';

interface ListCommandOptions {
    initialSearchQuery?: string;
    emptyMessage?: string;
}

export async function listNotesCommand(
    rawTags: string[] = [],
    options: ListCommandOptions = {},
): Promise<void> {
    const supabase = createNotesClient();
    const tags = parseTags(rawTags);
    const initialSearchQuery = options.initialSearchQuery?.trim() ?? '';

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        const data = filterNotesByBodyQuery(
            await listNotes(supabase, { tags }),
            initialSearchQuery,
        );

        if (data.length === 0) {
            console.log(
                options.emptyMessage ??
                    buildEmptyNotesMessage(initialSearchQuery),
            );
            return;
        }

        printPlainNoteList(data);
        return;
    }

    await runInteractiveListLoop(supabase, tags, initialSearchQuery);
}

function printPlainNoteList(notes: NoteSummary[]): void {
    for (const note of notes) {
        console.log(`${note.id}  ${formatTimestamp(note.created_at)}`);
        console.log(`Summary: ${summarizeNoteBody(note.body)}`);
        console.log(`Tags: ${formatTags(note.cli_tags)}`);
        console.log('');
    }
}

async function runInteractiveListLoop(
    supabase: SupabaseClient<Database>,
    tags: string[],
    initialSearchQuery = '',
): Promise<void> {
    let activeFilterTag: string | null = null;
    let activeSearchQuery = initialSearchQuery;

    while (true) {
        const notes = await listNotes(supabase, { tags });

        if (notes.length === 0) {
            console.log('No notes found.');
            return;
        }

        const selection = await promptForNoteSelection(
            notes,
            activeFilterTag,
            activeSearchQuery,
        );

        if (!selection) {
            console.log('Canceled.');
            return;
        }

        activeFilterTag = selection.filterTag;
        activeSearchQuery = selection.searchQuery;

        if (selection.action === 'remove') {
            const selectedNote = notes.find(
                (note) => note.id === selection.noteId,
            );

            if (!selectedNote) {
                console.log('Selected note is no longer available.');
                continue;
            }

            const removed = await removeNoteFromList(supabase, selectedNote);

            if (removed) {
                continue;
            }

            continue;
        }

        const result = await promptForNoteEdit(supabase, selection.noteId);

        if (!result) {
            continue;
        }

        for (const line of formatNoteEditMessages(result)) {
            console.log(line);
        }
    }
}

async function removeNoteFromList(
    supabase: SupabaseClient<Database>,
    note: NoteSummary,
): Promise<boolean> {
    printSingleRemovalPreview(note);

    const confirmed = await promptForNoteRemovalConfirmation([note]);

    if (!confirmed) {
        console.log('Canceled.');
        return false;
    }

    const result = await archiveNote(supabase, note.id, { expectActive: true });

    if (result.outcome === 'archived') {
        console.log(`Removed note: ${result.noteId}`);
        return true;
    }

    console.log('Skipped note because it changed before removal.');
    return false;
}

function printSingleRemovalPreview(note: NoteSummary): void {
    console.log('Selected 1 note:');
    console.log(`- ${summarizeNoteBody(note.body, 56)}`);
    console.log(
        `  ${formatTimestamp(note.created_at)}  Tags: ${formatTags(note.cli_tags)}`,
    );
    console.log('');
}

function buildEmptyNotesMessage(searchQuery: string): string {
    return searchQuery
        ? `No notes matched the search query: ${searchQuery}`
        : 'No notes found.';
}
