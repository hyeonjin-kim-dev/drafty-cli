import { DraftyError } from '../lib/errors.js';
import {
    formatNoteSourcePath,
    formatNoteSourceSummary,
    formatTags,
    formatTimestamp,
    getNoteById,
    isReadonlyNote,
} from '../lib/notes.js';
import { createNotesClient } from '../lib/supabase.js';

export async function showNoteCommand(id: string): Promise<void> {
    const supabase = createNotesClient();
    const data = await getNoteById(supabase, id);

    if (!data) {
        throw new DraftyError('Note not found.');
    }

    console.log(`ID: ${data.id}`);
    console.log(`Status: ${data.status}`);
    console.log(`Created: ${formatTimestamp(data.created_at)}`);
    console.log(`Updated: ${formatTimestamp(data.updated_at)}`);
    console.log(`Readonly: ${isReadonlyNote(data) ? 'yes' : 'no'}`);
    console.log(`Tags: ${formatTags(data.cli_tags)}`);

    const sourceSummary = formatNoteSourceSummary(data);

    if (sourceSummary) {
        console.log(`Source: ${sourceSummary}`);
    }

    const sourcePath = formatNoteSourcePath(data);

    if (sourcePath) {
        console.log(`Source path: ${sourcePath}`);
    }

    console.log('');
    console.log(data.body);
}
