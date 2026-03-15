import { formatNoteEditMessages } from '../lib/notes.js';
import { createNotesClient } from '../lib/supabase.js';
import { promptForNoteEdit } from './interactive-edit.js';

export async function editNoteCommand(id: string): Promise<void> {
    const supabase = createNotesClient();
    const result = await promptForNoteEdit(supabase, id);

    if (!result) {
        console.log('Canceled.');
        return;
    }

    for (const line of formatNoteEditMessages(result)) {
        console.log(line);
    }
}
