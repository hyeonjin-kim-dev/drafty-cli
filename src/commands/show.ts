import { createNotesClient, requireAuthenticatedSession } from '../lib/auth.js';
import { DraftyError, wrapSupabaseError } from '../lib/errors.js';

export async function showNoteCommand(id: string): Promise<void> {
    const session = await requireAuthenticatedSession();
    const supabase = createNotesClient(session);
    const { data, error } = await supabase
        .from('notes')
        .select('id, body, cli_tags, status, created_at, updated_at')
        .eq('id', id)
        .maybeSingle();

    if (error) {
        throw wrapSupabaseError('Failed to load the note', error);
    }

    if (!data) {
        throw new DraftyError('Note not found.');
    }

    console.log(`ID: ${data.id}`);
    console.log(`Status: ${data.status}`);
    console.log(`Created: ${formatTimestamp(data.created_at)}`);
    console.log(`Updated: ${formatTimestamp(data.updated_at)}`);
    console.log(
        `Tags: ${data.cli_tags.length > 0 ? data.cli_tags.join(', ') : '(none)'}`,
    );
    console.log('');
    console.log(data.body);
}

function formatTimestamp(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
}
