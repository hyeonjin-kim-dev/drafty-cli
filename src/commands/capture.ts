import { createNotesClient, requireAuthenticatedSession } from '../lib/auth.js';
import { wrapSupabaseError } from '../lib/errors.js';
import { normalizeNoteBody } from '../lib/notes.js';
import { openEditor } from '../lib/editor.js';
import { parseTags } from '../lib/parse-tags.js';

export async function captureCommand(rawTags: string[]): Promise<void> {
    const session = await requireAuthenticatedSession();
    const tags = parseTags(rawTags);
    const draftedBody = await openEditor();
    const noteBody = normalizeNoteBody(draftedBody);

    if (!noteBody.trim()) {
        console.log('Empty note. Nothing was saved.');
        return;
    }

    const supabase = createNotesClient(session);
    const { data, error } = await supabase
        .from('notes')
        .insert({
            user_id: session.userId,
            body: noteBody,
            cli_tags: tags,
            status: 'active',
        })
        .select('id, cli_tags')
        .single();

    if (error) {
        throw wrapSupabaseError('Failed to save the note', error);
    }

    console.log(`Saved note: ${data.id}`);
    console.log(
        `Tags: ${data.cli_tags.length > 0 ? data.cli_tags.join(', ') : '(none)'}`,
    );
}
