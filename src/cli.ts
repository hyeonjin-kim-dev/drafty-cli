#!/usr/bin/env node

import { Command } from 'commander';

import { captureCommand } from './commands/capture.js';
import { editNoteCommand } from './commands/edit.js';
import { listNotesCommand } from './commands/list.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { removeNoteCommand } from './commands/remove.js';
import { showNoteCommand } from './commands/show.js';
import { loadDraftyEnv } from './lib/config.js';
import { formatError } from './lib/errors.js';

loadDraftyEnv();

async function main(): Promise<void> {
    const program = new Command();

    program
        .name('drafty')
        .description('Capture personal notes from your terminal.')
        .version('0.1.0')
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
        .description('List recent notes, optionally filtered by tag, or edit in a TTY menu')
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
            '  $ drafty rm <id>',
            '  $ drafty rm           # interactive multi-select in a TTY',
        ].join('\n'),
    );

    await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
    console.error(formatError(error));
    process.exitCode = 1;
});
