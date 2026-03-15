#!/usr/bin/env node

import 'dotenv/config';

import { Command } from 'commander';

import { captureCommand } from './commands/capture.js';
import { editNoteCommand } from './commands/edit.js';
import { listNotesCommand } from './commands/list.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { removeNoteCommand } from './commands/remove.js';
import { showNoteCommand } from './commands/show.js';
import { whoamiCommand } from './commands/whoami.js';
import { formatError } from './lib/errors.js';

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
        .description(
            'Request an email sign-in code and enter it in the terminal',
        )
        .action(async () => {
            await loginCommand();
        });

    program
        .command('logout')
        .description('Remove the local Drafty session')
        .action(async () => {
            await logoutCommand();
        });

    program
        .command('whoami')
        .description('Show the current logged-in account')
        .action(async () => {
            await whoamiCommand();
        });

    program
        .command('list')
        .description('List recent notes or choose one to edit in a TTY menu')
        .action(async () => {
            await listNotesCommand();
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
            'Auth:',
            '  Drafty expects a 6-digit code in the email, not a browser redirect.',
            '  If the email only contains a link, fix your Supabase Email Templates.',
            '',
            'Examples:',
            '  $ drafty work idea',
            '  $ drafty login',
            '  $ drafty edit <id>    # choose body or tags',
            '  $ drafty list',
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
