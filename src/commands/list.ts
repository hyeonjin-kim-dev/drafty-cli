import { createNotesClient, requireAuthenticatedSession } from '../lib/auth.js';
import { wrapSupabaseError } from '../lib/errors.js';

export async function listNotesCommand(): Promise<void> {
    const session = await requireAuthenticatedSession();
    const supabase = createNotesClient(session);
    const { data, error } = await supabase
        .from('notes')
        .select('id, cli_tags, status, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        throw wrapSupabaseError('Failed to load notes', error);
    }

    if (data.length === 0) {
        console.log('No notes found.');
        return;
    }

    for (const note of data) {
        console.log(
            `${note.id}  ${formatTimestamp(note.created_at)}  [${note.status}]`,
        );
        console.log(
            `Tags: ${note.cli_tags.length > 0 ? note.cli_tags.join(', ') : '(none)'}`,
        );
        console.log('');
    }
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
