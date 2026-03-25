import type { SupabaseClient } from '@supabase/supabase-js';

import {
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

export async function listNotesCommand(rawTags: string[] = []): Promise<void> {
    const supabase = createNotesClient();
    const tags = parseTags(rawTags);

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        const data = await listNotes(supabase, { tags });

        if (data.length === 0) {
            console.log('No notes found.');
            return;
        }

        printPlainNoteList(data);
        return;
    }

    await runInteractiveListLoop(supabase, tags);
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
): Promise<void> {
    while (true) {
        const notes = await listNotes(supabase, { tags });

        if (notes.length === 0) {
            console.log('No notes found.');
            return;
        }

        const selectedNoteId = await promptForNoteSelection(notes);

        if (!selectedNoteId) {
            console.log('Canceled.');
            return;
        }

        const result = await promptForNoteEdit(supabase, selectedNoteId);

        if (!result) {
            continue;
        }

        for (const line of formatNoteEditMessages(result)) {
            console.log(line);
        }
    }
}
