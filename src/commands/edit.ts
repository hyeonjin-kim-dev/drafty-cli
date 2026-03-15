import { createNotesClient, requireAuthenticatedSession } from '../lib/auth.js';
import { editNoteBody, formatNoteEditMessages } from '../lib/notes.js';

export async function editNoteCommand(id: string): Promise<void> {
    const session = await requireAuthenticatedSession();
    const supabase = createNotesClient(session);
    const result = await editNoteBody(supabase, id);

    for (const line of formatNoteEditMessages(result)) {
        console.log(line);
    }
}