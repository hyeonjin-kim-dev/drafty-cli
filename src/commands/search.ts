import { DraftyError } from '../lib/errors.js';
import { listNotesCommand } from './list.js';

export async function searchNotesCommand(
    rawQueryParts: string[] = [],
): Promise<void> {
    const query = rawQueryParts.join(' ').trim();

    if (!query) {
        throw new DraftyError('Search query is required.');
    }

    await listNotesCommand([], {
        initialSearchQuery: query,
        emptyMessage: `No notes matched the search query: ${query}`,
    });
}
