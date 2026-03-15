import select from '@inquirer/select';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
    editNoteBody,
    editNoteTags,
    type NoteEditResult,
    type NoteEditTarget,
} from '../lib/notes.js';
import type { Database } from '../types/database.types.js';

export async function promptForNoteEdit(
    supabase: SupabaseClient<Database>,
    noteId: string,
): Promise<NoteEditResult | null> {
    const target = await promptForNoteEditTarget();

    if (!target) {
        return null;
    }

    if (target === 'tags') {
        return editNoteTags(supabase, noteId);
    }

    return editNoteBody(supabase, noteId);
}

export async function promptForNoteEditTarget(): Promise<
    NoteEditTarget | null
> {
    try {
        return await select<NoteEditTarget>({
            message: 'What would you like to edit?',
            choices: [
                {
                    name: 'Body',
                    value: 'body',
                    description: 'Open the note body in your editor',
                },
                {
                    name: 'Tags',
                    value: 'tags',
                    description: 'Edit tags as a single space-separated line',
                },
            ],
        });
    } catch (error) {
        if (isPromptCancellation(error)) {
            return null;
        }

        throw error;
    }
}

export function isPromptCancellation(error: unknown): boolean {
    return error instanceof Error && error.name === 'ExitPromptError';
}