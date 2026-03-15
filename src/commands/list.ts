import select from '@inquirer/select';

import { createNotesClient, requireAuthenticatedSession } from '../lib/auth.js';
import {
    editNoteBody,
    formatNoteEditMessages,
    formatTags,
    formatTimestamp,
    listNotes,
    summarizeNoteBody,
    type NoteSummary,
} from '../lib/notes.js';

export async function listNotesCommand(): Promise<void> {
    const session = await requireAuthenticatedSession();
    const supabase = createNotesClient(session);
    const data = await listNotes(supabase);

    if (data.length === 0) {
        console.log('No notes found.');
        return;
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        printPlainNoteList(data);
        return;
    }

    try {
        const selectedNoteId = await select({
            message: 'Select a note to edit',
            pageSize: 10,
            choices: data.map((note) => ({
                name: summarizeNoteBody(note.body, 64),
                value: note.id,
                description: [
                    formatTimestamp(note.created_at),
                    `[${note.status}]`,
                    `Tags: ${formatTags(note.cli_tags)}`,
                    `ID: ${shortNoteId(note.id)}`,
                ].join('  '),
            })),
        });

        const result = await editNoteBody(supabase, selectedNoteId);

        for (const line of formatNoteEditMessages(result)) {
            console.log(line);
        }
    } catch (error) {
        if (isPromptCancellation(error)) {
            console.log('Canceled.');
            return;
        }

        throw error;
    }
}

function printPlainNoteList(notes: NoteSummary[]): void {
    for (const note of notes) {
        console.log(
            `${note.id}  ${formatTimestamp(note.created_at)}  [${note.status}]`,
        );
        console.log(`Tags: ${formatTags(note.cli_tags)}`);
        console.log('');
    }
}

function isPromptCancellation(error: unknown): boolean {
    return error instanceof Error && error.name === 'ExitPromptError';
}

function shortNoteId(id: string): string {
    return id.slice(0, 8);
}
