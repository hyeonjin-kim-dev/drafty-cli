import { createNotesClient, requireAuthenticatedSession } from '../lib/auth.js';
import { DraftyError } from '../lib/errors.js';
import { formatTags, formatTimestamp, getNoteById } from '../lib/notes.js';

export async function showNoteCommand(id: string): Promise<void> {
    const session = await requireAuthenticatedSession();
    const supabase = createNotesClient(session);
    const data = await getNoteById(supabase, id);

    if (!data) {
        throw new DraftyError('Note not found.');
    }

    console.log(`ID: ${data.id}`);
    console.log(`Status: ${data.status}`);
    console.log(`Created: ${formatTimestamp(data.created_at)}`);
    console.log(`Updated: ${formatTimestamp(data.updated_at)}`);
    console.log(`Tags: ${formatTags(data.cli_tags)}`);
    console.log('');
    console.log(data.body);
}
