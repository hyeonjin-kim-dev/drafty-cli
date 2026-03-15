import { createNotesClient, requireAuthenticatedSession } from '../lib/auth.js';
import { formatNoteEditMessages } from '../lib/notes.js';
import { promptForNoteEdit } from './interactive-edit.js';

export async function editNoteCommand(id: string): Promise<void> {
    const session = await requireAuthenticatedSession();
    const supabase = createNotesClient(session);
    const result = await promptForNoteEdit(supabase, id);

    if (!result) {
        console.log('Canceled.');
        return;
    }

    for (const line of formatNoteEditMessages(result)) {
        console.log(line);
    }
}