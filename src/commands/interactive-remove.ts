import checkbox from '@inquirer/checkbox';

import { formatTags, formatTimestamp, summarizeNoteBody, type NoteSummary } from '../lib/notes.js';
import { promptForConfirmation } from '../lib/prompt.js';
import { isPromptCancellation } from './interactive-edit.js';

export async function promptForNoteRemovalSelection(
    notes: NoteSummary[],
): Promise<string[] | null> {
    try {
        return await checkbox<string>({
            message: 'Select notes to remove',
            pageSize: 10,
            choices: notes.map((note) => ({
                name: summarizeNoteBody(note.body, 64),
                value: note.id,
                description: [
                    formatTimestamp(note.created_at),
                    `Tags: ${formatTags(note.cli_tags)}`,
                    `ID: ${shortNoteId(note.id)}`,
                ].join('  '),
            })),
        });
    } catch (error) {
        if (isPromptCancellation(error)) {
            return null;
        }

        throw error;
    }
}

export async function promptForNoteRemovalConfirmation(
    notes: NoteSummary[],
): Promise<boolean | null> {
    const message =
        notes.length === 1
            ? 'Remove this note?'
            : `Remove these ${notes.length} notes?`;

    try {
        return await promptForConfirmation(message);
    } catch (error) {
        if (isPromptCancellation(error)) {
            return null;
        }

        throw error;
    }
}

function shortNoteId(id: string): string {
    return id.slice(0, 8);
}