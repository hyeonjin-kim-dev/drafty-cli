import { DraftyError } from '../lib/errors.js';
import {
    normalizeStoredMarkdownBodies,
    planMarkdownNormalization,
    summarizeNoteBody,
    type MarkdownNormalizationCandidate,
} from '../lib/notes.js';
import { promptForConfirmation } from '../lib/prompt.js';
import { createNotesClient } from '../lib/supabase.js';

const PREVIEW_LIMIT = 5;

export async function normalizeMarkdownCommand(options: {
    dryRun: boolean;
    yes: boolean;
}): Promise<void> {
    const supabase = createNotesClient();
    const plan = await planMarkdownNormalization(supabase);

    console.log(
        plan.scannedCount === 1
            ? 'Scanned 1 note.'
            : `Scanned ${plan.scannedCount} notes.`,
    );

    if (plan.candidateCount === 0) {
        console.log('No stored notes need markdown normalization.');
        return;
    }

    console.log(
        plan.candidateCount === 1
            ? 'Found 1 note that needs markdown normalization.'
            : `Found ${plan.candidateCount} notes that need markdown normalization.`,
    );
    printNormalizationPreview(plan.candidates);

    if (options.dryRun) {
        console.log('Dry run only. No notes were updated.');
        return;
    }

    if (!options.yes) {
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
            throw new DraftyError(
                'This command needs confirmation. Re-run with --yes to apply markdown normalization in non-interactive mode.',
            );
        }

        const confirmed = await promptForConfirmation(
            buildConfirmationMessage(plan.candidateCount),
            false,
        );

        if (!confirmed) {
            console.log('Canceled.');
            return;
        }
    }

    const result = await normalizeStoredMarkdownBodies(supabase);

    if (result.updatedCount === 0 && result.skippedCount === 0) {
        console.log('No stored notes needed markdown normalization.');
        return;
    }

    if (result.updatedCount > 0) {
        console.log(
            result.updatedCount === 1
                ? 'Normalized 1 note.'
                : `Normalized ${result.updatedCount} notes.`,
        );
    }

    if (result.skippedCount > 0) {
        console.log(
            result.skippedCount === 1
                ? 'Skipped 1 note because it changed before normalization.'
                : `Skipped ${result.skippedCount} notes because they changed before normalization.`,
        );
    }
}

function printNormalizationPreview(
    candidates: MarkdownNormalizationCandidate[],
): void {
    console.log('Preview of notes to update:');

    for (const candidate of candidates.slice(0, PREVIEW_LIMIT)) {
        console.log(
            `- ${summarizeNoteBody(candidate.body, 56)} (${shortNoteId(candidate.id)}, ${candidate.status})`,
        );
    }

    if (candidates.length > PREVIEW_LIMIT) {
        console.log(`- ...and ${candidates.length - PREVIEW_LIMIT} more`);
    }

    console.log('');
}

function buildConfirmationMessage(candidateCount: number): string {
    return candidateCount === 1
        ? 'Normalize stored markdown in this note?'
        : `Normalize stored markdown in these ${candidateCount} notes?`;
}

function shortNoteId(id: string): string {
    return id.slice(0, 8);
}
