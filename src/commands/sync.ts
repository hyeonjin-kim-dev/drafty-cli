import { createNotesClient } from '../lib/supabase.js';
import { syncDocsNotes, type SyncDocsOptions } from '../lib/sync-docs.js';

interface SyncDocsCommandOptions extends SyncDocsOptions {}

export async function syncDocsCommand(
    options: SyncDocsCommandOptions = {},
): Promise<void> {
    const supabase = createNotesClient();
    const result = await syncDocsNotes(supabase, options);
    const actionPrefix = result.dryRun ? 'Dry run:' : 'Synced markdown:';

    console.log(
        `${actionPrefix} scanned ${result.scannedCount} markdown file(s) under the current directory.`,
    );
    console.log(`Environment: ${result.envLabel}`);
    console.log(`Root: ${result.syncRoot}`);
    console.log(
        `Created ${result.createdCount}, updated ${result.updatedCount}, archived ${result.archivedCount}, unchanged ${result.unchangedCount}.`,
    );
}
