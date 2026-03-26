#!/usr/bin/env node

import { Command } from 'commander';

import { captureCommand } from './commands/capture.js';
import { editNoteCommand } from './commands/edit.js';
import { listNotesCommand } from './commands/list.js';
import { loginCommand } from './commands/login.js';
import { normalizeMarkdownCommand } from './commands/normalize-markdown.js';
import { logoutCommand } from './commands/logout.js';
import { removeNoteCommand } from './commands/remove.js';
import { searchNotesCommand } from './commands/search.js';
import { showNoteCommand } from './commands/show.js';
import { updateCommand } from './commands/update.js';
import { loadDraftyEnv } from './lib/config.js';
import { formatError } from './lib/errors.js';
import { PACKAGE_VERSION } from './lib/package-meta.js';

loadDraftyEnv();

async function main(): Promise<void> {
    const program = new Command();

    program
        .name('drafty')
        .description('Capture personal notes from your terminal.')
        .version(PACKAGE_VERSION)
        .argument('[tags...]', 'tags to attach to the note')
        .action(async (tags: string[] = []) => {
            await captureCommand(tags);
        });

    program
        .command('login')
        .description('Save your Supabase URL, anon key, and project id')
        .action(async () => {
            await loginCommand();
        });

    program
        .command('logout')
        .description('Remove the saved Drafty config')
        .action(async () => {
            await logoutCommand();
        });

    program
        .command('list')
        .description(
            'List recent notes, optionally filtered by tag, or edit in a TTY menu',
        )
        .argument('[tags...]', 'filter active notes by tag (matches any tag)')
        .action(async (tags: string[] = []) => {
            await listNotesCommand(tags);
        });

    program
        .command('edit')
        .description('Edit a single note body or tags by id')
        .argument('<id>', 'note id')
        .action(async (id: string) => {
            await editNoteCommand(id);
        });

    program
        .command('search')
        .description(
            'Search active note bodies, or browse matches in a TTY menu',
        )
        .argument('<query...>', 'search active note bodies for a phrase')
        .action(async (queryParts: string[] = []) => {
            await searchNotesCommand(queryParts);
        });

    program
        .command('rm')
        .description('Remove one note by id or select multiple notes in a TTY')
        .argument('[id]', 'note id')
        .action(async (id?: string) => {
            await removeNoteCommand(id);
        });

    program
        .command('show')
        .description('Show a single note by id')
        .argument('<id>', 'note id')
        .action(async (id: string) => {
            await showNoteCommand(id);
        });

    program
        .command('update')
        .description('Check for a newer version and update if available')
        .option('--check', 'show current and latest version without installing')
        .action(async (options: { check?: boolean }) => {
            await updateCommand({ check: options.check ?? false });
        });

    program
        .command('normalize-markdown')
        .description(
            'Normalize stored notes by repairing escaped markdown symbols and HTML entities in existing data',
        )
        .option(
            '--dry-run',
            'show how many notes would be updated without writing changes',
        )
        .option('--yes', 'apply changes without asking for confirmation')
        .action(async (options: { dryRun?: boolean; yes?: boolean }) => {
            await normalizeMarkdownCommand({
                dryRun: options.dryRun ?? false,
                yes: options.yes ?? false,
            });
        });

    program.addHelpText(
        'after',
        [
            '',
            'Setup:',
            '  Run `drafty login` once to save SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_PROJECT_ID.',
            '  Apply the checked-in Supabase migrations before using Drafty against a new project.',
            '',
            'Examples:',
            '  $ drafty work idea',
            '  $ drafty login',
            '  $ drafty edit <id>    # choose body or tags',
            '  $ drafty list',
            '  $ drafty list todo idea',
            '  $ drafty search meeting notes',
            '  $ drafty rm <id>',
            '  $ drafty rm           # interactive multi-select in a TTY',
            '  $ drafty update       # update to the latest version',
            '  $ drafty update --check  # show available version without installing',
            '  $ drafty normalize-markdown --dry-run  # preview stored note cleanup',
        ].join('\n'),
    );

    await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
    console.error(formatError(error));
    process.exitCode = 1;
});
